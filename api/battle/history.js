const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { limit } = req.body;
  const n = Math.max(1, Math.min(200, limit || 50));

  const snap = await db.ref(`battleLogs/${userKey}`).limitToLast(n).get();
  const logs = [];
  if (snap.exists()) {
    snap.forEach(child => logs.push(child.val()));
  }
  logs.reverse(); // 최신순

  res.json({ ok: true, logs });
};
