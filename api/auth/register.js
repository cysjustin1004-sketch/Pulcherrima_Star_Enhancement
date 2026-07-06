const db = require('../../lib/firebase-admin');
const { createSession } = require('../../lib/session');
const { STARTING_HYDROGEN, nicknameToKey } = require('../../lib/game-config');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { nickname, passwordHash } = req.body;
  const nick = (nickname || '').trim();

  if (!nick || nick.length < 2 || nick.length > 12) {
    return res.status(400).json({ ok: false, error: '닉네임은 2~12자여야 합니다.' });
  }
  if (!passwordHash || passwordHash.length !== 64) {
    return res.status(400).json({ ok: false, error: '비밀번호가 유효하지 않습니다.' });
  }

  const userKey = nicknameToKey(nick);
  const existing = await db.ref(`users/${userKey}`).get();
  if (existing.exists()) {
    return res.status(409).json({ ok: false, error: '이미 사용 중인 닉네임입니다.' });
  }

  const now = Date.now();
  await db.ref(`authSecrets/${userKey}`).set({ passwordHash });
  await db.ref(`users/${userKey}`).set({
    nickname: nick,
    hydrogen: STARTING_HYDROGEN,
    currentStar: 0,
    bestStar: 0,
    protectionScrolls: 0,
    battleWins: 0,
    battleLosses: 0,
    unlockedCodex: [0],
    items: {
      stellar_wind: 0, hypergiant_core: 0, supernova_glow: 0,
      neutron_crust: 0, pulsar_signal: 0, magnetar_flare: 0,
      hawking_radiation: 0, dark_matter: 0,
    },
    storedStars: {},
    createdAt: now,
  });

  const token = await createSession(userKey);
  res.json({ ok: true, token, userKey, nickname: nick });
};
