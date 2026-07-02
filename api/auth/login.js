const crypto = require('crypto');
const db = require('../../lib/firebase-admin');
const { createSession } = require('../../lib/session');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function nicknameToKey(nickname) {
  return nickname.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '_');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { nickname, passwordHash } = req.body;
  if (!nickname || !passwordHash) {
    return res.status(400).json({ ok: false, error: '닉네임과 비밀번호를 입력하세요.' });
  }

  const userKey = nicknameToKey(nickname);
  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) {
    return res.status(401).json({ ok: false, error: '존재하지 않는 닉네임입니다.' });
  }

  const user = snap.val();
  if (user.banned) {
    return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });
  }
  if (passwordHash !== user.passwordHash) {
    return res.status(401).json({ ok: false, error: '비밀번호가 틀렸습니다.' });
  }

  const token = await createSession(userKey);
  res.json({ ok: true, token, userKey, nickname: user.nickname });
};
