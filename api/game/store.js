const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { stageKey } = require('../../lib/game-config');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const level = user.currentStar || 0;

  if (level < 17) {
    return res.status(400).json({ ok: false, error: '트랙 진입(+17강) 이후에만 보관할 수 있습니다.' });
  }

  const key = stageKey(level, user.track);
  const stored = (user.storedStars && user.storedStars[key]) || 0;
  await db.ref().update({
    [`users/${userKey}/storedStars/${key}`]: stored + 1,
    [`users/${userKey}/currentStar`]:        0,
  });

  res.json({ ok: true, level });
};
