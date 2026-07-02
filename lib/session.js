const crypto = require('crypto');
const db = require('./firebase-admin');

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7일

// 환경변수 없으면 Firebase 설정 값으로 결정론적 시크릿 생성
// → 모든 서버리스 인스턴스가 동일한 시크릿을 공유
const HMAC_SECRET = process.env.SESSION_SECRET ||
  crypto.createHash('sha256')
    .update((process.env.FIREBASE_PROJECT_ID || '') + (process.env.FIREBASE_CLIENT_EMAIL || ''))
    .digest('hex');

/**
 * 서명된 세션 토큰 생성 — Firebase에 저장하지 않음
 * 형식: base64url(payload).base64url(hmac)
 */
function createSession(userKey) {
  const payload = Buffer.from(JSON.stringify({
    userKey,
    exp: Date.now() + SESSION_TTL,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('base64url');
  return Promise.resolve(`${payload}.${sig}`);
}

/**
 * X-Session-Token 헤더의 토큰을 로컬에서 검증 (Firebase 읽기 없음)
 * @returns {string|null} userKey 또는 null
 */
function validateSession(req) {
  const token = req.headers['x-session-token'];
  if (!token) return Promise.resolve(null);

  const dot = token.indexOf('.');
  if (dot === -1) return Promise.resolve(null);

  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('base64url');

  // 타이밍 공격 방지
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return Promise.resolve(null);
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return Promise.resolve(null);
  }

  if (Date.now() > data.exp) return Promise.resolve(null);
  return Promise.resolve(data.userKey);
}

// 로그아웃 (HMAC 토큰은 서버에 저장되지 않아 별도 삭제 불필요)
function deleteSession() {
  return Promise.resolve();
}

module.exports = { createSession, validateSession, deleteSession };
