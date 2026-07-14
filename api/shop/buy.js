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

  let errorResult = null;
  let warpSuccess = null;

  // users/{userKey} 트랜잭션 안에서 잔액 확인+차감+효과 적용을 한 번에 커밋해,
  // 같은 계정으로 여러 창을 띄워 동시에 구매해도(다중 탭 등) 수소가 한 번만 깎인 채
  // 효과가 여러 번 발동하는 복제(dupe)를 막는다.
  const txResult = await db.ref(`users/${userKey}`).transaction(user => {
    if (!user) { errorResult = { status: 404, error: '유저 없음' }; return; }
    if (user.banned) { errorResult = { status: 403, error: '정지된 계정입니다.' }; return; }
    if ((user.hydrogen || 0) < item.price) {
      errorResult = { status: 400, error: '수소가 부족합니다.' };
      return;
    }
    // 이미 목표 단계 이상이면 성공해도 오히려 단계가 낮아지므로 구매 자체를 막는다
    // (클라이언트에도 동일 검증이 있지만, API 직접 호출을 막으려면 서버에도 필요).
    if (item.type === 'warp' && (user.currentStar || 0) >= item.targetLevel) {
      errorResult = { status: 400, error: '현재 단계보다 낮은 도약권은 사용할 수 없습니다.' };
      return;
    }

    const next = { ...user, hydrogen: (user.hydrogen || 0) - item.price };
    warpSuccess = null;

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
          next.track = warpTrack;
        }
        next.currentStar = item.targetLevel;
        const unlocked = [...(user.unlockedCodex || [])];
        for (let lv = 1; lv <= item.targetLevel; lv++) {
          const key = stageKey(lv, lv <= 13 ? null : warpTrack);
          if (!unlocked.includes(key)) unlocked.push(key);
        }
        next.unlockedCodex = unlocked;
        if (item.targetLevel > (user.bestStar || 0)) {
          next.bestStar = item.targetLevel;
        }
      }
    } else if (item.type === 'protection') {
      // 방지권: 보유 수량 추가
      next.protectionScrolls = (user.protectionScrolls || 0) + item.amount;
    }

    return next;
  });

  if (!txResult.committed) {
    return res.status(errorResult ? errorResult.status : 400).json({ ok: false, error: errorResult ? errorResult.error : '처리할 수 없습니다.' });
  }
  res.json({ ok: true, itemId, price: item.price, warpSuccess });
};
