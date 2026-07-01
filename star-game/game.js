// ============================================================
// game.js — 강화 핵심 로직
// ============================================================

// ─── 레이트리밋 ─────────────────────────────────────────────

async function checkRateLimit(userKey) {
  const now = Date.now();
  const windowData = await dbGet(`users/${userKey}/rateWindow`);
  const w = windowData || { startMs: now, count: 0 };

  // 1분 경과 시 창 초기화
  if (now - w.startMs > 60000) {
    await dbSet(`users/${userKey}/rateWindow`, { startMs: now, count: 1 });
    return true;
  }

  if (w.count >= RATE_LIMIT.maxPerMinute) return false;

  await dbSet(`users/${userKey}/rateWindow`, { startMs: w.startMs, count: w.count + 1 });
  return true;
}

// ─── 강화 비용 차감 ─────────────────────────────────────────

/**
 * 강화 비용을 확인하고 차감합니다.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function deductCost(user, stage) {
  const cost = stage.cost;
  if (!cost) return { ok: false, error: '강화할 수 없는 단계입니다.' };

  if (cost.type === 'hydrogen') {
    if (user.hydrogen < cost.amount) return { ok: false, error: '수소가 부족합니다.' };
    await dbUpdate(`users/${user.userKey}`, { hydrogen: user.hydrogen - cost.amount });
    return { ok: true };
  }

  if (cost.type === 'item') {
    const held = (user.items && user.items[cost.key]) || 0;
    if (held < cost.amount) {
      return { ok: false, error: `${ITEM_NAMES[cost.key]}이(가) ${cost.amount}개 필요합니다.` };
    }
    await dbUpdate(`users/${user.userKey}/items`, { [cost.key]: held - cost.amount });
    return { ok: true };
  }

  if (cost.type === 'star') {
    const stored = (user.storedStars && user.storedStars[cost.level]) || 0;
    if (stored < cost.amount) {
      return { ok: false, error: `${STAGES[cost.level].name}(+${cost.level}강) 별이 ${cost.amount}개 필요합니다.` };
    }
    await dbUpdate(`users/${user.userKey}/storedStars`, {
      [cost.level]: stored - cost.amount,
    });
    return { ok: true };
  }

  return { ok: false, error: '알 수 없는 비용 형식입니다.' };
}

// ─── 강화 시도 ─────────────────────────────────────────────

/**
 * 강화를 시도합니다.
 * @returns {Promise<{success: boolean, drop?: {key, amount}, blocked?: boolean, error?: string}>}
 */
async function enhance(user) {
  // 레이트리밋 확인
  const allowed = await checkRateLimit(user.userKey);
  if (!allowed) {
    return { success: false, blocked: true, error: '잠깐! 너무 빠릅니다. 잠시 후 다시 시도하세요.' };
  }

  const stage = STAGES[user.currentStar];
  if (!stage || stage.cost === null) {
    return { success: false, error: '강화할 수 없는 단계입니다.' };
  }

  // 비용 차감
  const deductResult = await deductCost(user, stage);
  if (!deductResult.ok) return { success: false, error: deductResult.error };

  // 성공/실패 판정
  const roll = Math.random();
  const success = roll < stage.successRate;

  // 드랍 계산 (실패 시 + 드랍 정의 있을 때)
  let drop = null;
  if (!success && stage.drop) {
    const amount = stage.drop.min + Math.floor(Math.random() * (stage.drop.max - stage.drop.min + 1));
    drop = { key: stage.drop.key, amount };
  }

  // 로그 기록
  const nextLevel = success ? user.currentStar + 1 : Math.max(0, user.currentStar - (stage.protectionCost > 0 ? 1 : 0));
  await dbPush(`enhanceLogs/${user.userKey}`, {
    from: user.currentStar,
    to: success ? user.currentStar + 1 : user.currentStar,
    result: success ? 'success' : 'fail',
    usedProtection: false,
    timeMs: Date.now(),
  });

  if (success) {
    const newLevel = user.currentStar + 1;
    const updates = { currentStar: newLevel };

    // 최고 기록 갱신
    if (newLevel > (user.bestStar || 0)) updates.bestStar = newLevel;

    // 도감 해금 (처음 도달 시만)
    const unlocked = user.unlockedCodex || [];
    if (!unlocked.includes(newLevel)) {
      updates.unlockedCodex = [...unlocked, newLevel];
    }

    await dbUpdate(`users/${user.userKey}`, updates);
  }

  return { success, drop };
}

// ─── 방지권 사용 (실패 후 선택) ─────────────────────────────

/**
 * 강화 실패 후 방지권을 소모하여 단계를 유지합니다.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function useProtectionScroll(user) {
  const stage = STAGES[user.currentStar];
  if (!stage || stage.protectionCost <= 0) {
    return { ok: false, error: '이 단계는 방지권을 사용할 수 없습니다.' };
  }
  if ((user.protectionScrolls || 0) < stage.protectionCost) {
    return { ok: false, error: `붕괴 방지권이 ${stage.protectionCost}개 필요합니다.` };
  }

  await dbUpdate(`users/${user.userKey}`, {
    protectionScrolls: user.protectionScrolls - stage.protectionCost,
  });

  // 방지권 사용 로그 덮어쓰기 (마지막 로그)
  return { ok: true };
}

/**
 * 방지권 미사용 — 단계 하락 처리
 */
async function applyFallback(user) {
  const stage = STAGES[user.currentStar];
  if (!stage || stage.protectionCost === 0) return; // 하락 없는 구간

  // 실패 시 +0으로 초기화 (방지권 미사용)
  await dbUpdate(`users/${user.userKey}`, { currentStar: 0 });
}

// ─── 드랍 아이템 줍기 ────────────────────────────────────────

/**
 * 드랍된 아이템을 인벤토리에 추가합니다.
 */
async function pickupItem(user, itemKey, amount) {
  const current = (user.items && user.items[itemKey]) || 0;
  await dbUpdate(`users/${user.userKey}/items`, { [itemKey]: current + amount });
}

// ─── 별 판매 ─────────────────────────────────────────────────

/**
 * 현재 별을 수소로 판매하고 +0으로 초기화합니다.
 * @returns {Promise<{ok: boolean, gained?: number, error?: string}>}
 */
async function sellStar(user) {
  const stage = STAGES[user.currentStar];
  if (!stage || !stage.sellPrice) {
    return { ok: false, error: '이 별은 판매할 수 없습니다.' };
  }

  await dbUpdate(`users/${user.userKey}`, {
    hydrogen: (user.hydrogen || 0) + stage.sellPrice,
    currentStar: 0,
  });

  return { ok: true, gained: stage.sellPrice };
}

// ─── 별 보관 ─────────────────────────────────────────────────

/**
 * 현재 별을 보관하고 +0으로 초기화합니다.
 * 보관된 별은 +21~+24 등 특수 강화 비용으로 사용됩니다.
 */
async function storeStar(user) {
  const level = user.currentStar;
  if (level < 1) return { ok: false, error: '보관할 수 있는 별이 없습니다.' };

  const stored = (user.storedStars && user.storedStars[level]) || 0;
  await dbUpdate(`users/${user.userKey}`, {
    [`storedStars/${level}`]: stored + 1,
    currentStar: 0,
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
