const db = require('./firebase-admin');
const { validateSession } = require('./session');

// 로그에 절대 평문으로 남기면 안 되는 필드 — 값을 마스킹한다.
const REDACT_KEYS = new Set(['passwordHash', 'code']);

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body || null;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = REDACT_KEYS.has(k) ? '[REDACTED]' : v;
  }
  return out;
}

/**
 * API 라우트 핸들러를 감싸서 모든 호출(성공/실패 무관)을 actionLogs/{userKey}에 기록한다.
 * "무슨 버튼을 눌렀고 뭘 했는지"를 나중에 그대로 재구성할 수 있도록, 요청 라우트·바디와
 * 응답 결과(ok/error)·시각을 함께 남긴다. 치팅/버그 재현 조사 시 코드 재분석 대신
 * 실제 행동 순서를 바로 확인하기 위한 용도.
 *
 * 로깅 자체는 fire-and-forget이라 실패해도 실제 API 응답을 막지 않는다(enhanceLogs와 동일 철학).
 *
 * @param {object} req
 * @param {object} res
 * @param {string} routeName - 예: "game/enhance", "shop/buy"
 * @param {(req, res) => Promise<void>} handler - 실제 라우트 핸들러
 */
async function withActionLog(req, res, routeName, handler) {
  const startedAt = Date.now();
  // 로깅 전용 조회 — 실제 인증(401 처리 등)은 handler가 그대로 수행한다.
  const userKey = await validateSession(req).catch(() => null);

  // res.status/res.json을 가로채 실제 응답 내용을 로그에도 남긴다. 클라이언트로 나가는
  // 응답 자체는 원래 함수를 그대로 호출해 그대로 통과시키므로 동작에 영향 없다.
  let capturedStatus = 200;
  let capturedBody = null;
  const originalStatus = res.status.bind(res);
  const originalJson = res.json.bind(res);
  res.status = (code) => { capturedStatus = code; return originalStatus(code); };
  res.json = (body) => { capturedBody = body; return originalJson(body); };

  try {
    await handler(req, res);
  } finally {
    const key = userKey || 'anonymous';
    const entry = {
      route: routeName,
      body: sanitizeBody(req.body),
      status: capturedStatus,
      ok: capturedBody && typeof capturedBody.ok === 'boolean' ? capturedBody.ok : null,
      error: capturedBody && capturedBody.error ? capturedBody.error : null,
      ip: req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || null,
      at: startedAt,
      durationMs: Date.now() - startedAt,
    };
    db.ref(`actionLogs/${key}`).push(entry).catch(() => {});
  }
}

module.exports = { withActionLog };
