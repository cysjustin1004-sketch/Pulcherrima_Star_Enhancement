// ============================================================
// config.js — 별 강화하기 게임 설정
// 이 파일만 수정하면 게임 수치/이름/설명을 모두 바꿀 수 있습니다.
// ============================================================

// 아이템 키 (Firebase 저장 키로 사용)
const ITEM_KEYS = {
  STELLAR_WIND:    'stellar_wind',       // 항성풍 파편
  HYPERGIANT_CORE: 'hypergiant_core',    // 극초거성 핵 파편
  SUPERNOVA_GLOW:  'supernova_glow',     // 초신성 잔광
  NEUTRON_CRUST:   'neutron_crust',      // 중성자별 껍질 조각
  PULSAR_SIGNAL:   'pulsar_signal',      // 펄사 전파 신호
  MAGNETAR_FLARE:  'magnetar_flare',     // 마그네타 섬광
  HAWKING:         'hawking_radiation',  // 호킹 복사
  DARK_MATTER:     'dark_matter',        // 암흑 물질 조각
};

// 아이템 표시 이름
const ITEM_NAMES = {
  [ITEM_KEYS.STELLAR_WIND]:    '항성풍 파편',
  [ITEM_KEYS.HYPERGIANT_CORE]: '극초거성 핵 파편',
  [ITEM_KEYS.SUPERNOVA_GLOW]:  '초신성 잔광',
  [ITEM_KEYS.NEUTRON_CRUST]:   '중성자별 껍질 조각',
  [ITEM_KEYS.PULSAR_SIGNAL]:   '펄사 전파 신호',
  [ITEM_KEYS.MAGNETAR_FLARE]:  '마그네타 섬광',
  [ITEM_KEYS.HAWKING]:         '호킹 복사',
  [ITEM_KEYS.DARK_MATTER]:     '암흑 물질 조각',
};

