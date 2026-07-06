const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

function convId(a, b) {
  return [a, b].sort().join('__');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { withKey, limit } = req.body;
  if (!withKey) return res.status(400).json({ ok: false, error: '대상을 지정하세요.' });

  const friendSnap = await db.ref(`friends/${userKey}/${withKey}`).get();
  if (!friendSnap.exists()) {
    return res.status(403).json({ ok: false, error: '친구만 대화할 수 있습니다.' });
  }

  const n = Math.max(1, Math.min(200, limit || 50));
  const snap = await db.ref(`messages/${convId(userKey, withKey)}`).limitToLast(n).get();

  const messages = [];
  if (snap.exists()) {
    snap.forEach(child => {
      const d = child.val();
      messages.push({ from: d.from, text: d.text, at: d.at });
    });
  }

  res.json({ ok: true, messages });
};
