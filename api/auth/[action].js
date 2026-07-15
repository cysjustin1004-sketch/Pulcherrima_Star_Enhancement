const crypto = require('crypto');
const db = require('../../lib/firebase-admin');
const { createSession } = require('../../lib/session');
const { withActionLog } = require('../../lib/action-log');
const { STARTING_HYDROGEN, nicknameToKey, emailKey } = require('../../lib/game-config');
const { sendVerificationCode } = require('../../lib/mailer');
const { isRateLimited } = require('../../lib/rate-limit');
const { createPaymentRequest, getPaymentRequest } = require('../../lib/sada-coin');

// goedu.kr로 끝나는 이메일만 허용(하위 도메인 포함). 도트 경계로 앵커되어 있어
// "fakegoedu.kr" 같은 스푸핑은 걸러진다.
const EMAIL_PATTERN = /^[^@\s]+@(([a-z0-9-]+\.)*goedu\.kr)$/i;
const CODE_TTL      = 10 * 60 * 1000; // 코드 유효 10분
const RESEND_CD     = 60 * 1000;      // 재발송 쿨다운 60초
const MAX_ATTEMPTS  = 5;              // 코드 오답 허용 횟수
const MAX_SENDS     = 5;              // 이메일당 시간당 발송 상한
const SEND_WINDOW   = 60 * 60 * 1000; // 발송 상한 집계 윈도우 1시간
const VERIFY_WINDOW = 30 * 60 * 1000; // 인증 완료 후 register가 유효하다고 인정하는 시간

const SADA_SIGNUP_FEE   = 500;              // 가입 시 사다코인 징수액
const REGISTER_LOCK_TTL = 3 * 60 * 1000;    // 동일 닉네임 중복 결제요청 방지 창

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

/**
 * 검증·유일성 확인을 통과한 가입 정보로 실제 계정을 생성한다. 사다코인 결제가 필요
 * 없는(학번 0000) 즉시가입 경로와, 결제 승인 후 확정하는 register-confirm 경로가
 * 공유한다. 계정 생성 직전에 유일성을 다시 확인하는 이유는 — 결제 승인 대기(최대
 * 120초) 사이에 같은 닉네임/이메일/학번으로 다른 요청이 먼저 확정될 수 있어서다.
 * @returns {Promise<{ok:true, token} | {ok:false, status:number, error:string}>}
 */
async function finalizeRegistration({ userKey, nick, sid, name, mail, emailVerifiedAt, passwordHash }) {
  const eKey = emailKey(mail);
  const [existing, emailIdxSnap, sidSnap] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`emailIndex/${eKey}`).get(),
    sid !== '0000' ? db.ref(`studentIds/${sid}`).get() : Promise.resolve(null),
  ]);
  if (existing.exists()) {
    return { ok: false, status: 409, error: '이미 사용 중인 닉네임입니다.' };
  }
  if (emailIdxSnap.exists()) {
    return { ok: false, status: 409, error: '이미 이 이메일로 가입된 계정이 있습니다.' };
  }
  if (sidSnap && sidSnap.exists()) {
    return { ok: false, status: 409, error: '이미 등록된 학번입니다.' };
  }

  const upd = {
    [`userEmails/${userKey}`]: { email: mail, verifiedAt: emailVerifiedAt },
    [`emailIndex/${eKey}`]: userKey,
    [`emailVerifications/${eKey}`]: null, // 인증 기록 소비(재사용 방지)
    // 실명·학번은 공개 읽기(users/$uid)와 분리된 비공개 노드에 저장 — users/$uid는
    // 랭킹 표시를 위해 .read:true라, 여기 같이 두면 로그인 없이도 전체 실명/학번이 노출된다.
    [`userIdentities/${userKey}`]: { studentId: sid, realName: name },
  };

  // 0000(선생님/외부인)은 여러 명이 공유할 수 있어 중복 검사에서 제외 — 그 외 학번은
  // studentIds/{학번} 인덱스로 단 한 명만 등록되도록 보장(users 전체를 훑지 않고 조회 1번으로 확인).
  if (sid !== '0000') {
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
  return { ok: true, token };
}

/**
 * 회원가입 1단계 — 입력 검증 + 유일성 확인 후, 학번 0000(선생님/외부인)이면 사다코인
 * 결제 없이 바로 계정을 만들고, 그 외에는 사다코인 500 결제 요청만 생성한다(계정은
 * 아직 안 만듦 — 학생이 사다코인 화면에서 승인해야 register-confirm으로 넘어간다).
 */