// ============================================================
// 강화 단계 데이터 (+0 ~ +29)
//
// cost 형식:
//   { type: 'hydrogen', amount: N }          수소 소모
//   { type: 'item', key: ITEM_KEY, amount: N } 아이템 소모
//   { type: 'star', level: N, amount: N }     보관된 별 소모
//   null                                       강화 불가 (+29)
//
// protectionCost:
//   0   = 하락 없음 (방지권 불필요)
//   N>0 = 방지권 N개 소모로 하락 방지
//   -1  = 방지권 불가 (+26~+28)
// ============================================================
const STAGES = [
  {
    level: 0,
    name: '오리온 성운',
    subname: 'M42',
    type: '성간 가스 구름',
    cost: { type: 'hydrogen', amount: 500 },
    successRate: 1.00,
    sellPrice: null,
    protectionCost: 0,
    drop: null,
    codexDescription: '지구에서 약 1,344광년 떨어진 오리온자리의 거대한 성운. 맨눈으로도 보이며 활발한 별 생성 지역이다. 가로 40광년에 달하는 규모로, 내부에서는 지금도 수백 개의 어린 별들이 탄생하고 있다.',
  },
  {
    level: 1,
    name: '말머리 성운',
    subname: 'IC 434',
    type: '암흑 분자운',
    cost: { type: 'hydrogen', amount: 500 },
    successRate: 0.98,
    sellPrice: 200,
    protectionCost: 0,
    drop: null,
    codexDescription: '오리온자리의 암흑 성운으로, 말 머리를 닮은 독특한 실루엣으로 유명하다. 1,375광년 거리에 위치하며, 뒤쪽의 빛나는 가스 구름이 역광 효과를 만들어 그 형태가 선명하게 드러난다.',
  },
  {
    level: 2,
    name: '독수리 성운',
    subname: 'M16 · 창조의 기둥',
    type: '방출 성운',
    cost: { type: 'hydrogen', amount: 1000 },
    successRate: 0.95,
    sellPrice: 500,
    protectionCost: 0,
    drop: null,
    codexDescription: '\'창조의 기둥\'으로 유명한 성운. 7,000광년 거리에 위치하며 그 안에서 새로운 별들이 탄생 중이다. 1995년 허블 우주망원경이 찍은 사진은 현대 천문학의 아이콘이 되었다.',
  },
  {
    level: 3,
    name: 'HL 타우리',
    subname: 'HL Tau',
    type: '원시별',
    cost: { type: 'hydrogen', amount: 2000 },
    successRate: 0.93,
    sellPrice: 1000,
    protectionCost: 0,
    drop: null,
    codexDescription: '황소자리에 위치한 약 100만 년 된 아기 별. ALMA 망원경이 2014년 촬영한 이미지에서 행성 형성 원반의 고리 구조가 선명하게 보여 천문학계를 놀라게 했다. 거리는 약 450광년.',
  },
  {
    level: 4,
    name: '제타 퍼페이',
    subname: 'ζ Puppis',
    type: 'O형 주계열성',
    cost: { type: 'hydrogen', amount: 4000 },
    successRate: 0.90,
    sellPrice: 2000,
    protectionCost: 1,
    drop: null,
    codexDescription: '돛자리의 O형 초고온 청색 별. 표면 온도 약 42,000K로 태양보다 20배 무겁고 250,000배 밝다. 강렬한 항성풍을 방출하며 약 1,400광년 거리에 위치한다.',
  },
  {
    level: 5,
    name: '리겔',
    subname: 'β Orionis',
    type: '청색초거성',
    cost: { type: 'hydrogen', amount: 7000 },
    successRate: 0.86,
    sellPrice: 6000,
    protectionCost: 1,
    drop: null,
    codexDescription: '오리온자리의 가장 밝은 별. 태양보다 21배 무겁고 120,000배 밝은 청색초거성으로 863광년 거리에 있다. 수백만 년 안에 초신성 폭발을 일으킬 것으로 예상된다.',
  },
  {
    level: 6,
    name: '에타 용골자리',
    subname: 'η Carinae',
    type: '광도변광성 (LBV)',
    cost: { type: 'hydrogen', amount: 10000 },
    successRate: 0.81,
    sellPrice: 15000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '7,500광년 거리의 불안정한 극거성. 1840년대에 태양의 수백만 배 에너지를 방출하는 대폭발을 일으켜 일시적으로 전천에서 두 번째로 밝은 별이 되었다. 언제든 초신성으로 폭발할 수 있는 후보다.',
  },
  {
    level: 7,
    name: 'WR 104',
    subname: '볼프-레이에 별',
    type: '볼프-레이에 별',
    cost: { type: 'hydrogen', amount: 15000 },
    successRate: 0.75,
    sellPrice: 25000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '독수리자리에 위치한 쌍성계. 두 별이 220일 주기로 공전하며 풍차 모양의 나선 성운을 만든다. 감마선 폭발 후보이며 그 방향이 지구를 향하고 있어 주목받는다.',
  },
  {
    level: 8,
    name: '베텔게우스',
    subname: 'α Orionis',
    type: '적색초거성',
    cost: { type: 'hydrogen', amount: 22000 },
    successRate: 0.70,
    sellPrice: 50000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '오리온자리의 적색초거성. 태양의 700배 크기로, 이 별이 태양 자리에 있다면 목성 궤도까지 뒤덮는다. 700광년 거리에 있으며 10만 년 안에 초신성 폭발이 예상된다.',
  },
  {
    level: 9,
    name: 'UY 방패자리',
    subname: 'UY Scuti',
    type: '극초거성',
    cost: { type: 'hydrogen', amount: 30000 },
    successRate: 0.66,
    sellPrice: 90000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.HYPERGIANT_CORE, min: 1, max: 2 },
    codexDescription: '현재까지 알려진 가장 큰 별 중 하나. 태양의 약 1,700배 반지름을 가지며 9,500광년 거리에 위치한다. 부피로는 태양의 50억 배에 달하며 극도로 불안정한 상태다.',
  },
  {
    level: 10,
    name: 'SN 1987A',
    subname: '대마젤란 은하 초신성',
    type: 'II형 초신성',
    cost: { type: 'hydrogen', amount: 30000 },
    successRate: 0.62,
    sellPrice: 180000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.SUPERNOVA_GLOW, min: 1, max: 2 },
    codexDescription: '1987년 2월 관측된 초신성. 168,000광년 거리에서 폭발했음에도 육안으로 관측 가능했다. 뉴트리노 폭풍이 검출되어 초신성 이론을 실험적으로 검증한 역사적 사건이다.',
  },
  {
    level: 11,
    name: '게 성운',
    subname: 'M1 · SN 1054 잔해',
    type: '초신성 잔해',
    cost: { type: 'hydrogen', amount: 51000 },
    successRate: 0.61,
    sellPrice: 500000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.NEUTRON_CRUST, min: 1, max: 2 },
    codexDescription: '1054년 기록된 초신성 폭발의 잔해. 6,523광년 거리에서 빠르게 팽창 중이며 중심에는 게 펄사가 있다. 직경 11광년에 달하며 X선부터 전파까지 폭넓게 방출한다.',
  },
  {
    level: 12,
    name: 'PSR B1919+21',
    subname: '최초 발견 펄사',
    type: '중성자별',
    cost: { type: 'hydrogen', amount: 70000 },
    successRate: 0.54,
    sellPrice: 1000000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.NEUTRON_CRUST, min: 1, max: 2 },
    codexDescription: '1967년 조슬린 벨이 발견한 인류 최초의 펄사. 처음에는 규칙적인 전파 신호에 \'LGM-1\'(작은 녹색인간)이라는 별명이 붙었다. 중성자별이 회전하며 방출하는 전파 빔임이 밝혀졌다.',
  },
  {
    level: 13,
    name: '게 펄사',
    subname: 'PSR B0531+21',
    type: '펄사',
    cost: { type: 'hydrogen', amount: 80000 },
    successRate: 0.50,
    sellPrice: 2000000,
    protectionCost: 2,
    drop: { key: ITEM_KEYS.PULSAR_SIGNAL, min: 1, max: 2 },
    codexDescription: '게 성운 중심의 중성자별. 초당 30회 회전하며 강력한 전파와 X선을 방출한다. 직경 약 28km에 태양 질량 1.4배를 담은 초밀도 천체로, 표면 중력은 지구의 2천억 배다.',
  },
  {
    level: 14,
    name: 'SGR 1806-20',
    subname: '마그네타',
    type: '마그네타',
    cost: { type: 'hydrogen', amount: 100000 },
    successRate: 0.49,
    sellPrice: 5000000,
    protectionCost: 3,
    drop: { key: ITEM_KEYS.MAGNETAR_FLARE, min: 1, max: 2 },
    codexDescription: '궁수자리 방향 50,000광년 거리의 마그네타. 2004년 12월 27일 0.2초 동안 태양이 10만 년간 방출하는 에너지를 폭발시켰다. 이 섬광은 지구 전리층을 일시적으로 교란시켰다.',
  },
  {
    level: 15,
    name: '백조자리 X-1',
    subname: 'Cygnus X-1',
    type: '항성질량 블랙홀',
    cost: { type: 'hydrogen', amount: 130000 },
    successRate: 0.46,
    sellPrice: 10000000,
    protectionCost: 4,
    drop: { key: ITEM_KEYS.HAWKING, min: 1, max: 2 },
    codexDescription: '인류 최초로 확인된 블랙홀 후보. 약 6,100광년 거리에서 동반성의 물질을 빨아들이며 강렬한 X선을 방출한다. 태양 질량의 21배. 스티븐 호킹이 킵 손과 이 천체를 놓고 내기를 했으며, 호킹이 졌다.',
  },
  {
    level: 16,
    name: 'HLX-1',
    subname: 'ESO 243-49 HLX-1',
    type: '중간질량 블랙홀',
    cost: { type: 'hydrogen', amount: 170000 },
    successRate: 0.44,
    sellPrice: 20000000,
    protectionCost: 7,
    drop: { key: ITEM_KEYS.DARK_MATTER, min: 1, max: 2 },
    codexDescription: '2.9억 광년 거리 은하에서 발견된 중간질량 블랙홀 최유력 후보. 태양 질량의 약 20,000배. 항성질량과 초대질량 블랙홀 사이의 미싱 링크로 주목받는다.',
  },
  {
    level: 17,
    name: 'M87*',
    subname: '버질 · 처녀자리 A',
    type: '초대질량 블랙홀',
    cost: { type: 'hydrogen', amount: 220000 },
    successRate: 0.40,
    sellPrice: 44500000,
    protectionCost: 9,
    drop: null,
    codexDescription: '5,500만 광년 거리 M87 은하 중심의 블랙홀. 태양 질량의 65억 배. 2019년 4월 10일, 사건 지평선 망원경(EHT)이 인류 최초로 블랙홀의 실제 이미지를 촬영하는 데 성공했다.',
  },
  {
    level: 18,
    name: '궁수자리 A*',
    subname: 'Sgr A*',
    type: '우리 은하 중심 블랙홀',
    cost: { type: 'hydrogen', amount: 300000 },
    successRate: 0.38,
    sellPrice: 72000000,
    protectionCost: 10,
    drop: null,
    codexDescription: '우리 은하 중심의 초대질량 블랙홀. 태양 질량의 400만 배. 2022년 EHT가 두 번째 블랙홀 사진으로 공개했다. 지구에서 약 26,000광년 거리에 있으며 은하 전체 별들의 공전 중심이다.',
  },
  {
    level: 19,
    name: 'TON 618',
    subname: '사냥개자리 블랙홀',
    type: '은하질량 블랙홀',
    cost: { type: 'hydrogen', amount: 400000 },
    successRate: 0.35,
    sellPrice: 120000000,
    protectionCost: 12,
    drop: null,
    codexDescription: '104억 광년 거리에 위치한 초대질량 블랙홀. 태양 질량의 660억 배로 현재까지 알려진 가장 무거운 블랙홀 중 하나다. 이 블랙홀 자체의 크기가 태양계 전체보다 크다.',
  },
  {
    level: 20,
    name: '켄타우루스 A',
    subname: 'NGC 5128',
    type: '활동은하핵 (AGN)',
    cost: { type: 'hydrogen', amount: 650000 },
    successRate: 0.33,
    sellPrice: 240000000,
    protectionCost: 15,
    drop: null,
    codexDescription: '1,300만 광년 거리로 지구에서 가장 가까운 전파 은하. 중심의 초대질량 블랙홀이 강력한 제트를 뿜어내며 양쪽으로 뻗어있다. 가시광·전파·X선 등 다양한 파장으로 관측된다.',
  },
  {
    level: 21,
    name: '3C 273',
    subname: '처녀자리 퀘이사',
    type: '퀘이사',
    cost: { type: 'star', level: 20, amount: 1 },  // 켄타우루스 A 별 1개
    successRate: 0.30,
    sellPrice: 300000000,
    protectionCost: 17,
    drop: null,
    codexDescription: '24억 광년 거리의 가장 밝은 퀘이사. 1963년 최초로 확인된 퀘이사 중 하나로, 우리 은하 전체보다 수조 배 밝다. 중심의 블랙홀 질량은 태양의 약 9억 배다.',
  },
  {
    level: 22,
    name: 'GRB 221009A',
    subname: 'BOAT · 화살자리',
    type: '감마선 폭발체',
    cost: { type: 'star', level: 21, amount: 2 },  // 3C 273 별 2개
    successRate: 0.27,
    sellPrice: 400000000,
    protectionCost: 20,
    drop: null,
    codexDescription: '2022년 10월 9일 관측된 사상 최강의 감마선 폭발. \'BOAT\'(Brightest Of All Time). 24억 광년 거리에서 발생했음에도 지구 전리층을 교란시켰다. 이런 규모의 폭발은 1만 년에 한 번꼴이다.',
  },
  {
    level: 23,
    name: '허큘리스-북쪽왕관 장성',
    subname: 'Hercules–Corona Borealis Great Wall',
    type: '우주 거대구조',
    cost: { type: 'item', key: ITEM_KEYS.MAGNETAR_FLARE, amount: 12 },
    successRate: 0.27,
    sellPrice: 550000000,
    protectionCost: 22,
    drop: null,
    codexDescription: '현재까지 발견된 우주에서 가장 큰 구조물. 약 100억 광년 크기로, 우주 균질성 원리에 도전한다. 은하들이 필라멘트 형태로 연결된 이 구조는 우주 거대 구조 이론의 한계를 시험하고 있다.',
  },
  {
    level: 24,
    name: '쌍어자리 초공동',
    subname: 'Gemini Supervoid',
    type: '우주 거대 공동',
    cost: { type: 'star', level: 22, amount: 1 },  // GRB 221009A 별 1개
    successRate: 0.25,
    sellPrice: 750000000,
    protectionCost: 23,
    drop: null,
    codexDescription: '우주에서 발견된 거대한 빈 공간(보이드). 수억 광년 규모로 은하가 거의 없는 텅 빈 공간이다. 우주 거대 구조의 거품 내부에 해당하며 암흑 에너지의 영향을 받는 것으로 추정된다.',
  },
  {
    level: 25,
    name: '관측 가능한 우주',
    subname: 'Observable Universe',
    type: '우주 전체 구조',
    cost: { type: 'item', key: ITEM_KEYS.HAWKING, amount: 15 },
    successRate: 0.35,
    sellPrice: 400000000,
    protectionCost: 23,
    drop: null,
    codexDescription: '지구에서 관측 가능한 우주의 전체 범위. 반지름 약 465억 광년으로 빅뱅 이후 138억 년간 팽창한 우주의 관측 한계다. 약 2조 개의 은하를 포함하며 그 너머에도 우주는 계속된다.',
  },
  {
    level: 26,
    name: '우주 급팽창 시대',
    subname: 'Cosmic Inflation',
    type: '인플레이션 에포크',
    cost: { type: 'hydrogen', amount: 5000000 },
    successRate: 0.50,
    sellPrice: 1800000000,
    protectionCost: -1,  // 방지권 불가
    drop: null,
    codexDescription: '빅뱅 직후 10⁻³⁶~10⁻³²초 사이 우주가 지수적으로 팽창한 시기. 이 시기에 양자 요동이 우주 거대 구조의 씨앗이 되었다. 인플레이션 이론은 우주의 균질성과 평탄성을 설명하는 현대 우주론의 핵심이다.',
  },
  {
    level: 27,
    name: '우주 마이크로파 배경',
    subname: 'CMB · 재결합 시대',
    type: '우주 재결합 시대',
    cost: { type: 'item', key: ITEM_KEYS.DARK_MATTER, amount: 2 },
    successRate: 0.40,
    sellPrice: 2500000000,
    protectionCost: -1,
    drop: null,
    codexDescription: '빅뱅 38만 년 후 우주가 투명해진 시기의 빛. 현재 우주 전체에 2.7K 극초단파로 가득 차 있다. 초기 우주의 온도 요동이 CMB 지도에 새겨져 있어 우주 탄생의 \'화석\'이라 불린다.',
  },
  {
    level: 28,
    name: '우주 특이점',
    subname: '플랑크 시대',
    type: '빅뱅 직전',
    cost: { type: 'hydrogen', amount: 0 },  // 무료
    successRate: 0.15,
    sellPrice: null,  // 판매 불가
    protectionCost: -1,
    drop: null,
    codexDescription: '빅뱅 이전 모든 물질, 에너지, 공간, 시간이 하나의 점에 압축된 상태. 현재 물리학으로는 설명 불가능한 영역이며 밀도와 온도가 무한대였던 것으로 추정된다. 이 특이점에서 시간과 공간이 탄생했다.',
  },
  {
    level: 29,
    name: '빅뱅',
    subname: 'The Big Bang · 우주의 탄생',
    type: '우주의 시작',
    cost: null,  // 강화 불가 — 전설 달성
    successRate: null,
    sellPrice: null,
    protectionCost: null,
    drop: null,
    codexDescription: '약 138억 년 전, 극도로 뜨겁고 밀도 높은 상태에서 우주가 탄생한 사건. 모든 물질, 에너지, 공간, 시간의 시작점이다. 이후 우주는 계속 팽창하고 냉각되어 오늘날의 별, 은하, 그리고 우리를 만들어냈다.',
  },
];

