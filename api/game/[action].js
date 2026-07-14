const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { atomicUpdate } = require('../../lib/atomic-update');
const { withActionLog } = require('../../lib/action-log');
const { resolveStage, stageKey, parseStageKey, ITEM_NAMES, TRACK_INFO, INVENTORY_CAP, RATE_LIMIT } = require('../../lib/game-config');
const { isRateLimited } = require('../../lib/rate-limit');

const TRACK_KEYS = Object.keys(TRACK_INFO);

async function enhance(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  // DB를 건드리기 전에 먼저 차단 — 매크로/스크립트가 남용해도 Firebase 부하로 이어지지 않는다
  if (isRateLimited(userKey, RATE_LIMIT.maxPerMinute)) {
    return res.status(429).json({ ok: false, error: '너무 빠른 요청입니다. 잠시 후 다시 시도하세요.' });
  }

  // 읽기(get)와 쓰기(update)를 분리하면, 같은 계정이 동시에 여러 요청을 보낼 때
  // 전부 "차감 전" 스냅샷을 읽어 비용 검증을 통과한 뒤 마지막에 쓴 값만 반영되는
  // 레이스 컨디션이 생긴다 — 비용은 1번만 나가는데 성공/실패 판정(RNG)은 요청마다
  // 독립적으로 굴러가서, 동시 요청을 많이 보낼수록 사실상 "1번 결제로 여러 번
  // 재도전"하는 것과 같아진다. atomicUpdate()(ETag 조건부 쓰기)로 읽기·검증·쓰기를
  // 원자적으로 묶어 이 레이스를 원천 차단한다 — 충돌이 감지되면 최신 값으로 자동 재시도한다.
  let outcome = null; // { error, status } 또는 { success, drop, level, assignedTrack }

  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (user === null) return undefined; // 유저 없음 — abort, 바깥에서 404 처리
    if (user.banned) {
      outcome = { error: '정지된 계정입니다.', status: 403 };
      return undefined;
    }

    // 직전 강화 실패가 아직 해결(방지권 사용 or 0강 하락) 안 됐으면 새 강화를 막는다.
    // 이게 없으면 실패 후 방지권 선택 모달을 띄운 채로 탭을 닫았다가 Ctrl+Shift+T로
    // 복원해 다시 강화를 누르는 식으로 — currentStar가 실패 시점 그대로 남아있는 걸
    // 악용해 페널티(단계 하락/방지권 소모) 없이 무한 재시도할 수 있었다.
    if (user.pendingFailure) {
      outcome = { error: '이전 강화 실패를 먼저 처리하세요.', status: 409 };
      return undefined;
    }

    const level = user.currentStar || 0;
    const track = user.track || null;
    const stage = resolveStage(level, track);
    if (!stage || stage.cost === null) {
      outcome = { error: '강화할 수 없는 단계입니다.', status: 400 };
      return undefined;
    }

    const cost = stage.cost;

    // 비용 검증
    if (cost.type === 'hydrogen') {
      if ((user.hydrogen || 0) < cost.amount) {
        outcome = { error: '수소가 부족합니다.', status: 400 };
        return undefined;
      }
    } else if (cost.type === 'item') {
      const held = (user.items && user.items[cost.key]) || 0;
      if (held < cost.amount) {
        outcome = { error: `${ITEM_NAMES[cost.key]}이(가) ${cost.amount}개 필요합니다.`, status: 400 };
        return undefined;
      }
    } else if (cost.type === 'star') {
      // 트랙 무관하게 인정 — 트랙이 매번 랜덤 배정되므로 어느 트랙에서 보관했든 레벨만 맞으면 재료로 인정.
      const stored = TRACK_KEYS.reduce((sum, t) => sum + ((user.storedStars && user.storedStars[`${t}_${cost.level}`]) || 0), 0)
        + ((user.storedStars && user.storedStars[String(cost.level)]) || 0);
      if (stored < cost.amount) {
        outcome = { error: `+${cost.level}강 별이 ${cost.amount}개 필요합니다.`, status: 400 };
        return undefined;
      }
    }

    // 충돌 시 최신 데이터로 재호출될 수 있으므로, 매번 user를 얕은 복제해
    // 다음 상태(next)를 구성한다 — 이전 호출의 잔여 상태가 섞이지 않는다.
    const next = { ...user, items: { ...(user.items || {}) }, storedStars: { ...(user.storedStars || {}) } };

    // 성공/실패 판정 — 이 콜백이 최종적으로 커밋되는 그 시점의 호출 결과만 반영된다
    const success = Math.random() < stage.successRate;

    next.enhanceAttempts = (user.enhanceAttempts || 0) + 1;

    // 비용 차감
    if (cost.type === 'hydrogen') {
      next.hydrogen = (user.hydrogen || 0) - cost.amount;
    } else if (cost.type === 'item') {
      next.items[cost.key] = ((user.items && user.items[cost.key]) || 0) - cost.amount;
    } else if (cost.type === 'star') {
      let remaining = cost.amount;
      const keys = [...TRACK_KEYS.map(t => `${t}_${cost.level}`), String(cost.level)];
      for (const k of keys) {
        if (remaining <= 0) break;
        const have = (user.storedStars && user.storedStars[k]) || 0;
        if (have <= 0) continue;
        const take = Math.min(have, remaining);
        next.storedStars[k] = have - take;
        remaining -= take;
      }
    }

    let drop = null;
    let assignedTrack = null;

    if (success) {
      const newLevel = level + 1;

      // 공통 구간을 마치고(레벨13→14) 트랙 구간에 진입할 때마다 — 매번 트랙 무작위 재배정
      let newTrack = track;
      if (level === 13) {
        newTrack = TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)];
        next.track = newTrack;
        assignedTrack = newTrack;
      }

      next.currentStar = newLevel;
      if (newLevel > (user.bestStar || 0)) {
        next.bestStar = newLevel;
        next.bestTrack = newLevel <= 13 ? null : newTrack;
      }
      const unlockKey = stageKey(newLevel, newTrack);
      const unlocked = user.unlockedCodex || [];
      if (!unlocked.includes(unlockKey)) next.unlockedCodex = [...unlocked, unlockKey];
      next.pendingFailure = null;
    } else {
      // 드랍 아이템 자동 지급 (별도 pickup 호출 불필요)
      if (stage.drop) {
        const amount = stage.drop.min + Math.floor(Math.random() * (stage.drop.max - stage.drop.min + 1));
        drop = { key: stage.drop.key, amount };
        next.items[drop.key] = ((user.items && user.items[drop.key]) || 0) + amount;
      }
      // 방지권 선택 대기 상태 저장 (protection API에서 처리)
      next.pendingFailure = { level, timestamp: Date.now() };
    }

    outcome = { ok: true, success, drop, level, assignedTrack };
    return next;
  });

  if (!txResult.committed) {
    if (outcome && outcome.error) {
      return res.status(outcome.status).json({ ok: false, error: outcome.error });
    }
    return res.status(404).json({ ok: false, error: '유저를 찾을 수 없습니다.' });
  }

  // 로그 기록 (fire-and-forget)
  db.ref(`enhanceLogs/${userKey}`).push({
    from: outcome.level,
    to: outcome.success ? outcome.level + 1 : outcome.level,
    result: outcome.success ? 'success' : 'fail',
    usedProtection: false,
    timeMs: Date.now(),
  });

  res.json(outcome);
}

