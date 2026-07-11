// ============================================================
// game.js — 강화 핵심 로직 (서버 API 기반)
// 모든 상태 변경은 /api/* 를 통해 서버에서 처리됨
// ============================================================

// ─── API 헬퍼 ──────────────────────────────────────────────

/** 서버 API 호출 — X-Session-Token 헤더 자동 첨부 */
async function apiCall(path, body) {
  const token = getToken();
  const res = await fetch(path, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/json',
      'X-Session-Token': token || '',
    },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

// ─── 비용 사전 검증 (로컬, UI용) ────────────────────────────

/**
 * 트랙이 매번 랜덤 배정되므로, 별 재료는 트랙 무관하게 레벨만 맞으면 인정.
 * stageKey는 공통(0~13)·우주루트(22강 이상) 별은 트랙 접두어 없이 "22" 같은 순수 레벨
 * 문자열 키로 저장하므로(lib/game-config.js의 stageKey 참고), track1_22 등만 훑으면
 * 그 구간 별의 보유량이 항상 0으로 잡힌다 — 접두어 없는 키도 함께 더해야 한다.
 */
function sumStoredStarAcrossTracks(storedStars, level) {
  if (!storedStars) return 0;
  const trackSum = Object.keys(TRACK_INFO).reduce((sum, t) => sum + (storedStars[`${t}_${level}`] || 0), 0);
  return trackSum + (storedStars[String(level)] || 0);
}

function checkCost(user, cost) {
  if (!cost) return { ok: false, error: '강화할 수 없는 단계입니다.' };
  if (cost.type === 'hydrogen') {
    if ((user.hydrogen || 0) < cost.amount) return { ok: false, error: '수소가 부족합니다.' };
  } else if (cost.type === 'item') {
    const held = (user.items && user.items[cost.key]) || 0;
    if (held < cost.amount) return { ok: false, error: `${ITEM_NAMES[cost.key]}이(가) ${cost.amount}개 필요합니다.` };
  } else if (cost.type === 'star') {
    const stored = sumStoredStarAcrossTracks(user.storedStars, cost.level);
    if (stored < cost.amount) {
      return { ok: false, error: `+${cost.level}강 별이 ${cost.amount}개 필요합니다.` };
    }
  }
  return { ok: true };
}

// ─── 강화 시도 ─────────────────────────────────────────────

/**
 * 서버에 강화 요청.
 * @returns {Promise<{ok, success, drop, level, error?}>}
 */
async function enhance() {
  return apiCall('/api/game/enhance', {});
}

// ─── 드랍 아이템 줍기 ────────────────────────────────────────

async function pickupItem() {
  return apiCall('/api/game/pickup', {});
}

// ─── 방지권 사용 / 미사용 ────────────────────────────────────

async function useProtectionScroll() {
  return apiCall('/api/game/protection', { useProtection: true });
}

async function applyFallback() {
  return apiCall('/api/game/protection', { useProtection: false });
}

// ─── 별 판매 ─────────────────────────────────────────────────

async function sellStar() {
  return apiCall('/api/game/sell', {});
}

// ─── 별 보관 ─────────────────────────────────────────────────

async function storeStar() {
  return apiCall('/api/game/store', {});
}

// ─── 보관된 별 판매 / 강화 화면으로 불러오기 ────────────────────

async function sellStoredStar(key) {
  return apiCall('/api/game/sellStored', { key });
}

async function loadStoredStar(key) {
  return apiCall('/api/game/load', { key });
}

// ─── 프로필 사진 (도감에서 해금한 별 중 직접 선택) ────────────────

async function setProfilePic(key) {
  return apiCall('/api/game/setProfilePic', { key });
}

/** 프로필에 표시할 실제 학번/이름 문구 — 0000(선생님/외부인)은 이름만, 나머지는 학번+이름 */
function formatIdentity(studentId, realName) {
  if (!realName) return '';
  if (studentId === '0000') return `${realName}님`;
  if (studentId) return `${studentId} ${realName}`;
  return '';
}

// ─── 숫자 포맷 ───────────────────────────────────────────────

function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString();
}

/** 좁은 버튼 등에 쓰는 축약 표기 — 억/만 단위로 줄여서 자릿수 폭주를 막는다 */
function formatKoreanNumber(n) {
  if (n === null || n === undefined) return '-';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 100000000) {
    const v = abs / 100000000;
    return sign + (Number.isInteger(v) ? v : v.toFixed(1)) + '억';
  }
  if (abs >= 10000) {
    const v = abs / 10000;
    return sign + (Number.isInteger(v) ? v : v.toFixed(1)) + '만';
  }
  return sign + abs.toLocaleString();
}

// ─── 별 이미지 경로 (공통은 star_N.png, 트랙 구간은 star_trackX_N.png) ──

function starImagePath(level, track) {
  return (level <= 13 || level >= 22) ? `images/star_${level}.png` : `images/star_${track}_${level}.png`;
}

// ─── 강화 재료 사용처 안내 ────────────────────────────────────

/**
 * 이 레벨의 별이 상위 강화의 "별" 재료로 쓰이는 단계(+N강) 목록.
 * 트랙 구간(14~21, 자기 트랙)과 우주루트(22~29, 트랙 무관 공통)를 모두 훑어
 * star-cost가 이 레벨을 가리키는 단계를 찾는다(하드코딩하면 수치 조정 시 어긋나기 쉬워 동적으로 스캔).
 * 5개 트랙 모두 같은 레벨엔 같은 star-cost 커브를 쓰므로, 어느 트랙이든 "+N강 재료"라는
 * 사실은 동일하다 — 그래서 트랙별로 다른 단계 이름(예: 흑색왜성/백색왜성) 대신 레벨만 표시해
 * "이 트랙에서만 쓰인다"는 오해를 막는다.
 */
function starMaterialUsage(level, track) {
  const out = [];
  if (!track) return out; // 공통 구간(0~13)은 별 재료로 쓰이지 않음
  for (let l = 14; l <= 21; l++) {
    const st = resolveStage(l, track);
    if (st && st.cost && st.cost.type === 'star' && st.cost.level === level) {
      out.push(`+${l}강`);
    }
  }
  for (let l = 22; l <= 29; l++) {
    const st = resolveStage(l, null);
    if (st && st.cost && st.cost.type === 'star' && st.cost.level === level) {
      out.push(`+${l}강`);
    }
  }
  return out;
}

// ─── 별 타입 → CSS 클래스 ────────────────────────────────────

function getStarCssClass(level) {
  if (level <= 3)  return 'type-nebula';
  if (level <= 5)  return 'type-mainseq';
  if (level <= 9)  return 'type-supergiant';
  if (level <= 11) return 'type-supernova';
  if (level <= 16) return 'type-neutron';
  if (level <= 20) return 'type-blackhole';
  if (level <= 28) return 'type-cosmic';
  return 'type-bigbang';
}
