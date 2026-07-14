const db = require('../../lib/firebase-admin');
const crypto = require('crypto');
const { COMMON_STAGES, TRACKS, POST_TRACK_STAGES, stageKey } = require('../../lib/game-config');

// 관리자 세션 토큰 검증 헬퍼
async function validateAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  const snap = await db.ref(`adminSessions/${token}`).get();
  if (!snap.exists()) return false;
  // 24시간 만료
  if (Date.now() - snap.val().createdAt > 24 * 60 * 60 * 1000) {
    await db.ref(`adminSessions/${token}`).remove();
    return false;
  }
  return true;
}

async function verify(req, res) {
  const { passwordHash } = req.body;
  if (!passwordHash) return res.status(400).json({ ok: false, error: '비밀번호를 입력하세요.' });

  const snap = await db.ref('config/admin/passwordHash').get();

  // 최초 설정: 비밀번호가 없으면 입력한 값으로 즉시 설정
  if (!snap.exists()) {
    await db.ref('config/admin/passwordHash').set(passwordHash);
    const token = crypto.randomBytes(32).toString('hex');
    await db.ref(`adminSessions/${token}`).set({ createdAt: Date.now() });
    return res.json({ ok: true, token, firstSetup: true });
  }

  if (snap.val() !== passwordHash) {
    return res.status(401).json({ ok: false, error: '비밀번호가 틀렸습니다.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  await db.ref(`adminSessions/${token}`).set({ createdAt: Date.now() });
  res.json({ ok: true, token });
}

async function giveHydrogen(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { userKey, amount } = req.body;
  if (!userKey || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ ok: false, error: '올바른 userKey와 amount를 입력하세요.' });
  }

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  const user = snap.val();
  const newHydrogen = (user.hydrogen || 0) + amount;
  await db.ref(`users/${userKey}/hydrogen`).set(newHydrogen);

  res.json({ ok: true, userKey, added: amount, total: newHydrogen });
}

async function ban(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { userKey, banned } = req.body;
  if (!userKey || typeof banned !== 'boolean') {
    return res.status(400).json({ ok: false, error: '올바른 userKey와 banned(boolean) 값을 입력하세요.' });
  }

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });

  await db.ref(`users/${userKey}/banned`).set(banned);
  res.json({ ok: true, userKey, banned });
}

function convId(a, b) {
  return [a, b].sort().join('__');
}

// 계정을 완전히 삭제한다(벤과 달리 되돌릴 수 없음). 친구/친구요청/대화는 양쪽 계정에
// 각각 저장되므로, 삭제 대상 쪽만 지우면 상대방 화면에 "존재하지 않는 유저"가 유령
// 친구로 남는다 — 그래서 상대방 쪽 역방향 링크와 대화 내역도 함께 정리한다.
async function deleteUser(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { userKey, confirm } = req.body;
  if (!userKey) {
    return res.status(400).json({ ok: false, error: 'userKey를 입력하세요.' });
  }

  const snap = await db.ref(`users/${userKey}`).get();
  if (!snap.exists()) return res.status(404).json({ ok: false, error: '유저 없음' });
  const user = snap.val();

  // 오조작 방지 — 닉네임을 정확히 입력해야 실제로 삭제된다
  if (confirm !== user.nickname) {
    return res.status(400).json({ ok: false, error: '확인 문구(닉네임)가 일치하지 않습니다.' });
  }

  const [friendsSnap, reqInSnap, reqOutSnap] = await Promise.all([
    db.ref(`friends/${userKey}`).get(),
    db.ref(`friendRequests/${userKey}`).get(),
    db.ref(`friendRequestsSent/${userKey}`).get(),
  ]);

  const upd = {
    [`users/${userKey}`]: null,
    [`authSecrets/${userKey}`]: null,
    [`userEmails/${userKey}`]: null,
    [`enhanceLogs/${userKey}`]: null,
    [`battleLogs/${userKey}`]: null,
    [`battleCounters/${userKey}`]: null,
    [`messageIndex/${userKey}`]: null,
    [`friends/${userKey}`]: null,
    [`friendRequests/${userKey}`]: null,
    [`friendRequestsSent/${userKey}`]: null,
  };

  // studentIds/{학번} 인덱스도 함께 정리 — 안 지우면 삭제된 계정의 학번이 여전히
  // "등록됨"으로 남아, 같은 학번으로 재가입을 시도해도 거부되는 버그가 있었다.
  // 0000(선생님/외부인)은 애초에 이 인덱스에 없으므로 건드릴 필요 없다.
  if (user.studentId && user.studentId !== '0000') {
    upd[`studentIds/${user.studentId}`] = null;
  }

  // 친구 목록에 있던 상대방 쪽의 역방향 링크·대화 인덱스·대화 내용도 함께 정리
  if (friendsSnap.exists()) {
    friendsSnap.forEach(child => {
      const otherKey = child.key;
      upd[`friends/${otherKey}/${userKey}`] = null;
      upd[`messageIndex/${otherKey}/${userKey}`] = null;
      upd[`messages/${convId(userKey, otherKey)}`] = null;
    });
  }
  // 이 유저에게 온 친구 요청 → 보낸 사람의 "보낸 요청" 기록도 정리
  if (reqInSnap.exists()) {
    reqInSnap.forEach(child => {
      upd[`friendRequestsSent/${child.key}/${userKey}`] = null;
    });
  }
  // 이 유저가 보낸 친구 요청 → 받은 사람의 "받은 요청" 기록도 정리
  if (reqOutSnap.exists()) {
    reqOutSnap.forEach(child => {
      upd[`friendRequests/${child.key}/${userKey}`] = null;
    });
  }

  await db.ref().update(upd);
  res.json({ ok: true, userKey, nickname: user.nickname });
}