// ============================================================
// 상점 아이템 (하드 모드 가격)
// ============================================================
const SHOP_ITEMS = [
  {
    id: 'warp_9',
    name: '+9강 도약권',
    desc: 'UY 방패자리(+9) 상태로 시작합니다.',
    price: 1000000,
    type: 'warp',
    targetLevel: 9,
  },
  {
    id: 'warp_13',
    name: '+13강 도약권',
    desc: '게 펄사(+13) 상태로 시작합니다.',
    price: 7000000,
    type: 'warp',
    targetLevel: 13,
  },
  {
    id: 'warp_14',
    name: '+14강 도약권',
    desc: 'SGR 1806-20(+14) 상태로 시작합니다.',
    price: 10000000,
    type: 'warp',
    targetLevel: 14,
  },
  {
    id: 'warp_15',
    name: '+15강 도약권',
    desc: '백조자리 X-1(+15) 상태로 시작합니다.',
    price: 15000000,
    type: 'warp',
    targetLevel: 15,
  },
  {
    id: 'protection_1',
    name: '붕괴 방지권 1개',
    desc: '강화 실패 시 단계 하락을 1회 방지합니다.',
    price: 1000000,
    type: 'protection',
    amount: 1,
  },
  {
    id: 'protection_3',
    name: '붕괴 방지권 3개',
    desc: '강화 실패 시 단계 하락을 3회 방지합니다.',
    price: 2500000,
    type: 'protection',
    amount: 3,
  },
];

