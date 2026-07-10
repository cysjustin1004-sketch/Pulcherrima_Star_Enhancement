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

async function wipeUsers(req, res) {
  if (!await validateAdmin(req)) {
    return res.status(401).json({ ok: false, error: '관리자 인증이 필요합니다.' });
  }

  const { confirm } = req.body;
  if (confirm !== '전체 유저 데이터 삭제') {
    return res.status(400).json({ ok: false, error: '확인 문구가 일치하지 않습니다.' });
  }

  await db.ref().update({
    users: null,
    enhanceLogs: null,
    authSecrets: null,
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

const ROUTES = {
  'verify': verify,
  'give-hydrogen': giveHydrogen,
  'ban': ban,
  'wipe-users': wipeUsers,
  'migrate-secrets': migrateSecrets,
  'create-cheat-account': createCheatAccount,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const handler = ROUTES[req.query.action];
  if (!handler) return res.status(404).json({ ok: false, error: 'Not found' });

  return handler(req, res);
};