async function protection(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const pf = user.pendingFailure;

  if (!pf) return res.status(400).json({ ok: false, error: '처리할 강화 실패가 없습니다.' });
  if (Date.now() - pf.timestamp > 5 * 60 * 1000) {
    // 방치해도 페널티가 면제되면 안 되므로, 미사용(포기)과 동일하게 0강으로 처리한다.
    await db.ref().update({
      [`users/${userKey}/currentStar`]: 0,
      [`users/${userKey}/pendingFailure`]: null,
      [`users/${userKey}/enhanceDestroys`]: (user.enhanceDestroys || 0) + 1,
    });
    return res.status(400).json({ ok: false, error: '시간이 초과되어 0강으로 초기화되었습니다.' });
  }

  const { useProtection } = req.body;
  const level = pf.level;
  const stage = resolveStage(level, user.track);

  if (useProtection) {
    // 방지권 사용 — 단계 유지
    if (stage.protectionCost <= 0) {
      return res.status(400).json({ ok: false, error: '이 단계는 방지권을 사용할 수 없습니다.' });
    }
    if ((user.protectionScrolls || 0) < stage.protectionCost) {
      return res.status(400).json({ ok: false, error: `붕괴 방지권이 ${stage.protectionCost}개 필요합니다.` });
    }
    await db.ref().update({
      [`users/${userKey}/protectionScrolls`]: (user.protectionScrolls || 0) - stage.protectionCost,
      [`users/${userKey}/pendingFailure`]: null,
    });
    // 방지권 사용 로그
    db.ref(`enhanceLogs/${userKey}`).push({
      from: level, to: level, result: 'fail', usedProtection: true, timeMs: Date.now(),
    });
    res.json({ ok: true, currentStar: level, usedProtection: true });
  } else {
    // 방지권 미사용 — +0으로 초기화 (프로필에 보여줄 "파괴 횟수" 집계)
    await db.ref().update({
      [`users/${userKey}/currentStar`]: 0,
      [`users/${userKey}/pendingFailure`]: null,
      [`users/${userKey}/enhanceDestroys`]: (user.enhanceDestroys || 0) + 1,
    });
    res.json({ ok: true, currentStar: 0, usedProtection: false });
  }
}

