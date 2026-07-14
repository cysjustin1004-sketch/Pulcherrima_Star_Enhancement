const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DATABASE_URL;

async function getAccessToken() {
  const credential = admin.app().options.credential;
  const { access_token } = await credential.getAccessToken();
  return access_token;
}

/**
 * Firebase RTDB REST API의 ETag 조건부 쓰기(If-Match)로 원자적 read-modify-write를
 * 구현한다.
 *
 * 왜 admin SDK의 ref.transaction()을 안 쓰는가: 서버리스 환경(요청마다 커넥션이
 * 새로 만들어짐)에서는 transaction()이 그 경로의 로컬 동기화 캐시가 채워지기 전에
 * 즉시(수 ms 내) "데이터 없음(null)"으로 콜백을 호출하고 끝나버려서 실제로는
 * 아무 원자성도 보장하지 못한다(실측 확인됨 — get()으로는 정상 조회되는 데이터가
 * transaction()에는 항상 null로 보임). REST API의 ETag/If-Match는 매 요청이
 * 완결된 HTTP 왕복이라 이 문제가 없고, 동시 쓰기 충돌 시 412로 감지해 재시도한다.
 *
 * @param {string} path - 예: `users/asdf` (앞뒤 슬래시 없이)
 * @param {(current: object|null) => (object|undefined)} updateFn -
 *   현재 값을 받아 새 값을 반환하면 커밋, undefined를 반환하면 중단(쓰기 없음)
 * @param {number} maxRetries
 * @returns {Promise<{committed: boolean, value: object|null}>}
 */
async function atomicUpdate(path, updateFn, maxRetries = 20) {
  const token = await getAccessToken();
  const url = `${DB_URL}/${path}.json`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const getRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' },
    });
    if (!getRes.ok) {
      throw new Error(`atomicUpdate GET 실패: ${getRes.status} ${await getRes.text()}`);
    }
    const etag = getRes.headers.get('ETag');
    const current = await getRes.json();

    const next = updateFn(current);
    if (next === undefined) {
      return { committed: false, value: current };
    }

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'if-match': etag,
      },
      body: JSON.stringify(next),
    });

    if (putRes.ok) {
      return { committed: true, value: next };
    }
    if (putRes.status === 412) {
      continue; // 다른 요청이 먼저 커밋함 — 최신 값으로 처음부터 다시 시도
    }
    throw new Error(`atomicUpdate PUT 실패: ${putRes.status} ${await putRes.text()}`);
  }
  throw new Error('atomicUpdate: 재시도 한도 초과(동시 요청이 지나치게 많음)');
}

module.exports = { atomicUpdate };
