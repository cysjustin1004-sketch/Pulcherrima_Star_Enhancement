const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { resolveStage, battleWinProb, BATTLE_DAILY_CAP } = require('../../lib/game-config');

function todayUTCBucket() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { opponentKey } = req.body;
  if (!opponentKey) return res.status(400).json({ ok: false, error: '상대를 지정하세요.' });
  if (opponentKey === userKey) return res.status(400).json({ ok: false, error: '자기 자신과는 배틀할 수 없습니다.' });

  const meSnap = await db.ref(`users/${userKey}`).get();
  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const me = meSnap.val();
  if (me.banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  const friendSnap = await db.ref(`friends/${userKey}/${opponentKey}`).get();
  if (!friendSnap.exists()) {
    return res.status(403).json({ ok: false, error: '친구만 배틀할 수 있습니다.' });
  }

  const oppSnap = await db.ref(`users/${opponentKey}`).get();
  if (!oppSnap.exists()) return res.status(404).json({ ok: false, error: '상대를 찾을 수 없습니다.' });
  const opp = oppSnap.val();
  if (opp.banned) return res.status(403).json({ ok: false, error: '정지된 사용자입니다.' });

  const winProb = battleWinProb(me.currentStar || 0, opp.currentStar || 0);

  const counterSnap = await db.ref(`battleCounters/${userKey}/${opponentKey}/${todayUTCBucket()}`).get();
  const usedToday = counterSnap.exists() ? counterSnap.val() : 0;
  const remainingToday = Math.max(0, BATTLE_DAILY_CAP - usedToday);

  const myStage  = resolveStage(me.currentStar || 0, me.track);
  const oppStage = resolveStage(opp.currentStar || 0, opp.track);

  res.json({
    ok: true,
    me: {
      currentStar: me.currentStar || 0,
      track: me.track || null,
      stageName: myStage ? myStage.name : '-',
    },
    opponent: {
      nickname: opp.nickname,
      currentStar: opp.currentStar || 0,
      track: opp.track || null,
      stageName: oppStage ? oppStage.name : '-',
      battleWins: opp.battleWins || 0,
      battleLosses: opp.battleLosses || 0,
    },
    winProb,
    remainingToday,
  });
};
