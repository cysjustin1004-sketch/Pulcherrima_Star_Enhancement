const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { nicknameToKey } = require('../../lib/game-config');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

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
};
