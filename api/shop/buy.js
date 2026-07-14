const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const ref = db.ref(`users/${userKey}`);

  // 1) 먼저 그냥 get() — 정상 동작 확인용
  const getSnap = await ref.get();
  const getResult = { exists: getSnap.exists(), hydrogenViaGet: getSnap.exists() ? getSnap.val().hydrogen : null };

  // 2) get() 직후 바로 transaction() — "연결 워밍업" 가설 검증
  let callbackCallCount = 0;
  let lastSeenUser = 'NEVER_CALLED';
  let caughtError = null;
  let txResult;
  const start = Date.now();
  try {
    txResult = await ref.transaction((user) => {
      callbackCallCount++;
      lastSeenUser = user === null ? 'NULL' : typeof user;
      if (user === null) return;
      return user; // 아무것도 안 바꾸고 그대로 반환(디버그 전용)
    });
  } catch (e) {
    caughtError = { message: e.message, code: e.code };
  }
  const elapsedMs = Date.now() - start;

  return res.json({
    DEBUG: true,
    getResult,
    txElapsedMs: elapsedMs,
    callbackCallCount,
    lastSeenUser,
    txResultCommitted: txResult ? txResult.committed : 'NO_TX_RESULT',
    caughtError,
  });
};
