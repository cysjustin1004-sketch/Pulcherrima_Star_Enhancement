// 서버사이드 게임 설정 — star-game/config.js 의 CommonJS 버전
// 게임 수치 변경 시 두 파일 모두 동기화 필요
//
// v3 — 공통 14단계(level 0~13, 중심 수소 고갈까지) + 5트랙 분기(level 14~21,
// track1~5 — 저질량 별은 준거성을 거치지 않으므로 여기서 갈라짐) + 트랙
// 재수렴 우주 루트(level 22~29)
//
// 예외: 배틀 승률 공식(BATTLE_* 상수 + battleWinProb)은 서버 전용이며
// star-game/config.js에는 미러링하지 않는다. 승률은 항상
// /api/battle/preview 가 서버에서 계산해 반환하므로 클라이언트가
// 같은 공식을 재구현할 필요가 없고, 두 파일 간 드리프트 위험도 없다.

/** 닉네임 → Firebase 키 (특수문자 제거) — register/login/friends 검색이 공유 */
function nicknameToKey(nickname) {
  return nickname.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '_');
}

const ITEM_KEYS = {
  STELLAR_WIND:    'stellar_wind',
  HYPERGIANT_CORE: 'hypergiant_core',
  SUPERNOVA_GLOW:  'supernova_glow',
  NEUTRON_CRUST:   'neutron_crust',
  PULSAR_SIGNAL:   'pulsar_signal',
  MAGNETAR_FLARE:  'magnetar_flare',
  HAWKING:         'hawking_radiation',
  DARK_MATTER:     'dark_matter',
};

const ITEM_NAMES = {
  stellar_wind:      '영면을 맞이한 작은 행성',
  hypergiant_core:   '어린 별의 심장',
  supernova_glow:    '사라지는 별빛의 여명',
  neutron_crust:     '별이 남긴 잔광',
  pulsar_signal:     '끝없는 밤에 잠든 성광',
  magnetar_flare:    '뭇별이 애도한 불꽃',
  hawking_radiation: '이름 없는 별의 유언',
  dark_matter:       '적막의 여정',
};

const COMMON_STAGES = [
  { level:0,  name:'거대 분자운',          cost:{type:'hydrogen',amount:500},    successRate:1.00, sellPrice:null,    protectionCost:0, drop:null },
  { level:1,  name:'암흑 성운',            cost:{type:'hydrogen',amount:500},    successRate:0.98, sellPrice:200,     protectionCost:0, drop:null },
  { level:2,  name:'보크 구체',            cost:{type:'hydrogen',amount:1000},   successRate:0.95, sellPrice:500,     protectionCost:0, drop:null },
  { level:3,  name:'중력 붕괴',            cost:{type:'hydrogen',amount:2000},   successRate:0.93, sellPrice:1000,    protectionCost:0, drop:null },
  { level:4,  name:'원시 항성핵',          cost:{type:'hydrogen',amount:4000},   successRate:0.90, sellPrice:2000,    protectionCost:1, drop:null },
  { level:5,  name:'원시별',               cost:{type:'hydrogen',amount:7000},   successRate:0.86, sellPrice:6000,    protectionCost:1, drop:null },
  { level:6,  name:'원시행성 원반',        cost:{type:'hydrogen',amount:10000},  successRate:0.81, sellPrice:15000,   protectionCost:1, drop:{key:ITEM_KEYS.STELLAR_WIND,    min:1,max:3} },
  { level:7,  name:'허빅-하로 천체',       cost:{type:'hydrogen',amount:15000},  successRate:0.75, sellPrice:25000,   protectionCost:1, drop:{key:ITEM_KEYS.STELLAR_WIND,    min:1,max:3} },
  { level:8,  name:'전주계열성',           cost:{type:'hydrogen',amount:22000},  successRate:0.70, sellPrice:50000,   protectionCost:1, drop:{key:ITEM_KEYS.STELLAR_WIND,    min:1,max:3} },
  { level:9,  name:'FU 오리온 폭발',       cost:{type:'hydrogen',amount:30000},  successRate:0.66, sellPrice:90000,   protectionCost:1, drop:{key:ITEM_KEYS.HYPERGIANT_CORE, min:1,max:3} },
  { level:10, name:'영년 주계열',          cost:{type:'hydrogen',amount:30000},  successRate:0.62, sellPrice:180000,  protectionCost:1, drop:{key:ITEM_KEYS.SUPERNOVA_GLOW,  min:1,max:3} },
  { level:11, name:'주계열성',             cost:{type:'hydrogen',amount:51000},  successRate:0.61, sellPrice:500000,  protectionCost:1, drop:{key:ITEM_KEYS.NEUTRON_CRUST,   min:1,max:3} },
  { level:12, name:'주계열 성숙기',        cost:{type:'hydrogen',amount:70000},  successRate:0.54, sellPrice:1000000, protectionCost:1, drop:{key:ITEM_KEYS.NEUTRON_CRUST,   min:1,max:3} },
  { level:13, name:'중심 수소 고갈',       cost:{type:'hydrogen',amount:80000},  successRate:0.50, sellPrice:2000000, protectionCost:2, drop:{key:ITEM_KEYS.PULSAR_SIGNAL,   min:1,max:3} },
];

