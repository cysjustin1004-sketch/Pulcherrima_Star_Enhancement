const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { SHOP_ITEMS, stageKey, TRACK_INFO } = require('../../lib/game-config');

const TRACK_KEYS = Object.keys(TRACK_INFO);

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
  // 이미 목표 단계 이상이면 성공해도 오히려 단계가 낮아지므로 구매 자체를 막는다
  // (클라이언트에도 동일 검증이 있지만, API 직접 호출을 막으려면 서버에도 필요).
  if (item.type === 'warp' && (user.currentStar || 0) >= item.targetLevel) {
    return res.status(400).json({ ok: false, error: '현재 단계보다 낮은 도약권은 사용할 수 없습니다.' });
  }

  const upd = {};
  upd[`users/${userKey}/hydrogen`] = (user.hydrogen || 0) - item.price;

  let warpSuccess = null;

  if (item.type === 'warp') {
    // 도약권은 아이템별 성공 확률제 — 가격은 시도한 것만으로 항상 소모되고, 실패하면
    // 수소만 잃고 현재 단계는 그대로 유지된다(강화 실패처럼 0강으로 떨어지지 않음).
    warpSuccess = Math.random() < item.successRate;
    if (warpSuccess) {
      // currentStar를 해당 레벨로 설정. 공통구간(0~13강)을 넘어서는 도약이면
      // 강화로 13→14강을 넘을 때와 동일하게 트랙을 무작위로 새로 배정해야 한다.
      let warpTrack = user.track || null;
      if (item.targetLevel > 13) {
        warpTrack = TRACK_KEYS[Math.floor(Math.random() * TRACK_KEYS.length)];
        upd[`users/${userKey}/track`] = warpTrack;
      }
      upd[`users/${userKey}/currentStar`] = item.targetLevel;
      const unlocked = user.unlockedCodex || [];
      for (let lv = 1; lv <= item.targetLevel; lv++) {
        const key = stageKey(lv, lv <= 13 ? null : warpTrack);
        if (!unlocked.includes(key)) unlocked.push(key);
      }
      upd[`users/${userKey}/unlockedCodex`] = unlocked;
      if (item.targetLevel > (user.bestStar || 0)) {
        upd[`users/${userKey}/bestStar`] = item.targetLevel;
      }
    }
  } else if (item.type === 'protection') {
    // 방지권: 보유 수량 추가
    upd[`users/${userKey}/protectionScrolls`] = (user.protectionScrolls || 0) + item.amount;
  }

  await db.ref().update(upd);
  res.json({ ok: true, itemId, price: item.price, warpSuccess });
};
