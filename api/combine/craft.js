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
  let resolvedTrack = null;
  if (out.type === 'protection') {
    upd[`users/${userKey}/protectionScrolls`] = (user.protectionScrolls || 0) + out.amount;
  } else if (out.type === 'star') {
    // trackRelative: 절대 레벨이 없으므로 14+N으로 계산(트랙은 14강부터 시작). 트랙은 제작자
    // 본인 것이 아니라 5개 트랙 중 무작위로 배정 — 어느 트랙 별이 나올지는 조합해봐야 안다.
    resolvedLevel = out.trackRelative != null ? 14 + out.trackRelative : out.level;
    resolvedTrack = out.trackRelative != null
      ? TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)]
      : null;
    // 보관함이 가득 차 있으면 재료 소모 전에 막는다 (아직 upd는 DB에 쓰이지 않은 상태라 재료 낭비 없음)
    const totalStored = Object.values(user.storedStars || {}).reduce((a, b) => a + b, 0);
    if (totalStored >= INVENTORY_CAP) {
      return res.status(400).json({ ok: false, error: `인벤토리가 가득 찼습니다 (${INVENTORY_CAP}/${INVENTORY_CAP}). 별을 정리한 뒤 다시 조합하세요.` });
    }
    // 별 보관함에 추가
    const key = stageKey(resolvedLevel, resolvedTrack);
    const stored = (user.storedStars && user.storedStars[key]) || 0;
    upd[`users/${userKey}/storedStars/${key}`] = stored + 1;
    // 도감 해금
    const unlocked = user.unlockedCodex || [];
    if (!unlocked.includes(key)) {
      upd[`users/${userKey}/unlockedCodex`] = [...unlocked, key];
    }
  }

  await db.ref().update(upd);
  res.json({ ok: true, recipeId, output: { ...out, level: resolvedLevel, track: resolvedTrack } });
};