const TRACK_INFO = {
  track1: { name:'적색왜성 트랙' },
  track2: { name:'태양형 별 트랙' },
  track3: { name:'대질량 별 트랙' },
  track4: { name:'초대질량 별 트랙' },
  track5: { name:'극초대질량 별 트랙' },
};

// 트랙 8단계(14~21강) 공통 수치 커브 — 하드모드 원본 표의 +14~+21강 행과 1:1로 대응
// (14~16강은 예전엔 공통구간 마지막 3단계였던 걸 트랙 진입 시점이 앞당겨지며 흡수한 것)
const TRACKS = {
  // 저질량 별은 준거성을 거치지 않고(우주 나이 안에 주계열을 벗어날 수 없음) 13강 직후 바로 이 경로로 갈라진다
  track1: [
    { level:14, name:'적색왜성',        cost:{type:'hydrogen',amount:100000}, successRate:0.49, sellPrice:5000000,   protectionCost:3,  drop:{key:ITEM_KEYS.MAGNETAR_FLARE, min:1,max:3} },
    { level:15, name:'플레어별',        cost:{type:'hydrogen',amount:130000}, successRate:0.46, sellPrice:10000000,  protectionCost:4,  drop:{key:ITEM_KEYS.HAWKING,        min:1,max:3} },
    { level:16, name:'초장수명 주계열', cost:{type:'hydrogen',amount:170000}, successRate:0.44, sellPrice:20000000,  protectionCost:7,  drop:{key:ITEM_KEYS.DARK_MATTER,     min:1,max:2} },
    { level:17, name:'청색왜성化',      cost:{type:'hydrogen',amount:220000}, successRate:0.40, sellPrice:44500000,  protectionCost:9,  drop:null },
    { level:18, name:'청색왜성',        cost:{type:'hydrogen',amount:300000}, successRate:0.38, sellPrice:72000000,  protectionCost:10, drop:null },
    { level:19, name:'헬륨 백색왜성',   cost:{type:'hydrogen',amount:400000}, successRate:0.35, sellPrice:120000000, protectionCost:12, drop:null },
    { level:20, name:'백색왜성 냉각',   cost:{type:'hydrogen',amount:650000}, successRate:0.33, sellPrice:240000000, protectionCost:15, drop:null },
    { level:21, name:'흑색왜성',        cost:{type:'star',level:19,amount:1}, successRate:0.30, sellPrice:300000000, protectionCost:17, drop:null },
  ],
  // 준거성(14강)은 트랙2~5가 공유 — 저질량이 아닌 별은 실제로 다 이 단계를 거친 뒤에야 갈라진다
  track2: [
    { level:14, name:'준거성',          cost:{type:'hydrogen',amount:100000}, successRate:0.49, sellPrice:5000000,   protectionCost:3,  drop:{key:ITEM_KEYS.MAGNETAR_FLARE, min:1,max:3} },
    { level:15, name:'적색거성',        cost:{type:'hydrogen',amount:130000}, successRate:0.46, sellPrice:10000000,  protectionCost:4,  drop:{key:ITEM_KEYS.HAWKING,        min:1,max:3} },
    { level:16, name:'헬륨 섬광',       cost:{type:'hydrogen',amount:170000}, successRate:0.44, sellPrice:20000000,  protectionCost:7,  drop:{key:ITEM_KEYS.DARK_MATTER,     min:1,max:2} },
    { level:17, name:'수평가지',        cost:{type:'hydrogen',amount:220000}, successRate:0.40, sellPrice:44500000,  protectionCost:9,  drop:null },
    { level:18, name:'점근거성가지',    cost:{type:'hydrogen',amount:300000}, successRate:0.38, sellPrice:72000000,  protectionCost:10, drop:null },
    { level:19, name:'후-AGB 초바람',   cost:{type:'hydrogen',amount:400000}, successRate:0.35, sellPrice:120000000, protectionCost:12, drop:null },
    { level:20, name:'행성상성운',      cost:{type:'hydrogen',amount:650000}, successRate:0.33, sellPrice:240000000, protectionCost:15, drop:null },
    { level:21, name:'백색왜성',        cost:{type:'star',level:19,amount:1}, successRate:0.30, sellPrice:300000000, protectionCost:17, drop:null },
  ],
  track3: [
    { level:14, name:'준거성',          cost:{type:'hydrogen',amount:100000}, successRate:0.49, sellPrice:5000000,   protectionCost:3,  drop:{key:ITEM_KEYS.MAGNETAR_FLARE, min:1,max:3} },
    { level:15, name:'청색초거성',      cost:{type:'hydrogen',amount:130000}, successRate:0.46, sellPrice:10000000,  protectionCost:4,  drop:{key:ITEM_KEYS.HAWKING,        min:1,max:3} },
    { level:16, name:'적색초거성',      cost:{type:'hydrogen',amount:170000}, successRate:0.44, sellPrice:20000000,  protectionCost:7,  drop:{key:ITEM_KEYS.DARK_MATTER,     min:1,max:2} },
    { level:17, name:'규소 연소',       cost:{type:'hydrogen',amount:220000}, successRate:0.40, sellPrice:44500000,  protectionCost:9,  drop:null },
    { level:18, name:'철핵 붕괴',       cost:{type:'hydrogen',amount:300000}, successRate:0.38, sellPrice:72000000,  protectionCost:10, drop:null },
    { level:19, name:'II형 초신성',     cost:{type:'hydrogen',amount:400000}, successRate:0.35, sellPrice:120000000, protectionCost:12, drop:null },
    { level:20, name:'초신성 잔해',     cost:{type:'hydrogen',amount:650000}, successRate:0.33, sellPrice:240000000, protectionCost:15, drop:null },
    { level:21, name:'중성자별',        cost:{type:'star',level:19,amount:1}, successRate:0.30, sellPrice:300000000, protectionCost:17, drop:null },
  ],
  track4: [
    { level:14, name:'준거성',          cost:{type:'hydrogen',amount:100000}, successRate:0.49, sellPrice:5000000,   protectionCost:3,  drop:{key:ITEM_KEYS.MAGNETAR_FLARE, min:1,max:3} },
    { level:15, name:'O형 초거성',      cost:{type:'hydrogen',amount:130000}, successRate:0.46, sellPrice:10000000,  protectionCost:4,  drop:{key:ITEM_KEYS.HAWKING,        min:1,max:3} },
    { level:16, name:'밝은청색변광성',  cost:{type:'hydrogen',amount:170000}, successRate:0.44, sellPrice:20000000,  protectionCost:7,  drop:{key:ITEM_KEYS.DARK_MATTER,     min:1,max:2} },
    { level:17, name:'LBV 대폭발',      cost:{type:'hydrogen',amount:220000}, successRate:0.40, sellPrice:44500000,  protectionCost:9,  drop:null },
    { level:18, name:'볼프-레이에 별',  cost:{type:'hydrogen',amount:300000}, successRate:0.38, sellPrice:72000000,  protectionCost:10, drop:null },
    { level:19, name:'극초신성 / GRB',  cost:{type:'hydrogen',amount:400000}, successRate:0.35, sellPrice:120000000, protectionCost:12, drop:null },
    { level:20, name:'블랙홀 형성',     cost:{type:'hydrogen',amount:650000}, successRate:0.33, sellPrice:240000000, protectionCost:15, drop:null },
    { level:21, name:'항성질량 블랙홀', cost:{type:'star',level:19,amount:1}, successRate:0.30, sellPrice:300000000, protectionCost:17, drop:null },
  ],
  track5: [
    { level:14, name:'준거성',              cost:{type:'hydrogen',amount:100000}, successRate:0.49, sellPrice:5000000,   protectionCost:3,  drop:{key:ITEM_KEYS.MAGNETAR_FLARE, min:1,max:3} },
    { level:15, name:'극초거성',            cost:{type:'hydrogen',amount:130000}, successRate:0.46, sellPrice:10000000,  protectionCost:4,  drop:{key:ITEM_KEYS.HAWKING,        min:1,max:3} },
    { level:16, name:'극대광도 별',         cost:{type:'hydrogen',amount:170000}, successRate:0.44, sellPrice:20000000,  protectionCost:7,  drop:{key:ITEM_KEYS.DARK_MATTER,     min:1,max:2} },
    { level:17, name:'산소·규소 연소',      cost:{type:'hydrogen',amount:220000}, successRate:0.40, sellPrice:44500000,  protectionCost:9,  drop:null },
    { level:18, name:'쌍불안정 초신성',     cost:{type:'hydrogen',amount:300000}, successRate:0.38, sellPrice:72000000,  protectionCost:10, drop:null },
    { level:19, name:'초대질량 블랙홀 씨앗', cost:{type:'hydrogen',amount:400000}, successRate:0.35, sellPrice:120000000, protectionCost:12, drop:null },
    { level:20, name:'초대질량 블랙홀',     cost:{type:'hydrogen',amount:650000}, successRate:0.33, sellPrice:240000000, protectionCost:15, drop:null },
    { level:21, name:'퀘이사',              cost:{type:'star',level:19,amount:1}, successRate:0.30, sellPrice:300000000, protectionCost:17, drop:null },
  ],
};

