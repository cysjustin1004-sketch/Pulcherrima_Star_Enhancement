// ============================================================
// auth.js — 회원가입 / 로그인 / 세션 유지
// 서버 API 기반: /api/auth/login, /api/auth/register
// ============================================================

const SESSION_KEY = 'star_session'; // localStorage 키
const REMEMBER_KEY = 'star_login_remember'; // localStorage 키 — 학번·이름만 저장(비밀번호는 저장하지 않음)

// ─── 유틸 ───────────────────────────────────────────────────

/** 닉네임 → Firebase 키 (특수문자 제거) */
function nicknameToKey(nickname) {
  return nickname.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '_');
}

/** SHA-256 해시 (WebCrypto API) — 로그인 시 클라이언트가 해싱 후 전송 */
async function sha256(text) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── 세션 ───────────────────────────────────────────────────

/** 현재 로그인된 세션 반환 (없으면 null) */
function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    // 구 형식 세션(token 없음)은 무효 처리
    if (s && !s.token) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** 세션 토큰 반환 (API 호출 시 X-Session-Token 헤더에 사용) */
function getToken() {
  const s = getSession();
  return s ? s.token : null;
}

/** 세션 저장 — token이 추가됨 */
function setSession(token, userKey, nickname) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, userKey, nickname }));
}

/** 로그아웃 */
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** 로그인 안 됐으면 login.html로 리다이렉트 */
function requireAuth() {
  const session = getSession();
  if (!session || !session.token) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// ─── 로그인 정보 기억하기 (학번·이름만 — 비밀번호는 절대 저장하지 않음) ─────

/** 기억된 학번·이름 반환 (없으면 null) */
function getRememberedLogin() {
  try {
    const r = JSON.parse(localStorage.getItem(REMEMBER_KEY));
    if (r && r.studentId && r.realName) return r;
    return null;
  } catch {
    return null;
  }
}

function saveRememberedLogin({ studentId, realName }) {
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ studentId, realName }));
}

function clearRememberedLogin() {
  localStorage.removeItem(REMEMBER_KEY);
}

// ─── 회원가입 ───────────────────────────────────────────────

// 학번 4자리: [학년(1~3)][반(1~5)][번호(01~21)]. 선생님/외부인은 예외적으로 "0000"을 쓴다.
const STUDENT_ID_PATTERN = /^[1-3][1-5](0[1-9]|1[0-9]|2[01])$/;

/**
 * 회원가입 — /api/auth/register 호출
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function register(studentId, realName, password) {
  const sid  = (studentId || '').trim();
  const name = (realName || '').trim();

  if (sid !== '0000' && !STUDENT_ID_PATTERN.test(sid)) {
    return { ok: false, error: '학번은 학년(1~3)·반(1~5)·번호(01~21) 4자리이거나, 선생님/외부인은 0000을 입력하세요.' };
  }
  if (!name || name.length > 20) {
    return { ok: false, error: '이름을 입력하세요(20자 이하).' };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: '비밀번호는 4자 이상이어야 합니다.' };
  }

  const passwordHash = await sha256(password);

  try {
    const res  = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId: sid, realName: name, passwordHash }),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || '회원가입 실패' };

    setSession(data.token, data.userKey, data.nickname);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '서버 연결 오류' };
  }
}

// ─── 로그인 ───────────────────────────────────────────────

/**
 * 로그인 — /api/auth/login 호출
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function login(studentId, realName, password) {
  const sid  = (studentId || '').trim();
  const name = (realName || '').trim();
  if (!sid || !name || !password) {
    return { ok: false, error: '학번, 이름, 비밀번호를 입력하세요.' };
  }

  const passwordHash = await sha256(password);

  try {
    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId: sid, realName: name, passwordHash }),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || '로그인 실패' };

    setSession(data.token, data.userKey, data.nickname);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '서버 연결 오류' };
  }
}

// ─── 유저 데이터 로드 ────────────────────────────────────────

/** 현재 세션 유저의 DB 데이터 로드 (Firebase 직접 읽기, 벤 체크 포함) */
async function loadCurrentUser() {
  const session = getSession();
  if (!session) return null;
  const data = await dbGet(`users/${session.userKey}`);
  if (!data) return null;
  if (data.banned) {
    clearSession();
    location.href = 'banned.html';
    return null;
  }
  return { ...data, userKey: session.userKey };
}
