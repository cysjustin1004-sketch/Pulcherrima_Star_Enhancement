const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { atomicUpdate } = require('../../lib/atomic-update');
const { withActionLog } = require('../../lib/action-log');
const { isRateLimited } = require('../../lib/rate-limit');
const { createPaymentRequest, getPaymentRequest } = require('../../lib/sada-coin');
const { SHOP_ITEMS, COIN_SHOP_ITEMS, stageKey, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

async function buy(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { itemId } = req.body;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return res.status(400).json({ ok: false, error: '존재하지 않는 상품입니다.' });

  // 읽기(get)와 쓰기(update)를 분리하면, 동시에 여러 구매 요청을 보낼 때 전부
  // "차감 전" 스냅샷으로 수소 검증을 통과해서, 도약권처럼 성공/실패 판정(RNG)이 있는
  // 상품은 "1번 결제로 여러 번 재도전"하는 레이스 컨디션이 생긴다. atomicUpdate()
  // (ETag 조건부 쓰기)로 읽기·검증·쓰기를 원자적으로 묶어 이 레이스를 차단한다.
  let outcome = null;

  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (user === null) return undefined; // 유저 없음 — abort, 바깥에서 404 처리
    if (user.banned) {
      outcome = { error: '정지된 계정입니다.', status: 403 };
      return undefined;
    }

    if ((user.hydrogen || 0) < item.price) {
      outcome = { error: '수소가 부족합니다.', status: 400 };
      return undefined;
    }
    // 이미 목표 단계 이상이면 성공해도 오히려 단계가 낮아지므로 구매 자체를 막는다
    // (클라이언트에도 동일 검증이 있지만, API 직접 호출을 막으려면 서버에도 필요).
    if (item.type === 'warp' && (user.currentStar || 0) >= item.targetLevel) {
      outcome = { error: '현재 단계보다 낮은 도약권은 사용할 수 없습니다.', status: 400 };
      return undefined;
    }
    // 실패 미해결 상태(pendingFailure)에서 도약권이 성공하면 currentStar가 그냥
    // 덮어써져서, 방지권/파괴 대가 없이 위험했던 별의 실패가 통째로 사라진다 —
    // protection()으로 먼저 해결하도록 강제한다(방지권 구매 자체는 막을 이유가 없어 warp만 차단).
    if (item.type === 'warp' && user.pendingFailure) {
      outcome = { error: '이전 강화 실패를 먼저 처리하세요.', status: 409 };
      return undefined;
    }

    // 충돌 시 최신 데이터로 재호출될 수 있으므로, 매번 user를 얕은 복제해
    // 다음 상태(next)를 구성한다 — 이전 호출의 잔여 상태가 섞이지 않는다.
    const next = { ...user };
    next.hydrogen = (user.hydrogen || 0) - item.price;

    let warpSuccess = null;

    if (item.type === 'warp') {
      // 도약권은 아이템별 성공 확률제 — 가격은 시도한 것만으로 항상 소모되고, 실패하면
      // 수소만 잃고 현재 단계는 그대로 유지된다(강화 실패처럼 0강으로 떨어지지 않음).
      warpSuccess = Math.random() < item.successRate;
      if (warpSuccess) {
        // currentStar를 해당 레벨로 설정. 공통구간(0~13강)을 넘어서는 도약이면
        // 강화로 13→14강을 넘을 때와 동일하게 트랙을 무작위로 새로 배정해야 한다.
        let warpTrack = user.track || null;
        if (item.targetLevel > 13) {
          warpTrack = TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)];
          next.track = warpTrack;
        }
        next.currentStar = item.targetLevel;
        const unlocked = [...(user.unlockedCodex || [])];
        for (let lv = 1; lv <= item.targetLevel; lv++) {
          const key = stageKey(lv, lv <= 13 ? null : warpTrack);
          if (!unlocked.includes(key)) unlocked.push(key);
        }
        next.unlockedCodex = unlocked;
        if (item.targetLevel > (user.bestStar || 0)) {
          next.bestStar = item.targetLevel;
        }
      }
    } else if (item.type === 'protection') {
      // 방지권: 보유 수량 추가
      next.protectionScrolls = (user.protectionScrolls || 0) + item.amount;
    }

    outcome = { ok: true, itemId, price: item.price, warpSuccess };
    return next;
  });

  if (!txResult.committed) {
    if (outcome && outcome.error) {
      return res.status(outcome.status).json({ ok: false, error: outcome.error });
    }
    return res.status(404).json({ ok: false, error: '유저 없음' });
  }

  res.json(outcome);
}