// 트랙 종료 후 우주 루트(+22~+29) — 5개 트랙이 다시 합류, track 무관. 하드모드 원본 표 +22~+29강과 1:1 대응
const POST_TRACK_STAGES = [
  { level:22, name:'우리 은하',                   cost:{type:'star',level:21,amount:2},                    successRate:0.27, sellPrice:400000000,   protectionCost:20, drop:null },
  { level:23, name:'국부 은하군',                 cost:{type:'item',key:ITEM_KEYS.MAGNETAR_FLARE,amount:12}, successRate:0.27, sellPrice:550000000, protectionCost:22, drop:null },
  { level:24, name:'처녀자리 은하단',             cost:{type:'star',level:22,amount:1},                    successRate:0.25, sellPrice:750000000,   protectionCost:23, drop:null },
  { level:25, name:'라니아케아 초은하단',         cost:{type:'item',key:ITEM_KEYS.HAWKING,amount:15},     successRate:0.35, sellPrice:400000000,   protectionCost:23, drop:null },
  { level:26, name:'페르세우스-페가수스 필라멘트', cost:{type:'hydrogen',amount:5000000},                  successRate:0.50, sellPrice:1800000000,  protectionCost:-1, drop:null },
  { level:27, name:'우주 거미줄',                 cost:{type:'item',key:ITEM_KEYS.DARK_MATTER,amount:2},  successRate:0.40, sellPrice:2500000000,  protectionCost:-1, drop:null },
  { level:28, name:'관측가능한 우주',             cost:{type:'hydrogen',amount:0},                         successRate:0.15, sellPrice:null,         protectionCost:-1, drop:null },
  { level:29, name:'전체 우주',                   cost:null, successRate:null, sellPrice:null, protectionCost:null, drop:null },
];

