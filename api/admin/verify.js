const db = require('../../lib/firebase-admin');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { passwordHash } = req.body;
  if (!passwordHash) return res.status(400).json({ ok: false, error: '비밀번호를 입력하세요.' });

  const snap = await db.ref('config/admin/passwordHash').get();

  // 최초 설정: 비밀번호가 없으면 입력한 값으로 즉시 설정
  if (!snap.exists()) {
    await db.ref('config/admin/passwordHash').set(passwordHash);
    const token = crypto.randomBytes(32).toString('hex');
    await db.ref(`adminSessions/${token}`).set({ createdAt: Date.now() });
    return res.json({ ok: true, token, firstSetup: true });
  }

  if (snap.val() !== passwordHash) {
    return res.status(401).json({ ok: false, error: '비밀번호가 틀렸습니다.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  await db.ref(`adminSessions/${token}`).set({ createdAt: Date.now() });
  res.json({ ok: true, token });
};
