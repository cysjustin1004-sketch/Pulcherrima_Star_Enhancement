// ============================================================
// game.js — 강화 핵심 로직
// ============================================================

// ─── 비용 사전 검증 (로컬) ──────────────────────────────────

function checkCost(user, cost) {
  if (!cost) return { ok: false, error: '강화할 수 없는 단계입니다.' };
  if (cost.type === 'hydrogen') {
    if ((user.hydrogen || 0) < cost.amount) return { ok: false, error: '수소가 부족합니다.' };
  } else if (cost.type === 'item') {
    const held = (user.items && user.items[cost.key]) || 0;
    if (held < cost.amount) return { ok: false, error: `${ITEM_NAMES[cost.key]}이(가) ${cost.amount}개 필요합니다.` };
  } else if (cost.type === 'star') {
    const stored = (user.storedStars && user.storedStars[cost.level]) || 0;
    if (stored < cost.amount) return { ok: false, error: `${STAGES[cost.level].name}(+${cost.level}강) 별이 ${cost.amount}개 필요합니다.` };
  }
  return { ok: true };
}

// ─── 강화 시도 ─────────────────────────────────────────────

/**
 * 강화를 시도합니다.
 * Firebase 쓰기를 1회로 합치고 await 하지 않아 즉각 반응합니다.
 * @returns {{success: boolean, drop?: {key, amount}, blocked?: boolean, error?: string}}
 */
function enhance(user) {
  const stage = STAGES[user.currentStar];
  if (!stage || stage.cost === null) {
    return { success: false, error: '강화할 수 없는 단계입니다.' };
  }

  // 비용 검증 (로컬, 0ms)
  const check = checkCost(user, stage.cost);
  if (!check.ok) return { success: false, error: check.error };

  // 성공/실패 판정 (로컬, 0ms)
  const success = Math.random() < stage.successRate;

  // 드랍 계산 (로컬, 0ms)
  let drop = null;
  if (!success && stage.drop) {
    const amount = stage.drop.min + Math.floor(Math.random() * (stage.drop.max - stage.drop.min + 1));
    drop = { key: stage.drop.key, amount };
  }

  // ── Firebase 쓰기: 모든 변경을 1번의 multi-path update로 ──
  const uid  = user.userKey;
  const cost = stage.cost;
  const upd  = {};

  // 비용 차감
  if (cost.type === 'hydrogen') {
    upd[`users/${uid}/hydrogen`] = (user.hydrogen || 0) - cost.amount;
  } else if (cost.type === 'item') {
    const held = (user.items && user.items[cost.key]) || 0;
    upd[`users/${uid}/items/${cost.key}`] = held - cost.amount;
  } else if (cost.type === 'star') {
    const stored = (user.storedStars && user.storedStars[cost.level]) || 0;
    upd[`users/${uid}/storedStars/${cost.level}`] = stored - cost.amount;
  }

  if (success) {
    const newLevel = user.currentStar + 1;
    upd[`users/${uid}/currentStar`] = newLevel;
    if (newLevel > (user.bestStar || 0)) upd[`users/${uid}/bestStar`] = newLevel;
    const unlocked = user.unlockedCodex || [];
    if (!unlocked.includes(newLevel)) upd[`users/${uid}/unlockedCodex`] = [...unlocked, newLevel];
  }

  // fire-and-forget (await 하지 않음 → UI 즉각 반응)
  firebase.database().ref().update(upd);

  // 로그도 fire-and-forget
  firebase.database().ref(`enhanceLogs/${uid}`).push({
    from: user.currentStar,
    to: success ? user.currentStar + 1 : user.currentStar,
    result: success ? 'success' : 'fail',
    usedProtection: false,
    timeMs: Date.now(),
  });

  return { success, drop };
}

// ─── 방지권 사용 (실패 후 선택) ─────────────────────────────

function useProtectionScroll(user) {
  const stage = STAGES[user.currentStar];
  if (!stage || stage.protectionCost <= 0) {
    return { ok: false, error: '이 단계는 방지권을 사용할 수 없습니다.' };
  }
  if ((user.protectionScrolls || 0) < stage.protectionCost) {
    return { ok: false, error: `붕괴 방지권이 ${stage.protectionCost}개 필요합니다.` };
  }
  firebase.database().ref(`users/${user.userKey}/protectionScrolls`)
    .set(user.protectionScrolls - stage.protectionCost);
  return { ok: true };
}

// 방지권 미사용 — +0 초기화
function applyFallback(user) {
  const stage = STAGES[user.currentStar];
  if (!stage || stage.protectionCost === 0) return;
  firebase.database().ref(`users/${user.userKey}/currentStar`).set(0);
}

// ─── 드랍 아이템 줍기 ────────────────────────────────────────

function pickupItem(user, itemKey, amount) {
  const current = (user.items && user.items[itemKey]) || 0;
  firebase.database().ref(`users/${user.userKey}/items/${itemKey}`).set(current + amount);
}

// ─── 별 판매 ─────────────────────────────────────────────────

async function sellStar(user) {
  const stage = STAGES[user.currentStar];
  if (!stage || !stage.sellPrice) return { ok: false, error: '이 별은 판매할 수 없습니다.' };

  await firebase.database().ref().update({
    [`users/${user.userKey}/hydrogen`]:    (user.hydrogen || 0) + stage.sellPrice,
    [`users/${user.userKey}/currentStar`]: 0,
  });
  return { ok: true, gained: stage.sellPrice };
}

// ─── 별 보관 ─────────────────────────────────────────────────

async function storeStar(user) {
  const level = user.currentStar;
  if (level < 19) return { ok: false, error: '19강 이상에서만 보관할 수 있습니다.' };

  const stored = (user.storedStars && user.storedStars[level]) || 0;
  await firebase.database().ref().update({
    [`users/${user.userKey}/storedStars/${level}`]: stored + 1,
    [`users/${user.userKey}/currentStar`]:          0,
  });
  return { ok: true };
}

// ─── 숫자 포맷 ───────────────────────────────────────────────

function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString();
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
