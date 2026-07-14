const crypto = require('crypto');
const db = require('../../lib/firebase-admin');
const { createSession } = require('../../lib/session');
const { STARTING_HYDROGEN, nicknameToKey, emailKey } = require('../../lib/game-config');
const { sendVerificationCode } = require('../../lib/mailer');
const { isRateLimited } = require('../../lib/rate-limit');

// goedu.kr로 끝나는 이메일만 허용(하위 도메인 포함). 도트 경계로 앵커되어 있어
// "fakegoedu.kr" 같은 스푸핑은 걸러진다.
const EMAIL_PATTERN = /^[^@\s]+@(([a-z0-9-]+\.)*goedu\.kr)$/i;
const CODE_TTL      = 10 * 60 * 1000; // 코드 유효 10분
const RESEND_CD     = 60 * 1000;      // 재발송 쿨다운 60초
const MAX_ATTEMPTS  = 5;              // 코드 오답 허용 횟수
const MAX_SENDS     = 5;              // 이메일당 시간당 발송 상한
const SEND_WINDOW   = 60 * 60 * 1000; // 발송 상한 집계 윈도우 1시간
const VERIFY_WINDOW = 30 * 60 * 1000; // 인증 완료 후 register가 유효하다고 인정하는 시간

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

async function sendEmailCode(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ ok: false, error: 'goedu.kr 형식의 이메일을 입력해주세요.' });
  }

  const eKey = emailKey(email);

  // 메모리 레이트리밋(웜 인스턴스 한정) — DB 카운터를 확인하기 전 값싼 1차 방어선
  if (isRateLimited(`emailsend:${eKey}`, 3)) {
    return res.status(429).json({ ok: false, error: '잠시 후 다시 시도해주세요.' });
  }

  const now = Date.now();
  const snap = await db.ref(`emailVerifications/${eKey}`).get();
  const prev = snap.exists() ? snap.val() : null;

  if (prev && now - (prev.lastSentAt || 0) < RESEND_CD) {
    return res.status(429).json({ ok: false, error: '잠시 후 다시 시도해주세요.' });
  }

  let sendCount = 1;
  let windowStart = now;
  if (prev && prev.windowStart && now - prev.windowStart < SEND_WINDOW) {
    windowStart = prev.windowStart;
    sendCount = (prev.sendCount || 0) + 1;
    if (sendCount > MAX_SENDS) {
      return res.status(429).json({ ok: false, error: '발송 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.' });
    }
  }

  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  await db.ref(`emailVerifications/${eKey}`).set({
    email, codeHash,
    expiresAt: now + CODE_TTL,
    attempts: 0,
    lastSentAt: now,
    sendCount, windowStart,
    verified: false,
    verifiedAt: null,
  });

  try {
    await sendVerificationCode(email, code);
  } catch (e) {
    await db.ref(`emailVerifications/${eKey}`).remove();
    return res.status(502).json({ ok: false, error: '메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }

  res.json({ ok: true });
}

async function verifyEmailCode(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const code  = (req.body.code || '').trim();
  if (!EMAIL_PATTERN.test(email) || !code) {
    return res.status(400).json({ ok: false, error: '이메일과 인증 코드를 입력하세요.' });
  }

  const eKey = emailKey(email);
  const snap = await db.ref(`emailVerifications/${eKey}`).get();
  if (!snap.exists()) {
    return res.status(410).json({ ok: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' });
  }

  const rec = snap.val();
  if (Date.now() > rec.expiresAt) {
    return res.status(410).json({ ok: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' });
  }
  if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
    return res.status(429).json({ ok: false, error: '시도 횟수를 초과했습니다. 코드를 다시 요청해주세요.' });
  }

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const a = Buffer.from(codeHash, 'hex');
  const b = Buffer.from(rec.codeHash, 'hex');
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    await db.ref(`emailVerifications/${eKey}/attempts`).set((rec.attempts || 0) + 1);
    return res.status(401).json({ ok: false, error: '코드가 다릅니다.' });
  }

  await db.ref(`emailVerifications/${eKey}`).update({ verified: true, verifiedAt: Date.now() });
  res.json({ ok: true });
}

async function register(req, res) {
  const { nickname, passwordHash, studentId, realName, email } = req.body;
  const nick = (nickname || '').trim();
  const sid  = (studentId || '').trim();
  const name = (realName || '').trim();
  const mail = (email || '').trim().toLowerCase();

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
  if (!EMAIL_PATTERN.test(mail)) {
    return res.status(400).json({ ok: false, error: 'goedu.kr 형식의 이메일을 입력해주세요.' });
  }

  // 서버가 직접 인증 기록을 재확인 — 클라이언트가 "인증 완료" 플래그만 보내는 것을 신뢰하지 않는다.
  const eKey = emailKey(mail);
  const evSnap = await db.ref(`emailVerifications/${eKey}`).get();
  const ev = evSnap.exists() ? evSnap.val() : null;
  if (!ev || !ev.verified || ev.email !== mail || Date.now() - ev.verifiedAt > VERIFY_WINDOW) {
    return res.status(403).json({ ok: false, error: '이메일 본인인증을 완료해주세요.' });
  }

  const userKey = nicknameToKey(nick);
  const existing = await db.ref(`users/${userKey}`).get();
  if (existing.exists()) {
    return res.status(409).json({ ok: false, error: '이미 사용 중인 닉네임입니다.' });
  }

  // 같은 구글(goedu.kr) 계정으로는 계정을 하나만 만들 수 있도록 emailIndex/{이메일}로 중복 검사.
  // userEmails는 userKey→email(관리자 조회용) 방향이라 반대 방향 조회(email→userKey)가 안 되므로
  // 별도 인덱스가 필요하다.
  const emailIdxSnap = await db.ref(`emailIndex/${eKey}`).get();
  if (emailIdxSnap.exists()) {
    return res.status(409).json({ ok: false, error: '이미 이 이메일로 가입된 계정이 있습니다.' });
  }

  const upd = {
    [`userEmails/${userKey}`]: { email: mail, verifiedAt: ev.verifiedAt },
    [`emailIndex/${eKey}`]: userKey,
    [`emailVerifications/${eKey}`]: null, // 인증 기록 소비(재사용 방지)
    // 실명·학번은 공개 읽기(users/$uid)와 분리된 비공개 노드에 저장 — users/$uid는
    // 랭킹 표시를 위해 .read:true라, 여기 같이 두면 로그인 없이도 전체 실명/학번이 노출된다.
    [`userIdentities/${userKey}`]: { studentId: sid, realName: name },
  };

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

const ROUTES = {
  login,
  register,
  'send-email-code': sendEmailCode,
  'verify-email-code': verifyEmailCode,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
