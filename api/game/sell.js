const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { STAGES } = require('../../lib/game-config');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const stage = STAGES[user.currentStar || 0];

  if (!stage || !stage.sellPrice) {
    return res.status(400).json({ ok: false, error: '이 별은 판매할 수 없습니다.' });
  }

  await db.ref().update({
    [`users/${userKey}/hydrogen`]:    (user.hydrogen || 0) + stage.sellPrice,
    [`users/${userKey}/currentStar`]: 0,
  });

  res.json({ ok: true, gained: stage.sellPrice });
};