async function registerRequest(req, res) {
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
  const emailIdxSnap = await db.ref(`emailIndex/${eKey}`).get();
  if (emailIdxSnap.exists()) {
    return res.status(409).json({ ok: false, error: '이미 이 이메일로 가입된 계정이 있습니다.' });
  }

  if (sid !== '0000') {
    const sidSnap = await db.ref(`studentIds/${sid}`).get();
    if (sidSnap.exists()) {
      return res.status(409).json({ ok: false, error: '이미 등록된 학번입니다.' });
    }
  }

  // 0000(선생님/외부인)은 사다코인에 대응하는 학번이 없어 결제 자체가 불가능 —
  // 코인 단계를 건너뛰고 바로 계정을 만든다.
  if (sid === '0000') {
    const result = await finalizeRegistration({
      userKey, nick, sid, name, mail, emailVerifiedAt: ev.verifiedAt, passwordHash,
    });
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    return res.json({ ok: true, token: result.token, userKey, nickname: nick });
  }

  // 같은 닉네임으로 이미 결제 대기 중인 요청이 있으면 중복 결제 요청을 막는다
  // (사다코인 승인 창이 여러 번 뜨는 것도 방지).
  const lockSnap = await db.ref(`registrationLocks/${userKey}`).get();
  if (lockSnap.exists() && Date.now() - (lockSnap.val().at || 0) < REGISTER_LOCK_TTL) {
    return res.status(409).json({ ok: false, error: '이미 진행 중인 가입 요청이 있습니다. 잠시 후 다시 시도해주세요.' });
  }

  // 학생 본인의 사다코인 남용(다른 학번으로 결제요청 스팸)을 막는 가벼운 방어선.
  if (isRateLimited(`sadareq:${sid}`, 5)) {
    return res.status(429).json({ ok: false, error: '잠시 후 다시 시도해주세요.' });
  }

  const payment = await createPaymentRequest(sid, SADA_SIGNUP_FEE, '별 강화하기 가입비');
  if (!payment.ok) {
    return res.status(payment.status).json({ ok: false, error: payment.error });
  }

  // 사다코인 request_id는 (문서 예시상) 작은 순번이라 추측/열거가 가능하다. requestId만
  // 알면 누구든 register-status로 승인 여부를 엿보고, 승인되는 순간 먼저 register를
  // 호출해 남의 계정 세션을 가로챌 수 있으므로, 확정(register) 호출에는 이 무작위
  // confirmToken도 함께 요구한다 — register-request 응답을 직접 받은 브라우저만 안다.
  const confirmToken = crypto.randomBytes(24).toString('hex');

  const now = Date.now();
  await db.ref().update({
    [`registrationLocks/${userKey}`]: { requestId: payment.requestId, studentId: sid, at: now },
    // 승인 확정 시 register-confirm이 그대로 쓸 수 있도록, 검증을 마친 가입 정보를
    // requestId에 매달아 서버 쪽에 보관한다 — 확정 단계에서 클라이언트가 다시 보낸
    // 값을 신뢰하지 않고(변조 방지) 이 기록만 사용한다.
    [`pendingRegistrations/${payment.requestId}`]: {
      userKey, nickname: nick, studentId: sid, realName: name,
      email: mail, emailVerifiedAt: ev.verifiedAt, passwordHash, confirmToken, createdAt: now,
    },
  });

  res.json({
    ok: true, needsApproval: true,
    requestId: payment.requestId, confirmToken, expiresAt: payment.expiresAt,
  });
}

/** 회원가입 상태 폴링 — 계정을 만들지 않고 사다코인 결제 요청 상태만 조회한다. */
async function registerStatus(req, res) {
  const requestId = req.body && req.body.requestId;
  if (!requestId) return res.status(400).json({ ok: false, error: '요청 정보가 없습니다.' });

  const result = await getPaymentRequest(requestId);
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
  res.json({ ok: true, status: result.status });
}

const PAYMENT_STATUS_MESSAGES = {
  pending:  '아직 결제가 승인되지 않았습니다. 사다코인에서 승인해주세요.',
  rejected: '결제가 거부되었습니다.',
  expired:  '결제 요청이 만료되었습니다. 처음부터 다시 시도해주세요.',
  canceled: '결제 요청이 취소되었습니다.',
};