// 모든 값 변화(수소/보관별)를 users/{userKey}에 대해 atomicUpdate()(ETag 조건부
// 쓰기)로 계산·커밋하므로, 같은 계정으로 동시에 여러 요청을 날려도(다중 탭 등)
// 매 시도가 항상 최신 상태를 기준으로 재계산된다 — 읽기-확인-쓰기 사이 경합으로
// 인한 복제(dupe)를 막는다. (admin SDK의 ref.transaction()은 이 서버리스 환경에서
// 로컬 동기화 캐시가 없어 항상 즉시 null로 콜백을 호출하고 끝나버려 실제로는
// 원자성을 보장하지 못한다 — 실측 확인됨. 그래서 REST ETag 방식을 쓴다.)

async function sell(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  let errorResult = null;
  let gained = 0;

  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (!user) { errorResult = { status: 404, error: '유저 없음' }; return undefined; }
    if (user.banned) { errorResult = { status: 403, error: '정지된 계정입니다.' }; return undefined; }

    const stage = resolveStage(user.currentStar || 0, user.track);
    if (!stage || !stage.sellPrice) {
      errorResult = { status: 400, error: '이 별은 판매할 수 없습니다.' };
      return undefined;
    }

    gained = stage.sellPrice;
    return { ...user, hydrogen: (user.hydrogen || 0) + stage.sellPrice, currentStar: 0 };
  });

  if (!txResult.committed) {
    return res.status(errorResult ? errorResult.status : 400).json({ ok: false, error: errorResult ? errorResult.error : '처리할 수 없습니다.' });
  }
  res.json({ ok: true, gained });
}

async function store(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  let errorResult = null;
  let storedLevel = 0;

  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (!user) { errorResult = { status: 404, error: '유저 없음' }; return undefined; }
    if (user.banned) { errorResult = { status: 403, error: '정지된 계정입니다.' }; return undefined; }

    const level = user.currentStar || 0;
    if (level < 1) {
      errorResult = { status: 400, error: '+1강 이상만 보관할 수 있습니다.' };
      return undefined;
    }

    const totalStored = Object.values(user.storedStars || {}).reduce((a, b) => a + b, 0);
    if (totalStored >= INVENTORY_CAP) {
      errorResult = { status: 400, error: `인벤토리가 가득 찼습니다 (${INVENTORY_CAP}/${INVENTORY_CAP}). 별을 판매하거나 정리해주세요.` };
      return undefined;
    }

    storedLevel = level;
    const key = stageKey(level, user.track);
    const stored = (user.storedStars && user.storedStars[key]) || 0;
    return {
      ...user,
      storedStars: { ...(user.storedStars || {}), [key]: stored + 1 },
      currentStar: 0,
    };
  });

  if (!txResult.committed) {
    return res.status(errorResult ? errorResult.status : 400).json({ ok: false, error: errorResult ? errorResult.error : '처리할 수 없습니다.' });
  }
  res.json({ ok: true, level: storedLevel });
}

