// 메모리 기반 레이트리밋 — 서버리스 인스턴스 하나가 살아있는 동안(warm)만 유효하다.
// 인스턴스가 여러 개로 늘어나면 카운터가 인스턴스마다 따로 놀아 완벽하지 않지만,
// Firebase에 카운트를 저장하면 막으려는 부하를 오히려 그 확인 자체가 늘리므로
// (요청마다 read+write 추가) 이 프로젝트 규모에서는 메모리 기반이 더 낫다.
const buckets = new Map(); // userKey -> 최근 1분 내 요청 타임스탬프 배열

/**
 * @param {string} userKey
 * @param {number} maxPerMinute
 * @returns {boolean} true면 한도 초과(거부해야 함)
 */
function isRateLimited(userKey, maxPerMinute) {
  const now = Date.now();
  const windowStart = now - 60 * 1000;

  let times = buckets.get(userKey);
  if (!times) {
    times = [];
    buckets.set(userKey, times);
  }

  // 윈도우 밖으로 나간 오래된 기록 제거
  while (times.length && times[0] < windowStart) times.shift();

  if (times.length >= maxPerMinute) return true;

  times.push(now);
  return false;
}

module.exports = { isRateLimited };
