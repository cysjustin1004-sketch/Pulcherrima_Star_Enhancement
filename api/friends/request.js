const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { toKey } = req.body;
  if (!toKey) return res.status(400).json({ ok: false, error: '대상을 지정하세요.' });
  if (toKey === userKey) return res.status(400).json({ ok: false, error: '자기 자신에게는 요청할 수 없습니다.' });

  const meSnap = await db.ref(`users/${userKey}`).get();
  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const me = meSnap.val();
  if (me.banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  const targetSnap = await db.ref(`users/${toKey}`).get();
  if (!targetSnap.exists()) return res.status(404).json({ ok: false, error: '존재하지 않는 사용자입니다.' });
  const target = targetSnap.val();
  if (target.banned) return res.status(403).json({ ok: false, error: '정지된 사용자입니다.' });

  const alreadyFriendsSnap = await db.ref(`friends/${userKey}/${toKey}`).get();
  if (alreadyFriendsSnap.exists()) {
    return res.status(409).json({ ok: false, error: '이미 친구입니다.' });
  }

  const myPendingSnap = await db.ref(`friendRequests/${toKey}/${userKey}`).get();
  if (myPendingSnap.exists()) {
    return res.status(409).json({ ok: false, error: '이미 친구 요청을 보냈습니다.' });
  }

  // 상대가 이미 나에게 요청을 보낸 상태 → 자동 수락
  const reverseSnap = await db.ref(`friendRequests/${userKey}/${toKey}`).get();
  if (reverseSnap.exists()) {
    const now = Date.now();
    await db.ref().update({
      [`friends/${userKey}/${toKey}`]: { nickname: target.nickname, since: now },
      [`friends/${toKey}/${userKey}`]: { nickname: me.nickname, since: now },
      [`friendRequests/${userKey}/${toKey}`]: null,
    });
    return res.json({ ok: true, autoAccepted: true });
  }

  await db.ref(`friendRequests/${toKey}/${userKey}`).set({
    fromNickname: me.nickname,
    createdAt: Date.now(),
  });

  res.json({ ok: true, autoAccepted: false });
};