// ============================================================
// 사다코인 상점 — 수소 충전 / 특별상품(+19강·+21강). 사다코인 결제는 즉시 확정이
// 아니라 "결제 요청 생성 → 학생 본인이 사다코인 화면에서 승인" 방식이라, 회원가입
// 결제(api/auth/[action].js)와 동일한 요청→폴링→확정 3단계 패턴을 그대로 쓴다.
// 이쪽은 구매자가 이미 로그인 상태이므로, 회원가입 때 썼던 별도 confirmToken 없이
// 세션의 userKey와 pendingCoinPurchases에 저장된 userKey를 직접 대조해 소유권을
// 확인한다(세션 없는 가입 흐름보다 오히려 더 강한 보호).
// ============================================================

const COIN_PAYMENT_STATUS_MESSAGES = {
  pending:  '아직 결제가 승인되지 않았습니다. 사다코인에서 승인해주세요.',
  rejected: '결제가 거부되었습니다.',
  expired:  '결제 요청이 만료되었습니다. 처음부터 다시 시도해주세요.',
  canceled: '결제 요청이 취소되었습니다.',
};

/** 회원가입과 달리 구매는 로그인 상태에서 일어나므로, 사다코인 학번은
 * userIdentities(비공개 노드)에서 조회한다. 0000(선생님/외부인)은 사다코인에
 * 대응하는 실제 학번이 없어 결제 자체가 불가능하므로 구매를 막는다. */
async function getPurchaserStudentId(userKey) {
  const snap = await db.ref(`userIdentities/${userKey}`).get();
  const sid = snap.exists() ? snap.val().studentId : null;
  return sid && sid !== '0000' ? sid : null;
}

