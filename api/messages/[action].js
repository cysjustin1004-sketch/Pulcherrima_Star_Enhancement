const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { withActionLog } = require('../../lib/action-log');

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

  // 이 대화를 조회하는 것 자체가 "읽음" 처리 — 전역 알림 폴러(notifications)가
  // 이미 채팅창에서 보고 있는 메시지를 뒤늦게 다시 토스트로 띄우지 않도록
  // 내 쪽 lastSeenAt을 갱신한다. 실패해도 대화 조회 자체엔 영향 없게 fire-and-forget.
  db.ref(`messageIndex/${userKey}/${withKey}/lastSeenAt`).set(Date.now()).catch(() => {});

  res.json({ ok: true, messages });
}

async function send(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { toKey, text } = req.body;
  const trimmed = (text || '').trim();
  if (!toKey) return res.status(400).json({ ok: false, error: '대상을 지정하세요.' });
  if (!trimmed) return res.status(400).json({ ok: false, error: '메시지를 입력하세요.' });
  if (trimmed.length > 500) return res.status(400).json({ ok: false, error: '메시지는 500자 이하여야 합니다.' });

  // 서로 의존관계 없는 조회를 병렬로 (기존엔 순차 await 2번)
  const [meSnap, friendSnap] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`friends/${userKey}/${toKey}`).get(),
  ]);
  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const me = meSnap.val();
  if (me.banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });
  if (!friendSnap.exists()) {
    return res.status(403).json({ ok: false, error: '친구만 메시지를 보낼 수 있습니다.' });
  }

  const at = Date.now();
  const cid = convId(userKey, toKey);
  const pushKey = db.ref(`messages/${cid}`).push().key;

  // messageIndex에 fromNickname을 같이 저장해두면, 수신자가 알림(notifications)을
  // 표시할 때 보낸 사람 닉네임 조회 없이 바로 쓸 수 있다(friendRequests가 이미
  // fromNickname을 저장하는 것과 같은 이유).
  await db.ref().update({
    [`messages/${cid}/${pushKey}`]: { from: userKey, text: trimmed, at },
    [`messageIndex/${userKey}/${toKey}`]: { lastText: trimmed, lastAt: at, lastFrom: userKey, fromNickname: me.nickname },
    [`messageIndex/${toKey}/${userKey}`]: { lastText: trimmed, lastAt: at, lastFrom: userKey, fromNickname: me.nickname },
  });

  res.json({ ok: true, message: { from: userKey, text: trimmed, at } });
}

// 새 메시지 알림 — 전역 폴러(star-game/notify.js) 전용. battle/notifications와
// 동일한 "조회 → 선별 → 그 자리에서 소비(lastSeenAt 갱신) → 응답" 패턴.
// messageIndex/{userKey}/{otherKey}는 대화별 최신 상태(lastText/lastAt/lastFrom)를
// 담고 있으므로, lastFrom이 내가 아니고 lastAt이 내가 마지막으로 본 시점보다
// 최신인 대화만 "새 메시지"로 판정한다.
async function notifications(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const snap = await db.ref(`messageIndex/${userKey}`).get();
  const raw = snap.exists() ? snap.val() : {};

  const pending = [];
  for (const [otherKey, entry] of Object.entries(raw)) {
    if (!entry || entry.lastFrom === userKey) continue; // 마지막 메시지가 내가 보낸 것이면 알림 불필요
    const lastSeenAt = entry.lastSeenAt || 0;
    if ((entry.lastAt || 0) > lastSeenAt) pending.push({ otherKey, entry });
  }

  // 이 필드를 추가하기 전에 이미 있던 대화는 fromNickname이 없을 수 있으므로,
  // 없는 것만 보완 조회(신규 대화는 send()가 이미 채워주므로 대부분 조회 불필요).
  const missing = pending.filter(p => !p.entry.fromNickname);
  const missingSnaps = await Promise.all(missing.map(p => db.ref(`users/${p.otherKey}/nickname`).get()));
  const fallbackNickname = {};
  missing.forEach((p, i) => { fallbackNickname[p.otherKey] = missingSnaps[i].val() || p.otherKey; });

  const items = [];
  const upd = {};
  for (const { otherKey, entry } of pending) {
    items.push({
      fromKey:  otherKey,
      nickname: entry.fromNickname || fallbackNickname[otherKey],
      text:     entry.lastText,
      at:       entry.lastAt,
    });
    upd[`messageIndex/${userKey}/${otherKey}/lastSeenAt`] = entry.lastAt; // 읽음 처리(소비)
  }
  if (Object.keys(upd).length) await db.ref().update(upd);

  items.sort((a, b) => a.at - b.at);
  res.json({ ok: true, items });
}

async function report(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const [meSnap, identitySnap] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`userIdentities/${userKey}`).get(),
  ]);
  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const me = meSnap.val();
  const identity = identitySnap.exists() ? identitySnap.val() : {};

  const trimmed = ((req.body && req.body.text) || '').trim();
  if (!trimmed) return res.status(400).json({ ok: false, error: '제보 내용을 입력하세요.' });
  if (trimmed.length > 1000) return res.status(400).json({ ok: false, error: '제보 내용은 1000자 이하여야 합니다.' });

  await db.ref('bugReports').push({
    fromKey:   userKey,
    studentId: identity.studentId || null,
    realName:  identity.realName || null,
    nickname:  me.nickname || userKey,
    text:      trimmed,
    at:        Date.now(),
  });

  res.json({ ok: true });
}

const ROUTES = { conversations, history, send, report, notifications };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const action = req.query.action;
  const handler = ROUTES[action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return withActionLog(req, res, `messages/${action}`, handler);
};
