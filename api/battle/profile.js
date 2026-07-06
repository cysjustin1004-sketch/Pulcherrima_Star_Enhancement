const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { opponentKey } = req.body;
  if (!opponentKey) return res.status(400).json({ ok: false, error: '상대를 지정하세요.' });

  const oppSnap = await db.ref(`users/${opponentKey}`).get();
  if (!oppSnap.exists()) return res.status(404).json({ ok: false, error: '존재하지 않는 사용자입니다.' });
  const opp = oppSnap.val();

  const [friendSnap, pendingOutSnap, pendingInSnap] = await Promise.all([
    db.ref(`friends/${userKey}/${opponentKey}`).get(),
    db.ref(`friendRequests/${opponentKey}/${userKey}`).get(), // 내가 상대에게 보낸 요청
    db.ref(`friendRequests/${userKey}/${opponentKey}`).get(), // 상대가 나에게 보낸 요청
  ]);

  res.json({
    ok: true,
    nickname: opp.nickname,
    currentStar: opp.currentStar || 0,
    track: opp.track || null,
    bestStar: opp.bestStar || 0,
    battleWins: opp.battleWins || 0,
    battleLosses: opp.battleLosses || 0,
    isFriend: friendSnap.exists(),
    hasPendingRequest: pendingOutSnap.exists() || pendingInSnap.exists(),
  });
};
