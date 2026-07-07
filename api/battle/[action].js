const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { resolveStage, battleWinProb, BATTLE_STAKE_RATE, BATTLE_DAILY_CAP } = require('../../lib/game-config');

function todayUTCBucket() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function preview(req, res) {
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
}

async function execute(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { opponentKey } = req.body;
  if (!opponentKey) return res.status(400).json({ ok: false, error: '상대를 지정하세요.' });
  if (opponentKey === userKey) return res.status(400).json({ ok: false, error: '자기 자신과는 배틀할 수 없습니다.' });

  const meSnap = await db.ref(`users/${userKey}`).get();
  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  if (meSnap.val().banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  const friendSnap = await db.ref(`friends/${userKey}/${opponentKey}`).get();
  if (!friendSnap.exists()) {
    return res.status(403).json({ ok: false, error: '친구만 배틀할 수 있습니다.' });
  }

  const oppSnap = await db.ref(`users/${opponentKey}`).get();
  if (!oppSnap.exists()) return res.status(404).json({ ok: false, error: '상대를 찾을 수 없습니다.' });
  if (oppSnap.val().banned) return res.status(403).json({ ok: false, error: '정지된 사용자입니다.' });

  // ── 하루 캡: transaction으로 원자적 증가 (레이스 방지) ──
  const counterRef = db.ref(`battleCounters/${userKey}/${opponentKey}/${todayUTCBucket()}`);
  const txResult = await counterRef.transaction(current => {
    const c = current || 0;
    if (c >= BATTLE_DAILY_CAP) return; // undefined 반환 → 트랜잭션 중단
    return c + 1;
  });
  if (!txResult.committed) {
    return res.status(429).json({ ok: false, error: '오늘 이 상대와의 배틀 횟수를 모두 사용했습니다.' });
  }

  // ── 최신 상태 재조회 ──
  const [meSnap2, oppSnap2] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`users/${opponentKey}`).get(),
  ]);
  const me  = meSnap2.val();
  const opp = oppSnap2.val();

  const winProb = battleWinProb(me.currentStar || 0, opp.currentStar || 0);
  const roll = Math.random();
  const win = roll < winProb;

  const meHydrogen  = me.hydrogen  || 0;
  const oppHydrogen = opp.hydrogen || 0;
  const loserHydrogen = win ? oppHydrogen : meHydrogen;
  const transfer = Math.max(0, Math.min(Math.floor(loserHydrogen * BATTLE_STAKE_RATE), loserHydrogen));

  let myNewHydrogen, oppNewHydrogen, hydrogenDelta;
  if (win) {
    myNewHydrogen  = meHydrogen  + transfer;
    oppNewHydrogen = Math.max(0, oppHydrogen - transfer);
    hydrogenDelta  = transfer;
  } else {
    myNewHydrogen  = Math.max(0, meHydrogen - transfer);
    oppNewHydrogen = oppHydrogen + transfer;
    hydrogenDelta  = -transfer;
  }

  const myWins    = (me.battleWins    || 0) + (win ? 1 : 0);
  const myLosses  = (me.battleLosses  || 0) + (win ? 0 : 1);
  const oppWins   = (opp.battleWins   || 0) + (win ? 0 : 1);
  const oppLosses = (opp.battleLosses || 0) + (win ? 1 : 0);

  await db.ref().update({
    [`users/${userKey}/hydrogen`]:        myNewHydrogen,
    [`users/${userKey}/battleWins`]:      myWins,
    [`users/${userKey}/battleLosses`]:    myLosses,
    [`users/${opponentKey}/hydrogen`]:     oppNewHydrogen,
    [`users/${opponentKey}/battleWins`]:   oppWins,
    [`users/${opponentKey}/battleLosses`]: oppLosses,
  });

  const at = Date.now();
  await Promise.all([
    db.ref(`battleLogs/${userKey}`).push({
      opponent: opponentKey, opponentNick: opp.nickname, role: 'attacker',
      myLevel: me.currentStar || 0, oppLevel: opp.currentStar || 0,
      winProb, result: win ? 'win' : 'loss', hydrogenDelta, at,
    }),
    db.ref(`battleLogs/${opponentKey}`).push({
      opponent: userKey, opponentNick: me.nickname, role: 'defender',
      myLevel: opp.currentStar || 0, oppLevel: me.currentStar || 0,
      winProb: 1 - winProb, result: win ? 'loss' : 'win', hydrogenDelta: -hydrogenDelta, at,
    }),
  ]);

  res.json({
    ok: true,
    result: win ? 'win' : 'loss',
    winProb,
    roll,
    hydrogenDelta,
    myHydrogen: myNewHydrogen,
    opponentNick: opp.nickname,
  });
}

async function history(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { limit } = req.body;
  const n = Math.max(1, Math.min(200, limit || 50));

  const snap = await db.ref(`battleLogs/${userKey}`).limitToLast(n).get();
  const logs = [];
  if (snap.exists()) {
    snap.forEach(child => logs.push(child.val()));
  }
  logs.reverse(); // 최신순

  res.json({ ok: true, logs });
}

async function profile(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { opponentKey } = req.body;
  if (!opponentKey) return res.status(400).json({ ok: false, error: '상대를 지정하세요.' });

  const oppSnap = await db.ref(`users/${opponentKey}`).get();
  if (!oppSnap.exists()) return res.status(404).json({ ok: false, error: '존재하지 않는 사용자입니다.' });
  const opp = oppSnap.val();

  const [friendSnap, pendingOutSnap, pendingInSnap] = await Promise.all([
    db.ref(`friends/${userKey}/${opponentKey}`).get(),
    db.ref(`friendRequests/${opponentKey}/${userKey}`).get(), // 내가 상대에게 보낸 요청
    db.ref(`friendRequests/${userKey}/${opponentKey}`).get(), // 상대가 나에게 보낸 요청
  ]);

  res.json({
    ok: true,
    nickname: opp.nickname,
    currentStar: opp.currentStar || 0,
    track: opp.track || null,
    bestStar: opp.bestStar || 0,
    battleWins: opp.battleWins || 0,
    battleLosses: opp.battleLosses || 0,
    isFriend: friendSnap.exists(),
    hasPendingRequest: pendingOutSnap.exists() || pendingInSnap.exists(),
  });
}

const ROUTES = { preview, execute, history, profile };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
