const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

function convId(a, b) {
  return [a, b].sort().join('__');
}

async function conversations(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const [friendsSnap, indexSnap] = await Promise.all([
    db.ref(`friends/${userKey}`).get(),
    db.ref(`messageIndex/${userKey}`).get(),
  ]);

  const index = indexSnap.exists() ? indexSnap.val() : {};

  const list = [];
  if (friendsSnap.exists()) {
    friendsSnap.forEach(child => {
      const otherKey = child.key;
      const friend = child.val();
      const idx = index[otherKey] || null;
      list.push({
        userKey:  otherKey,
        nickname: friend.nickname,
        lastText: idx ? idx.lastText : null,
        lastAt:   idx ? idx.lastAt   : null,
        lastFrom: idx ? idx.lastFrom : null,
      });
    });
  }

  // 최근 대화 순
  list.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

  res.json({ ok: true, conversations: list });
}

async function history(req, res) {
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
}

async function send(req, res) {
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
}

async function report(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const meSnap = await db.ref(`users/${userKey}`).get();
  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const me = meSnap.val();

  const trimmed = ((req.body && req.body.text) || '').trim();
  if (!trimmed) return res.status(400).json({ ok: false, error: '제보 내용을 입력하세요.' });
  if (trimmed.length > 1000) return res.status(400).json({ ok: false, error: '제보 내용은 1000자 이하여야 합니다.' });

  await db.ref('bugReports').push({
    fromKey:   userKey,
    studentId: me.studentId || null,
    name:      me.name || null,
    nickname:  me.nickname || userKey,
    text:      trimmed,
    at:        Date.now(),
  });

  res.json({ ok: true });
}

const ROUTES = { conversations, history, send, report };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
