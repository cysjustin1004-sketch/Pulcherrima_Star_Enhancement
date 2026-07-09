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

/** 트랙이 매번 랜덤 배정되므로, 별 재료는 트랙 무관하게 레벨만 맞으면 인정 */
function sumStoredStarAcrossTracks(storedStars, level) {
  if (!storedStars) return 0;
  return Object.keys(TRACK_INFO).reduce((sum, t) => sum + (storedStars[`${t}_${level}`] || 0), 0);
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

// ─── 숫자 포맷 ───────────────────────────────────────────────

function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString();
}

// ─── 별 이미지 경로 (공통은 star_N.png, 트랙 구간은 star_trackX_N.png) ──

function starImagePath(level, track) {
  return (level <= 16 || level >= 25) ? `images/star_${level}.png` : `images/star_${track}_${level}.png`;
}

// ─── 강화 재료 사용처 안내 ────────────────────────────────────

/**
 * 이 레벨(+트랙)의 별이 상위 강화의 "별" 재료로 쓰이는 단계 이름 목록.
 * 트랙 구간(17~24) 전체를 훑어 star-cost가 이 레벨을 가리키는 단계를 찾는다
 * (하드코딩하면 트랙 수치 조정 시 어긋나기 쉬워 동적으로 스캔).
 */
function starMaterialUsage(level, track) {
  const out = [];
  if (!track) return out; // 공통 구간(0~16)은 별 재료로 쓰이지 않음
  for (let l = 17; l <= 24; l++) {
    const st = resolveStage(l, track);
    if (st && st.cost && st.cost.type === 'star' && st.cost.level === level) {
      out.push(`+${l}강 ${st.name}`);
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
