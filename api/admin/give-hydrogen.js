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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { userKey, amount } = req.body;
  if (!userKey || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ ok: false, error: '올바른 userKey와 amount를 입력하세요.' });
  }

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const newHydrogen = (user.hydrogen || 0) + amount;
  await db.ref(`users/${userKey}/hydrogen`).set(newHydrogen);

  res.json({ ok: true, userKey, added: amount, total: newHydrogen });
};
