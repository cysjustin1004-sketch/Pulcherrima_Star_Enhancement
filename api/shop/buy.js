const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { SHOP_ITEMS } = require('../../lib/game-config');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { itemId } = req.body;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return res.status(400).json({ ok: false, error: '존재하지 않는 상품입니다.' });

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  if ((user.hydrogen || 0) < item.price) {
    return res.status(400).json({ ok: false, error: '수소가 부족합니다.' });
  }

  const upd = {};
  upd[`users/${userKey}/hydrogen`] = (user.hydrogen || 0) - item.price;

  if (item.type === 'warp') {
    // 도약권: currentStar를 해당 레벨로 설정
    upd[`users/${userKey}/currentStar`] = item.targetLevel;
    const unlocked = user.unlockedCodex || [];
    // 도약 경로의 모든 단계를 도감 해금
    for (let lv = 1; lv <= item.targetLevel; lv++) {
      if (!unlocked.includes(lv)) unlocked.push(lv);
    }
    upd[`users/${userKey}/unlockedCodex`] = unlocked;
    if (item.targetLevel > (user.bestStar || 0)) {
      upd[`users/${userKey}/bestStar`] = item.targetLevel;
    }
  } else if (item.type === 'protection') {
    // 방지권: 보유 수량 추가
    upd[`users/${userKey}/protectionScrolls`] = (user.protectionScrolls || 0) + item.amount;
  }

  await db.ref().update(upd);
  res.json({ ok: true, itemId, price: item.price });
};