async function coinBuyRequest(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { itemId } = req.body;
  const item = COIN_SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return res.status(400).json({ ok: false, error: '존재하지 않는 상품입니다.' });

  const userSnap = await db.ref(`users/${userKey}`).get();
  if (!userSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const user = userSnap.val();
  if (user.banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  if (item.type === 'star' && (user.currentStar || 0) >= item.targetLevel) {
    return res.status(400).json({ ok: false, error: '이미 그 단계 이상입니다.' });
  }

  const sid = await getPurchaserStudentId(userKey);
  if (!sid) {
    return res.status(400).json({ ok: false, error: '사다코인 학번이 없어 구매할 수 없습니다.' });
  }

  // 본인 사다코인 화면에 승인 창을 반복해서 띄우는 남용을 막는 가벼운 방어선.
  if (isRateLimited(`coinbuy:${userKey}`, 5)) {
    return res.status(429).json({ ok: false, error: '잠시 후 다시 시도해주세요.' });
  }

  const payment = await createPaymentRequest(sid, item.coinPrice, item.name);
  if (!payment.ok) {
    return res.status(payment.status).json({ ok: false, error: payment.error });
  }

  await db.ref(`pendingCoinPurchases/${payment.requestId}`).set({
    userKey, itemId, coinPrice: item.coinPrice, createdAt: Date.now(),
  });

  res.json({
    ok: true, needsApproval: true,
    requestId: payment.requestId, expiresAt: payment.expiresAt,
  });
}

/** 회원가입 상태 폴링과 동일한 역할 — 계정/유저 데이터는 건드리지 않고 상태만 조회. */
async function coinBuyStatus(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const requestId = req.body && req.body.requestId;
  if (!requestId) return res.status(400).json({ ok: false, error: '요청 정보가 없습니다.' });

  const [pendingSnap, paidSnap] = await Promise.all([
    db.ref(`pendingCoinPurchases/${requestId}`).get(),
    db.ref(`coinShopPayments/${requestId}`).get(),
  ]);
  const owner = pendingSnap.exists() ? pendingSnap.val().userKey
              : paidSnap.exists()    ? paidSnap.val().userKey
              : null;
  if (owner !== userKey) {
    return res.status(403).json({ ok: false, error: '접근 권한이 없습니다.' });
  }

  const result = await getPaymentRequest(requestId);
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
  res.json({ ok: true, status: result.status });
}

/**
 * 사다코인 상점 확정 — 결제가 approved 상태일 때만 지급한다. 이미 처리된
 * 요청(재시도/중복 폴링)이면 재지급하지 않고 멱등 응답한다.
 */
async function coinBuyConfirm(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const requestId = req.body && req.body.requestId;
  if (!requestId) return res.status(400).json({ ok: false, error: '요청 정보가 없습니다.' });

  // 멱등성: 이미 지급이 끝난 요청이면 다시 지급하지 않는다.
  const paidSnap = await db.ref(`coinShopPayments/${requestId}`).get();
  if (paidSnap.exists()) {
    const paid = paidSnap.val();
    if (paid.userKey !== userKey) return res.status(403).json({ ok: false, error: '접근 권한이 없습니다.' });
    return res.json({ ok: true, itemId: paid.itemId, alreadyProcessed: true });
  }

  const pendingSnap = await db.ref(`pendingCoinPurchases/${requestId}`).get();
  if (!pendingSnap.exists()) {
    return res.status(404).json({ ok: false, error: '구매 요청을 찾을 수 없습니다. 처음부터 다시 시도해주세요.' });
  }
  const pending = pendingSnap.val();
  if (pending.userKey !== userKey) {
    return res.status(403).json({ ok: false, error: '접근 권한이 없습니다.' });
  }

  const item = COIN_SHOP_ITEMS.find(i => i.id === pending.itemId);
  if (!item) return res.status(500).json({ ok: false, error: '상품 정보를 찾을 수 없습니다.' });

  const payment = await getPaymentRequest(requestId);
  if (!payment.ok) {
    return res.status(payment.status).json({ ok: false, error: payment.error });
  }
  if (payment.status !== 'approved') {
    return res.status(409).json({
      ok: false,
      status: payment.status,
      error: COIN_PAYMENT_STATUS_MESSAGES[payment.status] || '결제가 완료되지 않았습니다.',
    });
  }

  let outcome = null;
  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (user === null) return undefined;
    if (user.banned) {
      outcome = { error: '정지된 계정입니다.', status: 403 };
      return undefined;
    }

    const next = { ...user };

    if (item.type === 'hydrogen') {
      next.hydrogen = (user.hydrogen || 0) + item.amount;
    } else if (item.type === 'star') {
      // 결제 대기 사이 다른 경로(강화 등)로 이미 그 단계 이상에 도달했을 수 있어 재검증.
      if ((user.currentStar || 0) >= item.targetLevel) {
        outcome = { error: '이미 그 단계 이상입니다.', status: 400 };
        return undefined;
      }
      // 실패 미해결 상태(pendingFailure)에서 currentStar를 덮어쓰면, 방지권/파괴
      // 대가 없이 위험했던 별의 실패가 통째로 사라진다 — protection()으로 먼저
      // 해결하도록 강제한다. 결제는 이미 승인됐으므로 재시도 시 그대로 지급된다.
      if (user.pendingFailure) {
        outcome = { error: '이전 강화 실패를 먼저 처리하세요. 결제는 유지되니 처리 후 다시 시도해주세요.', status: 409 };
        return undefined;
      }
      // shop/buy의 warp 지급 로직과 동일 — 단, 사다코인 구매는 확률 없이 결제
      // 확인 즉시 100% 지급한다(기존 도약권처럼 실패 확률 없음).
      let warpTrack = user.track || null;
      if (item.targetLevel > 13) {
        warpTrack = TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)];
        next.track = warpTrack;
      }
      next.currentStar = item.targetLevel;
      const unlocked = [...(user.unlockedCodex || [])];
      for (let lv = 1; lv <= item.targetLevel; lv++) {
        const key = stageKey(lv, lv <= 13 ? null : warpTrack);
        if (!unlocked.includes(key)) unlocked.push(key);
      }
      next.unlockedCodex = unlocked;
      if (item.targetLevel > (user.bestStar || 0)) {
        next.bestStar = item.targetLevel;
      }
    }

    outcome = { ok: true };
    return next;
  });

  if (!txResult.committed) {
    if (outcome && outcome.error) {
      return res.status(outcome.status).json({ ok: false, error: outcome.error });
    }
    return res.status(404).json({ ok: false, error: '유저 없음' });
  }

  await db.ref().update({
    [`coinShopPayments/${requestId}`]: { userKey, itemId: item.id, coinPrice: item.coinPrice, at: Date.now() },
    [`pendingCoinPurchases/${requestId}`]: null,
  });

  res.json({ ok: true, itemId: item.id });
}

const ROUTES = {
  buy,
  'coin-buy-request': coinBuyRequest,
  'coin-buy-status':  coinBuyStatus,
  'coin-buy-confirm': coinBuyConfirm,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const action = req.query.action;
  const handler = ROUTES[action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return withActionLog(req, res, `shop/${action}`, handler);
};
