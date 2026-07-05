const db = require('../../lib/firebase-admin');

// 관리자 세션 토큰 검증 헬퍼
async function validateAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  const snap = await db.ref(`adminSessions/${token}`).get();
  if (!snap.exists()) return false;
  // 24시간 만료
  if (Date.now() - snap.val().createdAt > 24 * 60 * 60 * 1000) {
    await db.ref(`adminSessions/${token}`).remove();
    return false;
  }
  return true;
}

// 일회성 보안 마이그레이션 — 공개 읽기 경로(users/$uid.passwordHash)에 남아있는
// 구버전 계정의 비밀번호 해시를 비공개 경로(authSecrets/$uid)로 옮기고 제거한다.
// 로그인 시에도 개별적으로 마이그레이션되지만(auth/login.js), 다시 로그인하지
// 않는 비활성 계정까지 즉시 정리하기 위한 일괄 실행용 엔드포인트.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const snap = await db.ref('users').get();
  const users = snap.val() || {};

  let migrated = 0;
  for (const [userKey, user] of Object.entries(users)) {
    if (!user.passwordHash) continue;
    await db.ref(`authSecrets/${userKey}`).set({ passwordHash: user.passwordHash });
    await db.ref(`users/${userKey}/passwordHash`).remove();
    migrated++;
  }

  res.json({ ok: true, migrated, totalUsers: Object.keys(users).length });
};
