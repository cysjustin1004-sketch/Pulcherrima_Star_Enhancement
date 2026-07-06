const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const [friendsSnap, indexSnap] = await Promise.all([
    db.ref(`friends/${userKey}`).get(),
    db.ref(`messageIndex/${userKey}`).get(),
  ]);

  const index = indexSnap.exists() ? indexSnap.val() : {};

  const conversations = [];
  if (friendsSnap.exists()) {
    friendsSnap.forEach(child => {
      const otherKey = child.key;
      const friend = child.val();
      const idx = index[otherKey] || null;
      conversations.push({
        userKey:  otherKey,
        nickname: friend.nickname,
        lastText: idx ? idx.lastText : null,
        lastAt:   idx ? idx.lastAt   : null,
        lastFrom: idx ? idx.lastFrom : null,
      });
    });
  }

  // 최근 대화 순
  conversations.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

  res.json({ ok: true, conversations });
};
