const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

function convId(a, b) {
  return [a, b].sort().join('__');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const meSnap = await db.ref(`users/${userKey}`).get();
  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  if (meSnap.val().banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  const { toKey, text } = req.body;
  const trimmed = (text || '').trim();
  if (!toKey) return res.status(400).json({ ok: false, error: '대상을 지정하세요.' });
  if (!trimmed) return res.status(400).json({ ok: false, error: '메시지를 입력하세요.' });
  if (trimmed.length > 500) return res.status(400).json({ ok: false, error: '메시지는 500자 이하여야 합니다.' });

  const friendSnap = await db.ref(`friends/${userKey}/${toKey}`).get();
  if (!friendSnap.exists()) {
    return res.status(403).json({ ok: false, error: '친구만 메시지를 보낼 수 있습니다.' });
  }

  const at = Date.now();
  const cid = convId(userKey, toKey);
  const pushKey = db.ref(`messages/${cid}`).push().key;

  await db.ref().update({
    [`messages/${cid}/${pushKey}`]: { from: userKey, text: trimmed, at },
    [`messageIndex/${userKey}/${toKey}`]: { lastText: trimmed, lastAt: at, lastFrom: userKey },
    [`messageIndex/${toKey}/${userKey}`]: { lastText: trimmed, lastAt: at, lastFrom: userKey },
  });

  res.json({ ok: true, message: { from: userKey, text: trimmed, at } });
};