async function sellStored(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: '판매할 별을 지정하세요.' });

  let errorResult = null;
  let gained = 0;

  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (!user) { errorResult = { status: 404, error: '유저 없음' }; return undefined; }
    if (user.banned) { errorResult = { status: 403, error: '정지된 계정입니다.' }; return undefined; }

    const stored = (user.storedStars && user.storedStars[key]) || 0;
    if (stored < 1) {
      errorResult = { status: 400, error: '보관된 별이 없습니다.' };
      return undefined;
    }

    const { level, track } = parseStageKey(key);
    const stage = resolveStage(level, track);
    if (!stage || !stage.sellPrice) {
      errorResult = { status: 400, error: '이 별은 판매할 수 없습니다.' };
      return undefined;
    }

    gained = stage.sellPrice;
    return {
      ...user,
      hydrogen: (user.hydrogen || 0) + stage.sellPrice,
      storedStars: { ...user.storedStars, [key]: stored - 1 },
    };
  });

  if (!txResult.committed) {
    return res.status(errorResult ? errorResult.status : 400).json({ ok: false, error: errorResult ? errorResult.error : '처리할 수 없습니다.' });
  }
  res.json({ ok: true, gained, key });
}

async function load(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: '불러올 별을 지정하세요.' });

  let errorResult = null;
  let newLevel = 0;
  let newTrack = null;
  let autoStored = false;

  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (!user) { errorResult = { status: 404, error: '유저 없음' }; return undefined; }
    if (user.banned) { errorResult = { status: 403, error: '정지된 계정입니다.' }; return undefined; }

    const storedStars = { ...(user.storedStars || {}) };
    const have = storedStars[key] || 0;
    if (have < 1) {
      errorResult = { status: 400, error: '보관된 별이 없습니다.' };
      return undefined;
    }

    const parsed = parseStageKey(key);
    const newStage = resolveStage(parsed.level, parsed.track);
    if (!newStage) {
      errorResult = { status: 400, error: '유효하지 않은 별입니다.' };
      return undefined;
    }

    const curLevel = user.currentStar || 0;

    // 강화 중이던 별이 있으면 자동으로 보관함에 넣는다(스왑) — 총 개수 변화가 없어 용량 체크 불필요
    if (curLevel > 0) {
      const curKey = stageKey(curLevel, user.track);
      storedStars[curKey] = (storedStars[curKey] || 0) + 1;
    }

    // 불러오는 별은 보관함에서 차감
    storedStars[key] = storedStars[key] - 1;
    if (storedStars[key] <= 0) delete storedStars[key];

    newLevel = parsed.level;
    newTrack = parsed.track;
    autoStored = curLevel > 0;

    const next = { ...user, storedStars, currentStar: newLevel };
    // 공통/우주루트 별(track null)은 기존 트랙 유지, 트랙 별은 그 트랙으로 전환
    if (newTrack) next.track = newTrack;
    return next;
  });

  if (!txResult.committed) {
    return res.status(errorResult ? errorResult.status : 400).json({ ok: false, error: errorResult ? errorResult.error : '처리할 수 없습니다.' });
  }
  res.json({ ok: true, level: newLevel, track: newTrack, autoStored });
}

async function setProfilePic(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { key } = req.body;

  if (key == null) {
    // 해제 — 프로필 사진을 다시 현재 강화 중인 별로 되돌림
    await db.ref(`users/${userKey}/profilePicKey`).remove();
    return res.json({ ok: true, profilePicKey: null });
  }

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const unlocked = user.unlockedCodex || [];
  // 해금하지 않은 도감 항목을 프로필 사진으로 지정하지 못하도록 서버에서도 검증
  if (!unlocked.includes(key)) {
    return res.status(400).json({ ok: false, error: '아직 해금하지 않은 별입니다.' });
  }

  const { level, track } = parseStageKey(key);
  if (!resolveStage(level, track)) {
    return res.status(400).json({ ok: false, error: '유효하지 않은 별입니다.' });
  }

  await db.ref(`users/${userKey}/profilePicKey`).set(key);
  res.json({ ok: true, profilePicKey: key });
}

const ROUTES = { enhance, protection, sell, store, sellStored, load, setProfilePic };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const action = req.query.action;
  const handler = ROUTES[action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return withActionLog(req, res, `game/${action}`, handler);
};
