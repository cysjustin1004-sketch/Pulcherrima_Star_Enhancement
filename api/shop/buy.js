const { validateSession } = require('../../lib/session');
const { atomicUpdate } = require('../../lib/atomic-update');
const { SHOP_ITEMS, stageKey, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

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
};
