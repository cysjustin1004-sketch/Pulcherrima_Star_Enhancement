const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { resolveStage } = require('../../lib/game-config');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

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
};