/**
 * 회원가입 2단계(확정) — 사다코인 결제가 approved 상태인지 확인한 뒤에만 계정을
 * 생성한다. 이미 확정된 요청(재시도/중복 폴링)이면 계정을 다시 만들지 않고
 * 세션만 재발급해 멱등성을 보장한다.
 */
async function register(req, res) {
  const requestId = req.body && req.body.requestId;
  const confirmToken = req.body && req.body.confirmToken;
  if (!requestId || !confirmToken) {
    return res.status(400).json({ ok: false, error: '요청 정보가 없습니다.' });
  }

  const pendingSnap = await db.ref(`pendingRegistrations/${requestId}`).get();

  // 멱등성: 이미 코인 차감·계정 생성까지 끝난 요청이면 재확정하지 않고 세션만 재발급.
  // (pendingRegistrations는 확정 시 null로 지우므로, 없어졌다는 건 이미 처리됐거나
  // 애초에 존재한 적 없는 요청이라는 뜻 — coinPayments로 어느 쪽인지 구분한다.)
  if (!pendingSnap.exists()) {
    const paidSnap = await db.ref(`coinPayments/${requestId}`).get();
    if (paidSnap.exists()) {
      const paid = paidSnap.val();
      const userSnap = await db.ref(`users/${paid.userKey}`).get();
      if (!userSnap.exists()) {
        return res.status(500).json({ ok: false, error: '계정 정보를 확인할 수 없습니다. 관리자에게 문의하세요.' });
      }
      const token = await createSession(paid.userKey);
      return res.json({ ok: true, token, userKey: paid.userKey, nickname: userSnap.val().nickname });
    }
    return res.status(404).json({ ok: false, error: '가입 요청을 찾을 수 없습니다. 처음부터 다시 시도해주세요.' });
  }
  const pending = pendingSnap.val();

  // requestId는 사다코인 쪽 순번이라 추측될 수 있으므로, register-request 응답을 직접
  // 받은 브라우저만 아는 confirmToken까지 일치해야 확정을 진행한다(세션 가로채기 방지).
  const a = Buffer.from(confirmToken);
  const b = Buffer.from(pending.confirmToken || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ ok: false, error: '유효하지 않은 요청입니다.' });
  }

  const payment = await getPaymentRequest(requestId);
  if (!payment.ok) {
    return res.status(payment.status).json({ ok: false, error: payment.error });
  }
  if (payment.status !== 'approved') {
    return res.status(409).json({
      ok: false,
      status: payment.status,
      error: PAYMENT_STATUS_MESSAGES[payment.status] || '결제가 완료되지 않았습니다.',
    });
  }

  const result = await finalizeRegistration({
    userKey: pending.userKey, nick: pending.nickname, sid: pending.studentId,
    name: pending.realName, mail: pending.email, emailVerifiedAt: pending.emailVerifiedAt,
    passwordHash: pending.passwordHash,
  });

  if (!result.ok) {
    // 사다코인은 이미 차감됐는데(학생이 승인함) 그 사이 닉네임/이메일/학번이 다른 요청에
    // 선점돼 계정 생성이 막힌 극단적 경우 — 관리자가 사다코인 대시보드에서 수동
    // 환불(club_to_student)하도록 감사 로그를 남긴다. 자동 환불은 하지 않는다(학생
    // 재승인이 또 필요해 오히려 복잡해짐).
    await db.ref(`coinRefundNeeded/${requestId}`).set({
      studentId: pending.studentId, amount: SADA_SIGNUP_FEE, reason: result.error, at: Date.now(),
    });
    return res.status(result.status).json({
      ok: false,
      error: `${result.error} (사다코인은 이미 차감되었습니다 — 관리자에게 문의해주세요.)`,
    });
  }

  await db.ref().update({
    [`coinPayments/${requestId}`]: { userKey: pending.userKey, amount: SADA_SIGNUP_FEE, at: Date.now() },
    [`pendingRegistrations/${requestId}`]: null,
    [`registrationLocks/${pending.userKey}`]: null,
  });

  res.json({ ok: true, token: result.token, userKey: pending.userKey, nickname: pending.nickname });
}

const ROUTES = {
  login,
  'register-request': registerRequest,
  'register-status': registerStatus,
  register,
  'send-email-code': sendEmailCode,
  'verify-email-code': verifyEmailCode,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const action = req.query.action;
  const handler = ROUTES[action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return withActionLog(req, res, `auth/${action}`, handler);
};
