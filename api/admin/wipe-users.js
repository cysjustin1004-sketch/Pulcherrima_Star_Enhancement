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

// 게임 구조를 공통 17단계 + 5트랙 분기(v2)로 전면 개편하면서, 옛 구조(선형
// 0~29강)로 저장된 기존 유저 데이터를 전부 초기화하기 위한 일회성 엔드포인트.
// confirm 필드에 정확한 문구를 요구해 실수로 호출되는 것을 방지한다.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { confirm } = req.body;
  if (confirm !== '전체 유저 데이터 삭제') {
    return res.status(400).json({ ok: false, error: '확인 문구가 일치하지 않습니다.' });
  }

  await db.ref().update({
    users: null,
    enhanceLogs: null,
    authSecrets: null,
  });

  res.json({ ok: true });
};