/** 레벨(+track)에 해당하는 단계 데이터 반환 — 공통(0~13, 22~29)은 track 불필요 */
function resolveStage(level, track) {
  if (level == null) return null;
  if (level <= 13) return COMMON_STAGES[level];
  if (level <= 21) {
    const t = TRACKS[track];
    return t ? t[level - 14] : null;
  }
  return POST_TRACK_STAGES[level - 22] || null;
}

/** storedStars/unlockedCodex에 쓰는 문자열 키 — 공통(0~13, 22~29)은 track 무관 */
function stageKey(level, track) {
  return (level <= 13 || level >= 22) ? String(level) : `${track}_${level}`;
}

/** stageKey의 역변환 — "track3_20" → {level:20, track:'track3'}, "7" → {level:7, track:null} */
function parseStageKey(key) {
  const m = /^(track\d)_(\d+)$/.exec(key);
  return m ? { level: parseInt(m[2], 10), track: m[1] } : { level: parseInt(key, 10), track: null };
}

const SHOP_ITEMS = [
  { id:'warp_9',       type:'warp',       targetLevel:9,  price:800000,   amount:null },
  { id:'warp_13',      type:'warp',       targetLevel:13, price:5000000,  amount:null },
  { id:'warp_14',      type:'warp',       targetLevel:14, price:7500000,  amount:null },
  { id:'warp_15',      type:'warp',       targetLevel:15, price:10000000, amount:null },
  { id:'protection_1', type:'protection', targetLevel:null, price:2100000, amount:1 },
  { id:'protection_3', type:'protection', targetLevel:null, price:6000000, amount:3 },
];

