// ============================================================
// auth.js — 회원가입 / 로그인 / 세션 유지
// Firebase Auth 대신 Realtime DB + SHA-256 해시 사용
// ============================================================

const SESSION_KEY = 'star_session'; // localStorage 키

// ─── 유틸 ───────────────────────────────────────────────────

/** 닉네임 → Firebase 키 (특수문자 제거) */
function nicknameToKey(nickname) {
  return nickname.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '_');
}

/** SHA-256 해시 (WebCrypto API) */
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

/** 현재 로그인된 유저 정보 반환 (없으면 null) */
function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

/** 세션 저장 */
function setSession(userKey, nickname) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userKey, nickname }));
}

/** 로그아웃 */
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** 로그인 안 됐으면 login.html로 리다이렉트 */
function requireAuth() {
  const session = getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// ─── 회원가입 ───────────────────────────────────────────────

/**
 * 회원가입
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function register(nickname, password) {
  const nick = nickname.trim();

  if (!nick || nick.length < 2 || nick.length > 12) {
    return { ok: false, error: '닉네임은 2~12자여야 합니다.' };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: '비밀번호는 4자 이상이어야 합니다.' };
  }

  const userKey = nicknameToKey(nick);
  const existing = await dbGet(`users/${userKey}`);
  if (existing) {
    return { ok: false, error: '이미 사용 중인 닉네임입니다.' };
  }

  const passwordHash = await sha256(password);
  const now = Date.now();

  await dbSet(`users/${userKey}`, {
    nickname: nick,
    passwordHash,
    hydrogen: STARTING_HYDROGEN,
    currentStar: 0,
    bestStar: 0,
    protectionScrolls: 0,
    unlockedCodex: [0],   // +0은 처음부터 해금
    items: {
      stellar_wind: 0,
      hypergiant_core: 0,
      supernova_glow: 0,
      neutron_crust: 0,
      pulsar_signal: 0,
      magnetar_flare: 0,
      hawking_radiation: 0,
      dark_matter: 0,
    },
    storedStars: {},       // { level: count } 형태
    rateWindow: { startMs: now, count: 0 },
    createdAt: now,
  });

  setSession(userKey, nick);
  return { ok: true };
}

// ─── 로그인 ───────────────────────────────────────────────

/**
 * 로그인
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function login(nickname, password) {
  const nick = nickname.trim();
  if (!nick || !password) {
    return { ok: false, error: '닉네임과 비밀번호를 입력하세요.' };
  }

  const userKey = nicknameToKey(nick);
  const user = await dbGet(`users/${userKey}`);
  if (!user) {
    return { ok: false, error: '존재하지 않는 닉네임입니다.' };
  }

  const hash = await sha256(password);
  if (hash !== user.passwordHash) {
    return { ok: false, error: '비밀번호가 틀렸습니다.' };
  }

  setSession(userKey, user.nickname);
  return { ok: true };
}

// ─── 유저 데이터 로드 ────────────────────────────────────────

/** 현재 세션 유저의 DB 데이터 로드 (벤 체크 포함) */
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
