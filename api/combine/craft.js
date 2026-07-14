const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { RECIPES, ITEM_NAMES, stageKey, INVENTORY_CAP, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { recipeId } = req.body;
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return res.status(400).json({ ok: false, error: '존재하지 않는 레시피입니다.' });

  let errorResult = null;
  let resolvedLevel = null;
  let resolvedTrack = null;

  // users/{userKey} 트랜잭션 안에서 재료 확인+차감+결과물 지급을 한 번에 커밋해,
  // 같은 레시피를 동시에 여러 번 요청해도(다중 탭 등) 재료가 한 번만 소모된 채
  // 결과물이 여러 번 나가는 복제(dupe)를 막는다.
  const txResult = await db.ref(`users/${userKey}`).transaction(user => {
    if (!user) { errorResult = { status: 404, error: '유저 없음' }; return; }
    if (user.banned) { errorResult = { status: 403, error: '정지된 계정입니다.' }; return; }

    for (const input of recipe.inputs) {
      const held = (user.items && user.items[input.key]) || 0;
      if (held < input.amount) {
        errorResult = { status: 400, error: `${ITEM_NAMES[input.key]}이(가) ${input.amount}개 필요합니다. (보유: ${held}개)` };
        return;
      }
    }

    const next = { ...user, items: { ...(user.items || {}) } };
    for (const input of recipe.inputs) {
      next.items[input.key] = (next.items[input.key] || 0) - input.amount;
    }

    const out = recipe.output;
    if (out.type === 'protection') {
      next.protectionScrolls = (user.protectionScrolls || 0) + out.amount;
    } else if (out.type === 'star') {
      // trackRelative: 절대 레벨이 없으므로 14+N으로 계산(트랙은 14강부터 시작). 트랙은 제작자
      // 본인 것이 아니라 5개 트랙 중 무작위로 배정 — 어느 트랙 별이 나올지는 조합해봐야 안다.
      resolvedLevel = out.trackRelative != null ? 14 + out.trackRelative : out.level;
      resolvedTrack = out.trackRelative != null
        ? TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)]
        : null;

      const totalStored = Object.values(user.storedStars || {}).reduce((a, b) => a + b, 0);
      if (totalStored >= INVENTORY_CAP) {
        errorResult = { status: 400, error: `인벤토리가 가득 찼습니다 (${INVENTORY_CAP}/${INVENTORY_CAP}). 별을 정리한 뒤 다시 조합하세요.` };
        return;
      }

      const key = stageKey(resolvedLevel, resolvedTrack);
      next.storedStars = { ...(user.storedStars || {}) };
      next.storedStars[key] = (next.storedStars[key] || 0) + 1;

      const unlocked = user.unlockedCodex || [];
      if (!unlocked.includes(key)) next.unlockedCodex = [...unlocked, key];
    }

    return next;
  });

  if (!txResult.committed) {
    return res.status(errorResult ? errorResult.status : 400).json({ ok: false, error: errorResult ? errorResult.error : '처리할 수 없습니다.' });
  }
  res.json({ ok: true, recipeId, output: { ...recipe.output, level: resolvedLevel, track: resolvedTrack } });
};
