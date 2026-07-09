const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { nicknameToKey } = require('../../lib/game-config');

async function list(req, res) {
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
  // TEMP DEBUG — 원인 파악 후 제거
  const _debugRaw = friendsSnap.exists() ? friendsSnap.val() : null;
  const _debugRawKeys = _debugRaw ? Object.keys(_debugRaw) : [];

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

  res.json({ ok: true, friends, incoming, _debugRawKeys, _debugRaw });
}

async function request(req, res) {
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
}

async function respond(req, res) {
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
}

async function search(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { query } = req.body;
  const q = (query || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: '검색어를 입력하세요.' });

  const targetKey = nicknameToKey(q);
  if (targetKey === userKey) {
    return res.json({ ok: true, results: [] }); // 본인은 검색 결과에서 제외
  }

  const snap = await db.ref(`users/${targetKey}`).get();
  if (!snap.exists()) {
    return res.json({ ok: true, results: [] });
  }

  const user = snap.val();
  if (user.banned) {
    return res.json({ ok: true, results: [] }); // 밴 유저는 검색 결과에서 제외
  }

  res.json({
    ok: true,
    results: [{
      userKey:      targetKey,
      nickname:     user.nickname,
      currentStar:  user.currentStar || 0,
      track:        user.track || null,
      battleWins:   user.battleWins || 0,
      battleLosses: user.battleLosses || 0,
    }],
  });
}

const ROUTES = { list, request, respond, search };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
