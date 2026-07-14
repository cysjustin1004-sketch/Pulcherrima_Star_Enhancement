const db = require('../../lib/firebase-admin');
const { createSession } = require('../../lib/session');
const { STARTING_HYDROGEN, nicknameToKey } = require('../../lib/game-config');

async function login(req, res) {
  const { nickname, passwordHash } = req.body;
  if (!nickname || !passwordHash) {
    return res.status(400).json({ ok: false, error: '닉네임과 비밀번호를 입력하세요.' });
  }

  const userKey = nicknameToKey(nickname);
  // users/authSecrets는 서로 의존관계 없는 조회라 병렬로 (기존엔 순차 await 2번)
  const [snap, secretSnap] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`authSecrets/${userKey}`).get(),
  ]);
  if (!snap.exists()) {
    return res.status(401).json({ ok: false, error: '존재하지 않는 닉네임입니다.' });
  }

  const user = snap.val();
  if (user.banned) {
    return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });
  }

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

// 학번 4자리: [학년(1~3)][반(1~5)][번호(01~21)]. 선생님/외부인은 예외적으로 "0000"을 쓴다.
const STUDENT_ID_PATTERN = /^[1-3][1-5](0[1-9]|1[0-9]|2[01])$/;

async function register(req, res) {
  const { nickname, passwordHash, studentId, realName } = req.body;
  const nick = (nickname || '').trim();
  const sid  = (studentId || '').trim();
  const name = (realName || '').trim();

  if (!nick || nick.length < 2 || nick.length > 12) {
    return res.status(400).json({ ok: false, error: '닉네임은 2~12자여야 합니다.' });
  }
  if (!passwordHash || passwordHash.length !== 64) {
    return res.status(400).json({ ok: false, error: '비밀번호가 유효하지 않습니다.' });
  }
  if (sid !== '0000' && !STUDENT_ID_PATTERN.test(sid)) {
    return res.status(400).json({ ok: false, error: '학번은 학년(1~3)·반(1~5)·번호(01~21) 4자리이거나, 선생님/외부인은 0000을 입력하세요.' });
  }
  if (!name || name.length > 20) {
    return res.status(400).json({ ok: false, error: '이름을 입력하세요(20자 이하).' });
  }

  const userKey = nicknameToKey(nick);
  const existing = await db.ref(`users/${userKey}`).get();
  if (existing.exists()) {
    return res.status(409).json({ ok: false, error: '이미 사용 중인 닉네임입니다.' });
  }

  const upd = {};

  // 0000(선생님/외부인)은 여러 명이 공유할 수 있어 중복 검사에서 제외 — 그 외 학번은
  // studentIds/{학번} 인덱스로 단 한 명만 등록되도록 보장(users 전체를 훑지 않고 조회 1번으로 확인).
  if (sid !== '0000') {
    const sidSnap = await db.ref(`studentIds/${sid}`).get();
    if (sidSnap.exists()) {
      return res.status(409).json({ ok: false, error: '이미 등록된 학번입니다.' });
    }
    upd[`studentIds/${sid}`] = userKey;
  }

  const now = Date.now();
  // authSecrets/users 두 쓰기를 하나의 update()로 묶어 왕복 횟수를 줄이고,
  // 둘 중 하나만 반영된 채 끊기는 중간 상태의 가능성도 함께 줄인다.
  upd[`authSecrets/${userKey}`] = { passwordHash };
  upd[`users/${userKey}`] = {
    nickname: nick,
    studentId: sid,
    realName: name,
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
  };
  await db.ref().update(upd);

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
