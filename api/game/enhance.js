const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { resolveStage, stageKey, ITEM_NAMES, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

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
    // 같은 트랙에 보관된 별을 소모 (공통 구간 레벨은 트랙 무관)
    const key = stageKey(cost.level, track);
    const stored = (user.storedStars && user.storedStars[key]) || 0;
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
    const key = stageKey(cost.level, track);
    const stored = (user.storedStars && user.storedStars[key]) || 0;
    upd[`users/${userKey}/storedStars/${key}`] = stored - cost.amount;
  }

  let drop = null;
  let assignedTrack = null;

  if (success) {
    const newLevel = level + 1;

    // 공통 구간을 마치고(레벨16→17) 트랙 구간에 처음 진입하는 순간 — 트랙 무작위 배정
    let newTrack = track;
    if (level === 16 && !track) {
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
};
