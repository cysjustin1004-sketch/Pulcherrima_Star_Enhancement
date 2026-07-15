// 사다코인(SADA COIN) 외부 결제 API 연동 — 동아리별 X-API-Key로 인증하는 REST API.
// 문서: https://coin.sada.ai.kr/docs
//
// 결제는 즉시 확정이 아니라 "요청 생성 → 학생 본인이 사다코인 화면에서 승인" 흐름이라,
// 여기서는 (1) 결제 요청 생성 (2) 상태 조회, 두 함수만 제공한다. 실제 회원가입 확정
// 로직(승인 확인 후 계정 생성)은 api/auth/[action].js에서 처리한다.

const SADA_BASE   = 'https://api.sada.ai.kr/api/v1';
const FETCH_TIMEOUT_MS = 8000;

function apiKey() {
  // 환경변수 값에 복사/붙여넣기 과정에서 섞여드는 앞뒤 공백·개행을 방지 — Vercel
  // 콘솔에 값 붙여넣을 때 흔히 발생하고, 그러면 키가 있어도 401로만 보인다.
  const key = (process.env.SADA_API_KEY || '').trim();
  if (!key) throw new Error('SADA_API_KEY_MISSING');
  return key;
}

async function sadaFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SADA_BASE}${path}`, {
      ...options,
      headers: {
        'X-API-Key': apiKey(),
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    let body = null;
    try { body = await res.json(); } catch { /* 바디 없음/파싱 불가 — body는 null 유지 */ }
    return { httpStatus: res.status, body };
  } catch (e) {
    return { httpStatus: 0, body: null, networkError: e.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 학생 → 동아리 결제 요청 생성. 즉시 이체되지 않고, 학생이 사다코인 로그인 화면에
 * 뜨는 승인 창에서 직접 승인해야 실제로 코인이 차감된다(120초 후 자동 만료).
 * @returns {Promise<{ok:true, requestId, status, expiresAt} | {ok:false, status, error}>}
 */
async function createPaymentRequest(studentId, amount, title) {
  let result;
  try {
    result = await sadaFetch('/payment-requests', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, amount, type: 'student_to_club', title }),
    });
  } catch (e) {
    if (e.message === 'SADA_API_KEY_MISSING') {
      return { ok: false, status: 500, error: '사다코인 API 키가 서버에 설정되지 않았습니다. 관리자에게 문의하세요.' };
    }
    return { ok: false, status: 500, error: '사다코인 연동 오류입니다. 관리자에게 문의하세요.' };
  }

  const { httpStatus, body, networkError } = result;
  if (networkError) {
    return { ok: false, status: 502, error: '사다코인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' };
  }
  if (httpStatus === 201 && body) {
    return { ok: true, requestId: body.request_id, status: body.status, expiresAt: body.expires_at };
  }
  if (httpStatus === 404) {
    return { ok: false, status: 404, error: '사다코인에 등록되지 않은 학번입니다.' };
  }
  if (httpStatus === 400) {
    return { ok: false, status: 400, error: (body && body.message) || '사다코인 결제 요청이 거부되었습니다.' };
  }
  if (httpStatus === 401) {
    return { ok: false, status: 500, error: '사다코인 API 키가 유효하지 않습니다(401). 관리자에게 문의하세요.' };
  }
  if (httpStatus === 429) {
    return { ok: false, status: 429, error: '결제 요청이 몰려 잠시 후 다시 시도해주세요.' };
  }
  return { ok: false, status: 502, error: (body && body.message) || `사다코인 결제 요청에 실패했습니다. (HTTP ${httpStatus})` };
}

/**
 * 결제 요청 상태 조회 — 클라이언트가 승인 대기 중 주기적으로 폴링.
 * @returns {Promise<{ok:true, status} | {ok:false, status, error}>}
 */
async function getPaymentRequest(requestId) {
  let result;
  try {
    result = await sadaFetch(`/payment-requests/${requestId}`, { method: 'GET' });
  } catch (e) {
    if (e.message === 'SADA_API_KEY_MISSING') {
      return { ok: false, status: 500, error: '사다코인 API 키가 서버에 설정되지 않았습니다. 관리자에게 문의하세요.' };
    }
    return { ok: false, status: 500, error: '사다코인 연동 오류입니다. 관리자에게 문의하세요.' };
  }

  const { httpStatus, body, networkError } = result;
  if (networkError) {
    return { ok: false, status: 502, error: '사다코인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' };
  }
  if (httpStatus === 200 && body) {
    return { ok: true, status: body.status };
  }
  if (httpStatus === 404) {
    return { ok: false, status: 404, error: '결제 요청을 찾을 수 없습니다.' };
  }
  if (httpStatus === 401) {
    return { ok: false, status: 500, error: '사다코인 API 키가 유효하지 않습니다(401). 관리자에게 문의하세요.' };
  }
  return { ok: false, status: 502, error: (body && body.message) || `결제 상태 조회에 실패했습니다. (HTTP ${httpStatus})` };
}

module.exports = { createPaymentRequest, getPaymentRequest };
