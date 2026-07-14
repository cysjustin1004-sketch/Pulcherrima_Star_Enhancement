const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { SHOP_ITEMS, stageKey, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { itemId } = req.body;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return res.status(400).json({ ok: false, error: '존재하지 않는 상품입니다.' });

  let outcome = null;
  let callbackCallCount = 0;
  let lastSeenUser = 'NEVER_CALLED';
  let caughtError = null;

  let txResult;
  try {
    txResult = await db.ref(`users/${userKey}`).transaction((user) => {
      callbackCallCount++;
      lastSeenUser = user === null ? 'NULL' : (user === undefined ? 'UNDEFINED' : typeof user);
      if (user === null) return;

      if ((user.hydrogen || 0) < item.price) {
        outcome = { error: '수소가 부족합니다.', status: 400 };
        return;
      }
      if (item.type === 'warp' && (user.currentStar || 0) >= item.targetLevel) {
        outcome = { error: '현재 단계보다 낮은 도약권은 사용할 수 없습니다.', status: 400 };
        return;
      }

      const next = { ...user };
      next.hydrogen = (user.hydrogen || 0) - item.price;

      let warpSuccess = null;

      if (item.type === 'warp') {
        warpSuccess = Math.random() < item.successRate;
        if (warpSuccess) {
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
        next.protectionScrolls = (user.protectionScrolls || 0) + item.amount;
      }

      outcome = { ok: true, itemId, price: item.price, warpSuccess };
      return next;
    });
  } catch (e) {
    caughtError = { message: e.message, code: e.code, stack: (e.stack || '').slice(0, 500) };
  }

  // ── 임시 디버그 응답 (원인 파악 후 제거 예정) ──
  return res.json({
    DEBUG: true,
    userKey,
    callbackCallCount,
    lastSeenUser,
    txResultCommitted: txResult ? txResult.committed : 'NO_TX_RESULT',
    txResultSnapshotExists: txResult && txResult.snapshot ? txResult.snapshot.exists() : null,
    outcome,
    caughtError,
  });
};
