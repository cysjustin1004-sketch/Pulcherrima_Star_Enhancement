const db = require('../../lib/firebase-admin');
const { validateSession } = require('../../lib/session');
const { resolveStage, battleWinProb, BATTLE_STAKE_RATE, BATTLE_DAILY_CAP, parseStageKey } = require('../../lib/game-config');

function todayUTCBucket() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * 배틀에 실제로 사용할 별(레벨·트랙) 결정.
 * battleStarKey로 보관 별을 지정해뒀으면 그 별을, 아니면 현재 장비 중인 별을 사용.
 * 배틀은 별을 소모하지 않으므로 공격/방어 모두 이 값 하나로 동일하게 계산한다.
 */
function battleStarOf(user) {
  const key = user.battleStarKey;
  if (key && user.storedStars && (user.storedStars[key] || 0) > 0) {
    return parseStageKey(key);
  }
  return { level: user.currentStar || 0, track: user.track || null };
}

async function preview(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { opponentKey } = req.body;
  if (!opponentKey) return res.status(400).json({ ok: false, error: '상대를 지정하세요.' });
  if (opponentKey === userKey) return res.status(400).json({ ok: false, error: '자기 자신과는 배틀할 수 없습니다.' });

  // 서로 의존관계 없는 조회 4개를 한 번에 병렬로 (기존엔 순차 await 4번)
  const [meSnap, friendSnap, oppSnap, counterSnap] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`friends/${userKey}/${opponentKey}`).get(),
    db.ref(`users/${opponentKey}`).get(),
    db.ref(`battleCounters/${userKey}/${opponentKey}/${todayUTCBucket()}`).get(),
  ]);

  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const me = meSnap.val();
  if (me.banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  if (!friendSnap.exists()) {
    return res.status(403).json({ ok: false, error: '친구만 배틀할 수 있습니다.' });
  }

  if (!oppSnap.exists()) return res.status(404).json({ ok: false, error: '상대를 찾을 수 없습니다.' });
  const opp = oppSnap.val();
  if (opp.banned) return res.status(403).json({ ok: false, error: '정지된 사용자입니다.' });

  const myBattle  = battleStarOf(me);
  const oppBattle = battleStarOf(opp);

  const winProb = battleWinProb(myBattle.level, oppBattle.level);

  const usedToday = counterSnap.exists() ? counterSnap.val() : 0;
  const remainingToday = Math.max(0, BATTLE_DAILY_CAP - usedToday);

  const myStage  = resolveStage(myBattle.level, myBattle.track);
  const oppStage = resolveStage(oppBattle.level, oppBattle.track);

  res.json({
    ok: true,
    me: {
      currentStar: myBattle.level,
      track: myBattle.track,
      stageName: myStage ? myStage.name : '-',
    },
    opponent: {
      nickname: opp.nickname,
      currentStar: oppBattle.level,
      track: oppBattle.track,
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

  // 서로 의존관계 없는 조회 3개를 한 번에 병렬로 (기존엔 순차 await 3번)
  const [meSnap, friendSnap, oppSnap] = await Promise.all([
    db.ref(`users/${userKey}`).get(),
    db.ref(`friends/${userKey}/${opponentKey}`).get(),
    db.ref(`users/${opponentKey}`).get(),
  ]);

  if (!meSnap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  if (meSnap.val().banned) return res.status(403).json({ ok: false, error: '정지된 계정입니다.' });

  if (!friendSnap.exists()) {
    return res.status(403).json({ ok: false, error: '친구만 배틀할 수 있습니다.' });
  }

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

  // 트랜잭션은 battleCounters 경로만 건드리므로, 위에서 이미 읽은 유저 데이터를
  // 다시 읽지 않고 그대로 재사용한다(불필요한 read 2회 절감).
  const me  = meSnap.val();
  const opp = oppSnap.val();

  const myBattle  = battleStarOf(me);
  const oppBattle = battleStarOf(opp);

  const winProb = battleWinProb(myBattle.level, oppBattle.level);
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
    // 공격자 항목 — 실행 응답으로 결과를 즉시 받으므로 seen:true (알림 불필요)
    db.ref(`battleLogs/${userKey}`).push({
      opponent: opponentKey, opponentNick: opp.nickname, role: 'attacker',
      myLevel: myBattle.level, oppLevel: oppBattle.level,
      winProb, result: win ? 'win' : 'loss', hydrogenDelta, at, seen: true,
    }),
    // 방어자 항목 — 방어자는 배틀 순간 접속 중이 아닐 수 있으므로 seen:false
    // (notifications 액션이 홈 로드 시 이 값을 읽어 토스트로 보여주고 소비함)
    db.ref(`battleLogs/${opponentKey}`).push({
      opponent: userKey, opponentNick: me.nickname, role: 'defender',
      myLevel: oppBattle.level, oppLevel: myBattle.level,
      winProb: 1 - winProb, result: win ? 'loss' : 'win', hydrogenDelta: -hydrogenDelta, at, seen: false,
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
    // forEach 콜백이 truthy를 반환하면 순회가 중단되므로 push() 반환값이 새어나가지 않게 블록으로 감싼다.
    snap.forEach(child => { logs.push(child.val()); });
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

  // 프로필 사진 — 유저가 도감에서 직접 골라둔 별이 있으면 그걸, 없으면 현재 강화 중인
  // 별을 기본값으로 쓴다. 여러 명이 동시에 강화하는 상황에서 사진이 계속 바뀌는 걸
  // 막기 위해 currentStar와는 별개로 고정된 사진을 보여주기 위함.
  let picLevel = opp.currentStar || 0;
  let picTrack = opp.track || null;
  if (opp.profilePicKey) {
    const picStage = parseStageKey(opp.profilePicKey);
    if (resolveStage(picStage.level, picStage.track)) {
      picLevel = picStage.level;
      picTrack = picStage.track;
    }
  }

  // bestTrack이 도입되기 전(커밋 7e8a90f 이전)에 이미 14~21강을 찍은 레거시 계정은
  // bestTrack이 비어 있어 resolveStage(bestStar, null)이 실패 → 클라이언트가
  // COMMON_STAGES[0](거대 분자운)으로 잘못 대체 표시하는 문제가 있었다. 트랙은
  // 13→14강 전환 때만 바뀌므로, 현재 track을 최선의 추정치로 채워 넣는다.
  let bestTrack = opp.bestTrack || null;
  if (!bestTrack && opp.bestStar >= 14 && opp.bestStar <= 21) {
    bestTrack = opp.track || null;
  }

  res.json({
    ok: true,
    nickname: opp.nickname,
    studentId: opp.studentId || null,
    realName: opp.realName || null,
    currentStar: opp.currentStar || 0,
    track: opp.track || null,
    picLevel,
    picTrack,
    bestStar: opp.bestStar || 0,
    bestTrack,
    battleWins: opp.battleWins || 0,
    battleLosses: opp.battleLosses || 0,
    enhanceAttempts: opp.enhanceAttempts || 0,
    enhanceDestroys: opp.enhanceDestroys || 0,
    isFriend: friendSnap.exists(),
    hasPendingRequest: pendingOutSnap.exists() || pendingInSnap.exists(),
  });
}

async function setStar(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  const { starKey } = req.body;

  if (starKey == null) {
    // 보관 별 지정 해제 — 현재 장비 중인 별로 폴백
    await db.ref(`users/${userKey}/battleStarKey`).remove();
    return res.json({ ok: true, battleStarKey: null });
  }

  const snap = await db.ref(`users/${userKey}/storedStars/${starKey}`).get();
  const stored = snap.exists() ? snap.val() : 0;
  if (!stored || stored <= 0) {
    return res.status(400).json({ ok: false, error: '보관 중인 별이 아닙니다.' });
  }

  await db.ref(`users/${userKey}/battleStarKey`).set(starKey);
  res.json({ ok: true, battleStarKey: starKey });
}

async function notifications(req, res) {
  const userKey = await validateSession(req);
  if (!userKey) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

  // battleLogs는 execute()에서 공격자·방어자 양쪽에 push됨.
  // 방어자 항목만 seen:false로 남아있으므로 그것만 골라 알림으로 반환하고 소비(seen:true)한다.
  const snap = await db.ref(`battleLogs/${userKey}`).limitToLast(30).get();
  const items = [];
  const upd = {};
  if (snap.exists()) {
    snap.forEach(child => {
      const v = child.val();
      if (v.role === 'defender' && v.seen === false) {
        items.push({ opponentNick: v.opponentNick, result: v.result, hydrogenDelta: v.hydrogenDelta, at: v.at });
        upd[`battleLogs/${userKey}/${child.key}/seen`] = true;
      }
    });
  }
  if (Object.keys(upd).length) await db.ref().update(upd);
  items.sort((a, b) => a.at - b.at); // 오래된 순 — 홈 화면에서 순차 토스트로 표시

  res.json({ ok: true, items });
}

const ROUTES = { preview, execute, history, profile, setStar, notifications };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