// ============================================================
// 조합소 레시피 (하드 모드)
// ============================================================
const RECIPES = [
  {
    id: 'r1',
    inputs: [{ key: ITEM_KEYS.STELLAR_WIND, amount: 8 }],
    output: { type: 'protection', amount: 1 },
    desc: '항성풍 파편 8개 → 붕괴 방지권 1개',
  },
  {
    id: 'r2',
    inputs: [{ key: ITEM_KEYS.HYPERGIANT_CORE, amount: 5 }],
    output: { type: 'protection', amount: 1 },
    desc: '극초거성 핵 파편 5개 → 붕괴 방지권 1개',
  },
  {
    id: 'r3',
    inputs: [{ key: ITEM_KEYS.SUPERNOVA_GLOW, amount: 3 }],
    output: { type: 'star', level: 13 },
    desc: '초신성 잔광 3개 → 게 펄사(+13) 별 1개',
  },
  {
    id: 'r4',
    inputs: [{ key: ITEM_KEYS.NEUTRON_CRUST, amount: 5 }],
    output: { type: 'protection', amount: 2 },
    desc: '중성자별 껍질 조각 5개 → 붕괴 방지권 2개',
  },
  {
    id: 'r5',
    inputs: [{ key: ITEM_KEYS.PULSAR_SIGNAL, amount: 2 }],
    output: { type: 'star', level: 16 },
    desc: '펄사 전파 신호 2개 → HLX-1(+16) 별 1개',
  },
  {
    id: 'r6',
    inputs: [{ key: ITEM_KEYS.MAGNETAR_FLARE, amount: 4 }],
    output: { type: 'protection', amount: 4 },
    desc: '마그네타 섬광 4개 → 붕괴 방지권 4개',
  },
  {
    id: 'r7',
    inputs: [{ key: ITEM_KEYS.MAGNETAR_FLARE, amount: 6 }],
    output: { type: 'star', level: 19 },
    desc: '마그네타 섬광 6개 → TON 618(+19) 별 1개',
  },
  {
    id: 'r8',
    inputs: [{ key: ITEM_KEYS.HAWKING, amount: 6 }],
    output: { type: 'protection', amount: 10 },
    desc: '호킹 복사 6개 → 붕괴 방지권 10개',
  },
  {
    id: 'r9',
    inputs: [{ key: ITEM_KEYS.DARK_MATTER, amount: 4 }],
    output: { type: 'protection', amount: 11 },
    desc: '암흑 물질 조각 4개 → 붕괴 방지권 11개',
  },
];

// 절대 조합하면 안 되는 아이템 경고
const IMPORTANT_ITEM_WARNINGS = {
  [ITEM_KEYS.MAGNETAR_FLARE]: '⚠️ +23강 재료(12개) 필요 — 함부로 교환하지 마세요!',
  [ITEM_KEYS.HAWKING]:        '⚠️ +25강 재료(15개) 필요 — 함부로 교환하지 마세요!',
  [ITEM_KEYS.DARK_MATTER]:    '⚠️ +27강 재료(2개) 필요 — 함부로 교환하지 마세요!',
};

// 레이트리밋 (분당 최대 강화 횟수)
const RATE_LIMIT = { maxPerMinute: 50 };

// 신규 유저 시작 수소
const STARTING_HYDROGEN = 500;
