// 서버사이드 게임 설정 — star-game/config.js 의 CommonJS 버전
// 게임 수치 변경 시 두 파일 모두 동기화 필요

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
  stellar_wind:     '항성풍 파편',
  hypergiant_core:  '극초거성 핵 파편',
  supernova_glow:   '초신성 잔광',
  neutron_crust:    '중성자별 껍질 조각',
  pulsar_signal:    '펄사 전파 신호',
  magnetar_flare:   '마그네타 섬광',
  hawking_radiation:'호킹 복사',
  dark_matter:      '암흑 물질 조각',
};

const STAGES = [
  { level:0,  name:'오리온 성운',      cost:{type:'hydrogen',amount:500},                                              successRate:1.00, sellPrice:null,       protectionCost:0,  drop:null },
  { level:1,  name:'말머리 성운',      cost:{type:'hydrogen',amount:500},                                              successRate:0.98, sellPrice:200,        protectionCost:0,  drop:null },
  { level:2,  name:'독수리 성운',      cost:{type:'hydrogen',amount:1000},                                             successRate:0.95, sellPrice:500,        protectionCost:0,  drop:null },
  { level:3,  name:'HL 타우리',        cost:{type:'hydrogen',amount:2000},                                             successRate:0.93, sellPrice:1000,       protectionCost:0,  drop:null },
  { level:4,  name:'제타 퍼페이',      cost:{type:'hydrogen',amount:4000},                                             successRate:0.90, sellPrice:2000,       protectionCost:1,  drop:null },
  { level:5,  name:'리겔',             cost:{type:'hydrogen',amount:7000},                                             successRate:0.86, sellPrice:6000,       protectionCost:1,  drop:null },
  { level:6,  name:'에타 용골자리',    cost:{type:'hydrogen',amount:10000},                                            successRate:0.81, sellPrice:15000,      protectionCost:1,  drop:{key:ITEM_KEYS.STELLAR_WIND,    min:1,max:3} },
  { level:7,  name:'WR 104',           cost:{type:'hydrogen',amount:15000},                                            successRate:0.75, sellPrice:25000,      protectionCost:1,  drop:{key:ITEM_KEYS.STELLAR_WIND,    min:1,max:3} },
  { level:8,  name:'베텔게우스',       cost:{type:'hydrogen',amount:22000},                                            successRate:0.70, sellPrice:50000,      protectionCost:1,  drop:{key:ITEM_KEYS.STELLAR_WIND,    min:1,max:3} },
  { level:9,  name:'UY 방패자리',      cost:{type:'hydrogen',amount:30000},                                            successRate:0.66, sellPrice:90000,      protectionCost:1,  drop:{key:ITEM_KEYS.HYPERGIANT_CORE, min:1,max:2} },
  { level:10, name:'SN 1987A',         cost:{type:'hydrogen',amount:30000},                                            successRate:0.62, sellPrice:180000,     protectionCost:1,  drop:{key:ITEM_KEYS.SUPERNOVA_GLOW,  min:1,max:2} },
  { level:11, name:'게 성운',          cost:{type:'hydrogen',amount:51000},                                            successRate:0.61, sellPrice:500000,     protectionCost:1,  drop:{key:ITEM_KEYS.NEUTRON_CRUST,   min:1,max:2} },
  { level:12, name:'PSR B1919+21',     cost:{type:'hydrogen',amount:70000},                                            successRate:0.54, sellPrice:1000000,    protectionCost:1,  drop:{key:ITEM_KEYS.NEUTRON_CRUST,   min:1,max:2} },
  { level:13, name:'게 펄사',          cost:{type:'hydrogen',amount:80000},                                            successRate:0.50, sellPrice:2000000,    protectionCost:2,  drop:{key:ITEM_KEYS.PULSAR_SIGNAL,   min:1,max:2} },
  { level:14, name:'SGR 1806-20',      cost:{type:'hydrogen',amount:100000},                                           successRate:0.49, sellPrice:5000000,    protectionCost:3,  drop:{key:ITEM_KEYS.MAGNETAR_FLARE,  min:1,max:2} },
  { level:15, name:'백조자리 X-1',    cost:{type:'hydrogen',amount:130000},                                            successRate:0.46, sellPrice:10000000,   protectionCost:4,  drop:{key:ITEM_KEYS.HAWKING,          min:1,max:2} },
  { level:16, name:'HLX-1',           cost:{type:'hydrogen',amount:170000},                                            successRate:0.44, sellPrice:20000000,   protectionCost:7,  drop:{key:ITEM_KEYS.DARK_MATTER,      min:1,max:2} },
  { level:17, name:'M87*',            cost:{type:'hydrogen',amount:220000},                                            successRate:0.40, sellPrice:44500000,   protectionCost:9,  drop:null },
  { level:18, name:'궁수자리 A*',     cost:{type:'hydrogen',amount:300000},                                            successRate:0.38, sellPrice:72000000,   protectionCost:10, drop:null },
  { level:19, name:'TON 618',         cost:{type:'hydrogen',amount:400000},                                            successRate:0.35, sellPrice:120000000,  protectionCost:12, drop:null },
  { level:20, name:'켄타우루스 A',    cost:{type:'hydrogen',amount:650000},                                            successRate:0.33, sellPrice:240000000,  protectionCost:15, drop:null },
  { level:21, name:'3C 273',          cost:{type:'star',level:20,amount:1},                                            successRate:0.30, sellPrice:300000000,  protectionCost:17, drop:null },
  { level:22, name:'GRB 221009A',     cost:{type:'star',level:21,amount:2},                                            successRate:0.27, sellPrice:400000000,  protectionCost:20, drop:null },
  { level:23, name:'허큘리스-북쪽왕관 장성', cost:{type:'item',key:ITEM_KEYS.MAGNETAR_FLARE,amount:12},               successRate:0.27, sellPrice:550000000,  protectionCost:22, drop:null },
  { level:24, name:'쌍어자리 초공동', cost:{type:'star',level:22,amount:1},                                            successRate:0.25, sellPrice:750000000,  protectionCost:23, drop:null },
  { level:25, name:'관측 가능한 우주', cost:{type:'item',key:ITEM_KEYS.HAWKING,amount:15},                             successRate:0.35, sellPrice:400000000,  protectionCost:23, drop:null },
  { level:26, name:'우주 급팽창 시대', cost:{type:'hydrogen',amount:5000000},                                          successRate:0.50, sellPrice:1800000000, protectionCost:-1, drop:null },
  { level:27, name:'우주 마이크로파 배경', cost:{type:'item',key:ITEM_KEYS.DARK_MATTER,amount:2},                     successRate:0.40, sellPrice:2500000000, protectionCost:-1, drop:null },
  { level:28, name:'우주 특이점',     cost:{type:'hydrogen',amount:0},                                                 successRate:0.15, sellPrice:null,       protectionCost:-1, drop:null },
  { level:29, name:'빅뱅',            cost:null,                                                                       successRate:null, sellPrice:null,       protectionCost:null, drop:null },
];

