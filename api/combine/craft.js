const { validateSession } = require('../../lib/session');
const { atomicUpdate } = require('../../lib/atomic-update');
const { RECIPES, ITEM_NAMES, stageKey, INVENTORY_CAP, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { recipeId } = req.body;
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return res.status(400).json({ ok: false, error: '존재하지 않는 레시피입니다.' });

  // 읽기(get)와 쓰기(update)를 분리하면, 동시에 여러 조합 요청을 보낼 때 전부
  // "차감 전" 스냅샷으로 재료·인벤토리 상한 검증을 통과해버릴 수 있다(예: 재료가
  // 4개뿐인데 동시 요청 여러 개가 모두 "4개 있음"을 통과, 인벤토리 캡도 동시에
  // 우회). atomicUpdate()(ETag 조건부 쓰기)로 읽기·검증·쓰기를 원자적으로 묶어
  // 이 레이스를 차단한다.
  let outcome = null;

  const txResult = await atomicUpdate(`users/${userKey}`, (user) => {
    if (user === null) return undefined; // 유저 없음 — abort, 바깥에서 404 처리
    if (user.banned) {
      outcome = { error: '정지된 계정입니다.', status: 403 };
      return undefined;
    }

    // 재료 보유 확인
    for (const input of recipe.inputs) {
      const held = (user.items && user.items[input.key]) || 0;
      if (held < input.amount) {
        outcome = { error: `${ITEM_NAMES[input.key]}이(가) ${input.amount}개 필요합니다. (보유: ${held}개)`, status: 400 };
        return undefined;
      }
    }

    const out = recipe.output;
    let resolvedLevel = null;
    let resolvedTrack = null;

    if (out.type === 'star') {
      // 보관함이 가득 차 있으면 재료 소모 전에 막는다
      const totalStored = Object.values(user.storedStars || {}).reduce((a, b) => a + b, 0);
      if (totalStored >= INVENTORY_CAP) {
        outcome = { error: `인벤토리가 가득 찼습니다 (${INVENTORY_CAP}/${INVENTORY_CAP}). 별을 정리한 뒤 다시 조합하세요.`, status: 400 };
        return undefined;
      }
    }

    // 충돌 시 최신 데이터로 재호출될 수 있으므로, 매번 user를 얕은 복제해
    // 다음 상태(next)를 구성한다.
    const next = { ...user, items: { ...(user.items || {}) }, storedStars: { ...(user.storedStars || {}) } };

    // 재료 차감
    for (const input of recipe.inputs) {
      const held = (user.items && user.items[input.key]) || 0;
      next.items[input.key] = held - input.amount;
    }

    // 결과물 지급
    if (out.type === 'protection') {
      next.protectionScrolls = (user.protectionScrolls || 0) + out.amount;
    } else if (out.type === 'star') {
      // trackRelative: 절대 레벨이 없으므로 14+N으로 계산(트랙은 14강부터 시작). 트랙은 제작자
      // 본인 것이 아니라 5개 트랙 중 무작위로 배정 — 어느 트랙 별이 나올지는 조합해봐야 안다.
      resolvedLevel = out.trackRelative != null ? 14 + out.trackRelative : out.level;
      resolvedTrack = out.trackRelative != null
        ? TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)]
        : null;
      // 별 보관함에 추가
      const key = stageKey(resolvedLevel, resolvedTrack);
      const stored = (user.storedStars && user.storedStars[key]) || 0;
      next.storedStars[key] = stored + 1;
      // 도감 해금
      const unlocked = user.unlockedCodex || [];
      if (!unlocked.includes(key)) {
        next.unlockedCodex = [...unlocked, key];
      }
    }

    outcome = { ok: true, recipeId, output: { ...out, level: resolvedLevel, track: resolvedTrack } };
    return next;
  });

  if (!txResult.committed) {
    if (outcome && outcome.error) {
      return res.status(outcome.status).json({ ok: false, error: outcome.error });
    }
    return res.status(404).json({ ok: false, error: '유저 없음' });
  }

  res.json(outcome);
};
