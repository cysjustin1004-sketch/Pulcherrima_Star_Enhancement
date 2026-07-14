const db = require('../../lib/firebase-admin');
const { createSession } = require('../../lib/session');
const { STARTING_HYDROGEN, nicknameToKey } = require('../../lib/game-config');

async function login(req, res) {
  const { studentId, name, passwordHash } = req.body;
  if (!studentId || !name || !passwordHash) {
    return res.status(400).json({ ok: false, error: '학번, 이름, 비밀번호를 입력하세요.' });
  }

  const userKey = nicknameToKey(studentId);
  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) {
    return res.status(401).json({ ok: false, error: '존재하지 않는 학번입니다.' });
  }

  const user = snap.val();
  if (user.banned) {
    return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });
  }
  if ((user.name || '').trim() !== name.trim()) {
    return res.status(401).json({ ok: false, error: '학번 또는 이름이 일치하지 않습니다.' });
  }

  const secretSnap = await db.ref(`authSecrets/${userKey}`).get();
  let storedHash = secretSnap.exists() ? secretSnap.val().passwordHash : null;

  // 마이그레이션: 과거 스키마(users/$uid.passwordHash, 공개 읽기 경로)에 남아있는
  // 기존 계정 — 이번 로그인에서 검증되면 authSecrets로 옮기고 공개 경로에서 제거
  if (!storedHash && user.passwordHash) {
    storedHash = user.passwordHash;
    if (passwordHash === storedHash) {
      await db.ref(`authSecrets/${userKey}`).set({ passwordHash: storedHash });
      await db.ref(`users/${userKey}/passwordHash`).remove();
    }
  }

  if (!storedHash || passwordHash !== storedHash) {
    return res.status(401).json({ ok: false, error: '비밀번호가 틀렸습니다.' });
  }

  const token = await createSession(userKey);
  res.json({ ok: true, token, userKey, nickname: user.nickname });
}

async function register(req, res) {
  const { studentId, name, passwordHash } = req.body;
  const sid = (studentId || '').trim();
  const nm  = (name || '').trim();

  if (!sid || sid.length > 12) {
    return res.status(400).json({ ok: false, error: '학번을 입력하세요.' });
  }
  if (!nm || nm.length > 10) {
    return res.status(400).json({ ok: false, error: '이름을 입력하세요.' });
  }
  if (!passwordHash || passwordHash.length !== 64) {
    return res.status(400).json({ ok: false, error: '비밀번호가 유효하지 않습니다.' });
  }

  const userKey = nicknameToKey(sid);
  const existing = await db.ref(`users/${userKey}`).get();
  if (existing.exists()) {
    return res.status(409).json({ ok: false, error: '이미 등록된 학번입니다.' });
  }

  const nick = `${sid} ${nm}`;
  const now = Date.now();
  await db.ref(`authSecrets/${userKey}`).set({ passwordHash });
  await db.ref(`users/${userKey}`).set({
    studentId: sid,
    name: nm,
    nickname: nick,
    hydrogen: STARTING_HYDROGEN,
    currentStar: 0,
    bestStar: 0,
    protectionScrolls: 0,
    battleWins: 0,
    battleLosses: 0,
    unlockedCodex: ['0'],
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
}

const ROUTES = { login, register };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