const SHOP_ITEMS = [
  { id:'warp_9',       type:'warp',       targetLevel:9,  price:1000000,  amount:null },
  { id:'warp_13',      type:'warp',       targetLevel:13, price:7000000,  amount:null },
  { id:'warp_14',      type:'warp',       targetLevel:14, price:10000000, amount:null },
  { id:'warp_15',      type:'warp',       targetLevel:15, price:15000000, amount:null },
  { id:'protection_1', type:'protection', targetLevel:null, price:1000000, amount:1 },
  { id:'protection_3', type:'protection', targetLevel:null, price:2500000, amount:3 },
];

const RECIPES = [
  { id:'r1', inputs:[{key:ITEM_KEYS.STELLAR_WIND,    amount:8}], output:{type:'protection',amount:1} },
  { id:'r2', inputs:[{key:ITEM_KEYS.HYPERGIANT_CORE, amount:5}], output:{type:'protection',amount:1} },
  { id:'r3', inputs:[{key:ITEM_KEYS.SUPERNOVA_GLOW,  amount:3}], output:{type:'star',level:13} },
  { id:'r4', inputs:[{key:ITEM_KEYS.NEUTRON_CRUST,   amount:5}], output:{type:'protection',amount:2} },
  { id:'r5', inputs:[{key:ITEM_KEYS.PULSAR_SIGNAL,   amount:2}], output:{type:'star',level:16} },
  { id:'r6', inputs:[{key:ITEM_KEYS.MAGNETAR_FLARE,  amount:4}], output:{type:'protection',amount:4} },
  { id:'r7', inputs:[{key:ITEM_KEYS.MAGNETAR_FLARE,  amount:6}], output:{type:'star',level:19} },
  { id:'r8', inputs:[{key:ITEM_KEYS.HAWKING,          amount:6}], output:{type:'protection',amount:10} },
  { id:'r9', inputs:[{key:ITEM_KEYS.DARK_MATTER,      amount:4}], output:{type:'protection',amount:11} },
];

const STARTING_HYDROGEN = 2000000;

module.exports = { ITEM_KEYS, ITEM_NAMES, STAGES, SHOP_ITEMS, RECIPES, STARTING_HYDROGEN };
