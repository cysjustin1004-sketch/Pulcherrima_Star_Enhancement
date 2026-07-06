const db = require('../../lib/firebase-admin');

// 관리자 세션 토큰 검증 헬퍼
async function validateAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  const snap = await db.ref(`adminSessions/${token}`).get();
  if (!snap.exists()) return false;
  if (Date.now() - snap.val().createdAt > 24 * 60 * 60 * 1000) {
    await db.ref(`adminSessions/${token}`).remove();
    return false;
  }
  return true;
}

// 일회성 관리자 유지보수 엔드포인트 (Hobby 플랜 서버리스 함수 12개 제한 때문에
// migrate-secrets/wipe-users 두 엔드포인트를 action 분기로 합쳐둠)
//
// action: 'migrate-secrets' — 공개 읽기 경로(users/$uid.passwordHash)에 남아있는
//   구버전 계정의 비밀번호 해시를 비공개 경로(authSecrets/$uid)로 옮기고 제거.
// action: 'wipe-users' — 공통 17단계 + 5트랙 분기(v2) 개편에 따라 옛 구조로
//   저장된 유저/로그/비밀번호 데이터를 전부 삭제. confirm 문구 일치 필요.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { action, confirm } = req.body;

  if (action === 'migrate-secrets') {
    const snap = await db.ref('users').get();
    const users = snap.val() || {};

    let migrated = 0;
    for (const [userKey, user] of Object.entries(users)) {
      if (!user.passwordHash) continue;
      await db.ref(`authSecrets/${userKey}`).set({ passwordHash: user.passwordHash });
      await db.ref(`users/${userKey}/passwordHash`).remove();
      migrated++;
    }
    return res.json({ ok: true, migrated, totalUsers: Object.keys(users).length });
  }

  if (action === 'wipe-users') {
    if (confirm !== '전체 유저 데이터 삭제') {
      return res.status(400).json({ ok: false, error: '확인 문구가 일치하지 않습니다.' });
    }
    await db.ref().update({ users: null, enhanceLogs: null, authSecrets: null });
    return res.json({ ok: true });
  }

  res.status(400).json({ ok: false, error: '알 수 없는 action입니다.' });
};