async function wipeUsers(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { confirm } = req.body;
  if (confirm !== '전체 유저 데이터 삭제') {
    return res.status(400).json({ ok: false, error: '확인 문구가 일치하지 않습니다.' });
  }

  // users/enhanceLogs/authSecrets만 지우던 시절 만들어진 버튼이라, 그 뒤 추가된
  // 친구·메시지·배틀·학번 관련 최상위 노드는 그대로 남아있었다. userKey가 닉네임에서
  // 결정적으로 파생되므로, 지운 뒤 같은 닉네임으로 재가입하면 옛 친구/대화/배틀 기록을
  // 그대로 물려받고, 학번은 studentIds 인덱스가 안 지워져 정당한 재가입도 막혔다.
  // adminSessions·config/admin(관리자 비밀번호)는 관리자 세션이 끊기지 않도록 보존.
  await db.ref().update({
    users: null,
    enhanceLogs: null,
    authSecrets: null,
    userEmails: null,
    emailVerifications: null,
    studentIds: null,
    friends: null,
    friendRequests: null,
    friendRequestsSent: null,
    messageIndex: null,
    messages: null,
    battleLogs: null,
    battleCounters: null,
  });

  res.json({ ok: true });
}

// 일회성 보안 마이그레이션 — 공개 읽기 경로(users/$uid.passwordHash)에 남아있는
// 구버전 계정의 비밀번호 해시를 비공개 경로(authSecrets/$uid)로 옮기고 제거한다.
// 로그인 시에도 개별적으로 마이그레이션되지만(auth/[action].js login), 다시 로그인하지
// 않는 비활성 계정까지 즉시 정리하기 위한 일괄 실행용 엔드포인트.
async function migrateSecrets(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const snap = await db.ref('users').get();
  const users = snap.val() || {};

  let migrated = 0;
  for (const [userKey, user] of Object.entries(users)) {
    if (!user.passwordHash) continue;
    await db.ref(`authSecrets/${userKey}`).set({ passwordHash: user.passwordHash });
    await db.ref(`users/${userKey}/passwordHash`).remove();
    migrated++;
  }

  res.json({ ok: true, migrated, totalUsers: Object.keys(users).length });
}

// 도감 전체 항목이 해금된 테스트용 계정을 생성(또는 기존 계정을 덮어써서 갱신)한다. QA/디자인 확인용.
async function createCheatAccount(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const nickname = (req.body.nickname || 'cheat').trim();
  const password = req.body.password || 'cheat1234';
  const userKey = nickname.toLowerCase().replace(/[^a-z0-9가-힣]/g, '_');

  const allKeys = [
    ...COMMON_STAGES.map(s => stageKey(s.level, null)),
    ...Object.entries(TRACKS).flatMap(([trackKey, stages]) => stages.map(s => stageKey(s.level, trackKey))),
    ...POST_TRACK_STAGES.map(s => stageKey(s.level, null)),
  ];

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  await db.ref(`authSecrets/${userKey}`).set({ passwordHash });
  await db.ref(`users/${userKey}`).set({
    nickname,
    isCheat: true,
    hydrogen: 999999999999,
    currentStar: 21,
    track: 'track1',
    bestStar: 21,
    bestTrack: 'track1',
    protectionScrolls: 99,
    battleWins: 0,
    battleLosses: 0,
    unlockedCodex: allKeys,
    items: {
      stellar_wind: 999, hypergiant_core: 999, supernova_glow: 999,
      neutron_crust: 999, pulsar_signal: 999, magnetar_flare: 999,
      hawking_radiation: 999, dark_matter: 999,
    },
    storedStars: {},
    createdAt: Date.now(),
  });

  res.json({ ok: true, nickname, password, userKey, totalUnlocked: allKeys.length });
}

// 버그 제보 목록 조회 — 관리자 전용. bugReports는 firebase-rules.json에서
// 공개 읽기/쓰기가 모두 차단되어 있으므로(기본 $other 규칙), firebase-admin SDK로
// 서버에서만 읽을 수 있고 클라이언트가 직접 접근할 방법이 없다.
async function listBugs(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const snap = await db.ref('bugReports').get();
  const raw = snap.val() || {};
  const reports = Object.entries(raw)
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));

  res.json({ ok: true, reports });
}

async function deleteBug(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: '삭제할 제보를 지정하세요.' });

  await db.ref(`bugReports/${key}`).remove();
  res.json({ ok: true });
}

// 유저별 인증 이메일 조회 — 관리자 전용. userEmails는 firebase-rules.json에서
// 공개 읽기/쓰기가 차단되어 있으므로, 이 admin-token 인증 API를 거쳐야만 볼 수 있다.
// 기존 loadUsers()의 공개 dbGet('users') 경로에는 이메일이 절대 실리지 않는다.
async function getUserEmails(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const snap = await db.ref('userEmails').get();
  const raw = snap.val() || {};
  const emails = {};
  for (const [userKey, v] of Object.entries(raw)) emails[userKey] = v.email;

  res.json({ ok: true, emails });
}

const ROUTES = {
  'verify': verify,
  'give-hydrogen': giveHydrogen,
  'ban': ban,
  'delete-user': deleteUser,
  'wipe-users': wipeUsers,
  'migrate-secrets': migrateSecrets,
  'create-cheat-account': createCheatAccount,
  'list-bugs': listBugs,
  'delete-bug': deleteBug,
  'get-user-emails': getUserEmails,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
