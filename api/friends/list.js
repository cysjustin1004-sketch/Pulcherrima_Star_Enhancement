const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const [friendsSnap, requestsSnap] = await Promise.all([
    db.ref(`friends/${userKey}`).get(),
    db.ref(`friendRequests/${userKey}`).get(),
  ]);

  const friendEntries = [];
  if (friendsSnap.exists()) {
    friendsSnap.forEach(child => friendEntries.push({ userKey: child.key, meta: child.val() }));
  }

  // 친구별 최신 장비 별/전적도 함께 내려줌 (배틀 상대 선택 화면에서 재조회 없이 사용)
  const friendUserSnaps = await Promise.all(
    friendEntries.map(f => db.ref(`users/${f.userKey}`).get())
  );

  const friends = friendEntries.map((f, i) => {
    const u = friendUserSnaps[i].exists() ? friendUserSnaps[i].val() : {};
    return {
      userKey:      f.userKey,
      nickname:     f.meta.nickname,
      since:        f.meta.since,
      currentStar:  u.currentStar  || 0,
      track:        u.track        || null,
      battleWins:   u.battleWins   || 0,
      battleLosses: u.battleLosses || 0,
      banned:       !!u.banned,
    };
  });

  const incoming = [];
  if (requestsSnap.exists()) {
    requestsSnap.forEach(child => {
      const d = child.val();
      incoming.push({ fromKey: child.key, fromNickname: d.fromNickname, createdAt: d.createdAt });
    });
  }

  res.json({ ok: true, friends, incoming });
};
