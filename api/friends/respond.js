const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { fromKey, action } = req.body;
  if (!fromKey || (action !== 'accept' && action !== 'reject')) {
    return res.status(400).json({ ok: false, error: '잘못된 요청입니다.' });
  }

  const reqSnap = await db.ref(`friendRequests/${userKey}/${fromKey}`).get();
  if (!reqSnap.exists()) {
    return res.status(404).json({ ok: false, error: '해당 친구 요청을 찾을 수 없습니다.' });
  }

  if (action === 'reject') {
    await db.ref(`friendRequests/${userKey}/${fromKey}`).remove();
    return res.json({ ok: true });
  }

  const [meSnap, fromSnap] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`users/${fromKey}`).get(),
  ]);
  if (!meSnap.exists() || !fromSnap.exists()) {
    return res.status(404).json({ ok: false, error: '유저 없음' });
  }

  const now = Date.now();
  await db.ref().update({
    [`friends/${userKey}/${fromKey}`]: { nickname: fromSnap.val().nickname, since: now },
    [`friends/${fromKey}/${userKey}`]: { nickname: meSnap.val().nickname, since: now },
    [`friendRequests/${userKey}/${fromKey}`]: null,
  });

  res.json({ ok: true, friend: { userKey: fromKey, nickname: fromSnap.val().nickname, since: now } });
};