const RECIPES = [
  { id:'r1', inputs:[{key:ITEM_KEYS.STELLAR_WIND,    amount:8}], output:{type:'protection',amount:1} },
  { id:'r2', inputs:[{key:ITEM_KEYS.HYPERGIANT_CORE, amount:5}], output:{type:'protection',amount:1} },
  { id:'r3', inputs:[{key:ITEM_KEYS.SUPERNOVA_GLOW,  amount:3}], output:{type:'star', level:13} },
  { id:'r4', inputs:[{key:ITEM_KEYS.NEUTRON_CRUST,   amount:5}], output:{type:'protection',amount:2} },
  { id:'r5', inputs:[{key:ITEM_KEYS.PULSAR_SIGNAL,   amount:2}], output:{type:'star', trackRelative:2} },
  { id:'r6', inputs:[{key:ITEM_KEYS.MAGNETAR_FLARE,  amount:4}], output:{type:'protection',amount:4} },
  { id:'r7', inputs:[{key:ITEM_KEYS.MAGNETAR_FLARE,  amount:4}], output:{type:'star', trackRelative:5} },
  { id:'r8', inputs:[{key:ITEM_KEYS.HAWKING,          amount:6}], output:{type:'protection',amount:10} },
  { id:'r9', inputs:[{key:ITEM_KEYS.DARK_MATTER,      amount:4}], output:{type:'protection',amount:11} },
];

const STARTING_HYDROGEN = 2000000;

// 보관된 별(storedStars) 총 개수 상한 — 모든 트랙/레벨 합산
const INVENTORY_CAP = 30;

// 분당 최대 강화 시도 횟수 (매크로/스크립트 남용 방지, 메모리 기반 — lib/rate-limit.js)
const RATE_LIMIT = { maxPerMinute: 130 };

// ============================================================
// PvP 배틀 — 승률 공식 + 경제 상수 (서버 전용, 클라 미러 없음)
// ============================================================

const BATTLE_K          = 0.35;  // 로지스틱 곡선 기울기
const BATTLE_FLOOR      = 0.05;  // 최소 승률 5%
const BATTLE_CEIL       = 0.95;  // 최대 승률 95%
const BATTLE_STAKE_RATE = 0.10;  // 패배자가 잃는 수소 = 패배자 보유 수소의 10%
const BATTLE_DAILY_CAP  = 10;    // 동일 상대 하루 최대 배틀 횟수

/**
 * 공격자의 승률 계산 — currentStar(장비 중 등급) 레벨차 기반 로지스틱 + 클램프.
 * 등급이 높을수록 유리하지만 5~95%로 묶어 역전 가능성을 항상 남겨둔다.
 * @returns {number} 0~1 사이 공격자 승률
 */
function battleWinProb(attackerLevel, defenderLevel) {
  const d = (attackerLevel || 0) - (defenderLevel || 0);
  const raw = 1 / (1 + Math.exp(-BATTLE_K * d));
  return Math.min(BATTLE_CEIL, Math.max(BATTLE_FLOOR, raw));
}

module.exports = {
  nicknameToKey,
  ITEM_KEYS, ITEM_NAMES,
  COMMON_STAGES, TRACK_INFO, TRACKS, POST_TRACK_STAGES, resolveStage, stageKey, parseStageKey,
  SHOP_ITEMS, RECIPES, STARTING_HYDROGEN, INVENTORY_CAP, RATE_LIMIT,
  BATTLE_K, BATTLE_FLOOR, BATTLE_CEIL, BATTLE_STAKE_RATE, BATTLE_DAILY_CAP,
  battleWinProb,
};
