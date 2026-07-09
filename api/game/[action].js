const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { resolveStage, stageKey, ITEM_NAMES, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

async function enhance(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저를 찾을 수 없습니다.' });

  const user = snap.val();
  if (user.banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  const level = user.currentStar || 0;
  const track = user.track || null;
  const stage = resolveStage(level, track);
  if (!stage || stage.cost === null) {
    return res.status(400).json({ ok: false, error: '강화할 수 없는 단계입니다.' });
  }

  const cost = stage.cost;

  // 비용 검증
  if (cost.type === 'hydrogen') {
    if ((user.hydrogen || 0) < cost.amount)
      return res.status(400).json({ ok: false, error: '수소가 부족합니다.' });
  } else if (cost.type === 'item') {
    const held = (user.items && user.items[cost.key]) || 0;
    if (held < cost.amount)
      return res.status(400).json({ ok: false, error: `${ITEM_NAMES[cost.key]}이(가) ${cost.amount}개 필요합니다.` });
  } else if (cost.type === 'star') {
    // 트랙 무관하게 인정 — 트랙이 매번 랜덤 배정되므로 어느 트랙에서 보관했든 레벨만 맞으면 재료로 인정
    const stored = TRACK_KEYS.reduce((sum, t) => sum + ((user.storedStars && user.storedStars[`${t}_${cost.level}`]) || 0), 0);
    if (stored < cost.amount)
      return res.status(400).json({ ok: false, error: `+${cost.level}강 별이 ${cost.amount}개 필요합니다.` });
  }

  // 성공/실패 판정
  const success = Math.random() < stage.successRate;

  // Firebase 일괄 업데이트 구성
  const upd = {};

  // 비용 차감
  if (cost.type === 'hydrogen') {
    upd[`users/${userKey}/hydrogen`] = (user.hydrogen || 0) - cost.amount;
  } else if (cost.type === 'item') {
    const held = (user.items && user.items[cost.key]) || 0;
    upd[`users/${userKey}/items/${cost.key}`] = held - cost.amount;
  } else if (cost.type === 'star') {
    // 여러 트랙에 나뉘어 보관돼 있을 수 있으므로 트랙 순서대로 필요한 만큼 차감
    let remaining = cost.amount;
    for (const t of TRACK_KEYS) {
      if (remaining <= 0) break;
      const k = `${t}_${cost.level}`;
      const have = (user.storedStars && user.storedStars[k]) || 0;
      if (have <= 0) continue;
      const take = Math.min(have, remaining);
      upd[`users/${userKey}/storedStars/${k}`] = have - take;
      remaining -= take;
    }
  }

  let drop = null;
  let assignedTrack = null;

  if (success) {
    const newLevel = level + 1;

    // 공통 구간을 마치고(레벨16→17) 트랙 구간에 진입할 때마다 — 매번 트랙 무작위 재배정
    let newTrack = track;
    if (level === 16) {
      newTrack = TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)];
      upd[`users/${userKey}/track`] = newTrack;
      assignedTrack = newTrack;
    }

    upd[`users/${userKey}/currentStar`] = newLevel;
    if (newLevel > (user.bestStar || 0)) {
      upd[`users/${userKey}/bestStar`] = newLevel;
      upd[`users/${userKey}/bestTrack`] = newLevel <= 16 ? null : newTrack;
    }
    const unlockKey = stageKey(newLevel, newTrack);
    const unlocked = user.unlockedCodex || [];
    if (!unlocked.includes(unlockKey)) upd[`users/${userKey}/unlockedCodex`] = [...unlocked, unlockKey];
    upd[`users/${userKey}/pendingFailure`] = null;
  } else {
    // 드랍 아이템 자동 지급 (별도 pickup 호출 불필요)
    if (stage.drop) {
      const amount = stage.drop.min + Math.floor(Math.random() * (stage.drop.max - stage.drop.min + 1));
      drop = { key: stage.drop.key, amount };
      const current = (user.items && user.items[drop.key]) || 0;
      upd[`users/${userKey}/items/${drop.key}`] = current + amount;
    }
    // 방지권 선택 대기 상태 저장 (protection API에서 처리)
    upd[`users/${userKey}/pendingFailure`] = {
      level,
      timestamp: Date.now(),
    };
  }

  await db.ref().update(upd);

  // 로그 기록 (fire-and-forget)
  db.ref(`enhanceLogs/${userKey}`).push({
    from: level,
    to: success ? level + 1 : level,
    result: success ? 'success' : 'fail',
    usedProtection: false,
    timeMs: Date.now(),
  });

  res.json({ ok: true, success, drop, level, assignedTrack });
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
    await db.ref(`users/${userKey}/pendingFailure`).remove();
    return res.status(400).json({ ok: false, error: '시간이 초과되었습니다.' });
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
    // 방지권 미사용 — +0으로 초기화
    await db.ref().update({
      [`users/${userKey}/currentStar`]: 0,
      [`users/${userKey}/pendingFailure`]: null,
    });
    res.json({ ok: true, currentStar: 0, usedProtection: false });
  }
}

async function sell(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const stage = resolveStage(user.currentStar || 0, user.track);

  if (!stage || !stage.sellPrice) {
    return res.status(400).json({ ok: false, error: '이 별은 판매할 수 없습니다.' });
  }

  await db.ref().update({
    [`users/${userKey}/hydrogen`]:    (user.hydrogen || 0) + stage.sellPrice,
    [`users/${userKey}/currentStar`]: 0,
  });

  res.json({ ok: true, gained: stage.sellPrice });
}

async function store(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const level = user.currentStar || 0;

  if (level < 1) {
    return res.status(400).json({ ok: false, error: '+1강 이상만 보관할 수 있습니다.' });
  }

  const key = stageKey(level, user.track);
  const stored = (user.storedStars && user.storedStars[key]) || 0;
  await db.ref().update({
    [`users/${userKey}/storedStars/${key}`]: stored + 1,
    [`users/${userKey}/currentStar`]:        0,
  });

  res.json({ ok: true, level });
}

const ROUTES = { enhance, protection, sell, store };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
