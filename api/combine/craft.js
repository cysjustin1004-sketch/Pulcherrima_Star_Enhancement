const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { RECIPES, ITEM_NAMES, stageKey } = require('../../lib/game-config');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { recipeId } = req.body;
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return res.status(400).json({ ok: false, error: '존재하지 않는 레시피입니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();

  // 재료 보유 확인
  for (const input of recipe.inputs) {
    const held = (user.items && user.items[input.key]) || 0;
    if (held < input.amount) {
      return res.status(400).json({
        ok: false,
        error: `${ITEM_NAMES[input.key]}이(가) ${input.amount}개 필요합니다. (보유: ${held}개)`,
      });
    }
  }

  const upd = {};

  // 재료 차감
  for (const input of recipe.inputs) {
    const held = (user.items && user.items[input.key]) || 0;
    upd[`users/${userKey}/items/${input.key}`] = held - input.amount;
  }

  // 결과물 지급
  const out = recipe.output;
  let resolvedLevel = null;
  if (out.type === 'protection') {
    upd[`users/${userKey}/protectionScrolls`] = (user.protectionScrolls || 0) + out.amount;
  } else if (out.type === 'star') {
    // trackRelative: 제작자 본인 트랙의 N번째 트랙 단계(level = 17+N) 별을 지급
    resolvedLevel = out.trackRelative != null ? 17 + out.trackRelative : out.level;
    if (out.trackRelative != null && !user.track) {
      return res.status(400).json({ ok: false, error: '아직 트랙에 진입하지 않아 조합할 수 없습니다.' });
    }
    // 별 보관함에 추가
    const key = stageKey(resolvedLevel, user.track);
    const stored = (user.storedStars && user.storedStars[key]) || 0;
    upd[`users/${userKey}/storedStars/${key}`] = stored + 1;
    // 도감 해금
    const unlocked = user.unlockedCodex || [];
    if (!unlocked.includes(key)) {
      upd[`users/${userKey}/unlockedCodex`] = [...unlocked, key];
    }
  }

  await db.ref().update(upd);
  res.json({ ok: true, recipeId, output: { ...out, level: resolvedLevel } });
};
