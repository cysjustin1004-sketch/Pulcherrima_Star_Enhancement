// ============================================================
// config.js — 별 강화하기 게임 설정
// 이 파일만 수정하면 게임 수치/이름/설명을 모두 바꿀 수 있습니다.
//
// 레벨 체계 (v3 — 공통 17단계 + 5트랙 분기 + 공통 우주 엔딩):
//   level 0~16  : 공통 구간 (성운 → 원시별 → 주계열 → 운명의 갈림길)
//   level 17~24 : 트랙 구간 — level 16→17 강화 성공 시 서버가 5개 트랙 중
//                 하나를 무작위 배정(user.track)하며, 이후 해당 트랙 고정.
//                 트랙: track1(적색왜성) / track2(태양형 별) /
//                       track3(대질량 별) / track4(초대질량 별) /
//                       track5(극초대질량 별)
//   level 25~29 : 트랙 종료 후 다시 합류하는 공통 구간(트랙 무관) —
//                 별 하나에서 은하 → 은하군 → 은하단 → 초은하단 → 우주로 시야가 확대된다.
//   level 29    : 최종 엔딩 (강화 불가)
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
// 공통 단계 (+0 ~ +16) — 모든 유저 동일
//
// cost 형식:
//   { type: 'hydrogen', amount: N }            수소 소모
//   { type: 'item', key: ITEM_KEY, amount: N }  아이템 소모
//   { type: 'star', level: N, amount: N }       같은 트랙에 보관된 별 소모
//   null                                         강화 불가
//
// protectionCost: 0=하락 없음, N>0=방지권 N개로 하락 방지, -1=방지 불가
// ============================================================
const COMMON_STAGES = [
  {
    level: 0,
    name: '거대 분자운',
    subname: '오리온 성운 · M42',
    type: '성간 가스 구름',
    cost: { type: 'hydrogen', amount: 500 },
    successRate: 1.00,
    sellPrice: null,
    protectionCost: 0,
    drop: null,
    codexDescription: '【크기: 가로 40광년】 지구에서 약 1,344광년 떨어진 오리온자리의 거대한 성운. 질량은 태양의 약 2,000배에 달하며 맨눈으로도 보인다. 내부에서는 지금도 수백 개의 어린 별들이 탄생하고 있는 활발한 별 생성 지역이다.',
  },
  {
    level: 1,
    name: '암흑 성운',
    subname: '말머리 성운 · IC 434',
    type: '암흑 분자운',
    cost: { type: 'hydrogen', amount: 500 },
    successRate: 0.98,
    sellPrice: 200,
    protectionCost: 0,
    drop: null,
    codexDescription: '【크기: 약 3.5광년】 오리온자리의 암흑 성운. 1,375광년 거리에 위치하며 질량은 태양의 수백 배 규모다. 뒤쪽의 빛나는 가스 구름이 역광 효과를 만들어 말 머리 실루엣이 선명하게 드러난다.',
  },
  {
    level: 2,
    name: '보크 구체',
    subname: 'Barnard 68',
    type: '암흑 성운핵',
    cost: { type: 'hydrogen', amount: 1000 },
    successRate: 0.95,
    sellPrice: 500,
    protectionCost: 0,
    drop: null,
    codexDescription: '【크기: 약 2광년 / 거리: 약 500광년】 뱀주인자리에 있는 작고 매우 짙은 보크 구체. 뒤쪽 별빛을 완전히 가릴 만큼 밀도가 높아 마치 하늘에 뚫린 검은 구멍처럼 보인다. 이 자체 중력으로 수축하는 가스 덩어리가 별의 씨앗이 된다.',
  },
  {
    level: 3,
    name: '중력 붕괴',
    subname: '러닝치킨 성운 구체 · IC 2944',
    type: '자체중력 수축',
    cost: { type: 'hydrogen', amount: 2000 },
    successRate: 0.93,
    sellPrice: 1000,
    protectionCost: 0,
    drop: null,
    codexDescription: '【거리: 약 6,500광년】 용골자리 러닝치킨 성운(IC 2944) 안의 새커레이 구체들. 밀도가 임계점을 넘으면 압력이 중력을 버티지 못하고 단 한 방향, 안쪽으로만 무너져 내리기 시작한다.',
  },
  {
    level: 4,
    name: '원시 항성핵',
    subname: 'L1527 원시별',
    type: '0등급 원시별',
    cost: { type: 'hydrogen', amount: 4000 },
    successRate: 0.90,
    sellPrice: 2000,
    protectionCost: 1,
    drop: null,
    codexDescription: '【거리: 약 460광년】 황소자리 분자운 속의 어린 원시별. 주변을 두르는 납작한 원반과 모래시계 모양으로 뚫린 유출 공동이 스피처·제임스웹 우주망원경 적외선 영상에 뚜렷하게 담겨 있다.',
  },
  {
    level: 5,
    name: '원시별',
    subname: 'HL 타우리',
    type: '원시별',
    cost: { type: 'hydrogen', amount: 7000 },
    successRate: 0.86,
    sellPrice: 6000,
    protectionCost: 1,
    drop: null,
    codexDescription: '【질량: 태양의 약 1배 / 원반 직경: 약 260 AU】 황소자리의 약 100만 년 된 원시별. 거리는 약 450광년. 2014년 ALMA가 촬영한 행성 형성 원반의 동심원 고리 구조는 태양계보다 이른 시기에 행성이 형성됨을 시사해 학계를 놀라게 했다.',
  },
  {
    level: 6,
    name: '원시행성 원반',
    subname: 'HD 163296',
    type: '원시행성계 원반',
    cost: { type: 'hydrogen', amount: 10000 },
    successRate: 0.81,
    sellPrice: 15000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【거리: 약 330광년 / 나이: 약 500만 년】 궁수자리 방향의 젊은 별을 두른 원시행성계 원반. ALMA가 촬영한 여러 겹의 동심원 틈은 형성 중인 원시행성들이 궤도를 따라 물질을 쓸어 담고 있다는 유력한 증거로 꼽힌다.',
  },
  {
    level: 7,
    name: '허빅-하로 천체',
    subname: '양극 제트',
    type: '별 생성 유출류',
    cost: { type: 'hydrogen', amount: 15000 },
    successRate: 0.75,
    sellPrice: 25000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【발견: 1940~50년대, 허빅과 하로】 원시별에서 뿜어져 나온 물질이 초속 수백 km로 주변 가스와 충돌하며 빛나는 충격파 구조. 원시별 양극에서 대칭적인 제트 형태로 뻗어나가는 모습이 특징이다.',
  },
  {
    level: 8,
    name: '전주계열성',
    subname: 'FS 타우리',
    type: 'T타우리형 별',
    cost: { type: 'hydrogen', amount: 22000 },
    successRate: 0.70,
    sellPrice: 50000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【거리: 약 450광년】 황소자리 별 생성 지역의 젊은 T타우리형 별. 아직 중심에서 안정적인 수소 핵융합이 시작되지 않은 채, 중력 수축으로 발생하는 열로만 빛을 낸다.',
  },
  {
    level: 9,
    name: 'FU 오리온 폭발',
    subname: '강착 폭발',
    type: '강착 폭발 현상',
    cost: { type: 'hydrogen', amount: 30000 },
    successRate: 0.66,
    sellPrice: 90000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【밝기 변화: 수개월 만에 약 100배 폭증】 주변 원반에서 쏟아지는 물질 강착률이 갑자기 치솟으며 별이 폭발적으로 밝아지는 현상. FU 오리온형 폭발은 이후 수십 년에 걸쳐 서서히 가라앉는다.',
  },
  {
    level: 10,
    name: '영년 주계열',
    subname: '플레이아데스 성단 · M45',
    type: '영년 주계열성',
    cost: { type: 'hydrogen', amount: 30000 },
    successRate: 0.62,
    sellPrice: 180000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【나이: 약 1억 년 / 거리: 약 444광년】 안정적인 수소 핵융합을 막 시작한 갓 태어난 주계열성 단계. 플레이아데스 성단은 이런 젊은 별들이 모여 있는 대표적인 산개성단이다.',
  },
  {
    level: 11,
    name: '주계열성',
    subname: '태양',
    type: '주계열성',
    cost: { type: 'hydrogen', amount: 51000 },
    successRate: 0.61,
    sellPrice: 500000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【나이: 약 46억 년 / 예상 수명: 약 100억 년】 중심핵에서 수소를 헬륨으로 융합하며 안정적으로 빛나는 별의 전형적인 단계. 태양은 현재 이 주계열 수명의 절반 정도를 지나고 있다.',
  },
  {
    level: 12,
    name: '주계열 성숙기',
    subname: '흑점 · 플레어',
    type: '자기 활동기',
    cost: { type: 'hydrogen', amount: 70000 },
    successRate: 0.54,
    sellPrice: 1000000,
    protectionCost: 1,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【태양 흑점 주기: 약 11년】 내부 구조가 서서히 변하며 자기 활동이 두드러지는 시기. 흑점, 플레어, 코로나 물질 방출이 점점 더 격렬해진다.',
  },
  {
    level: 13,
    name: '중심 수소 고갈',
    subname: '맥동 거성 · ξ Hya',
    type: '핵연료 고갈기',
    cost: { type: 'hydrogen', amount: 80000 },
    successRate: 0.50,
    sellPrice: 2000000,
    protectionCost: 2,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【거리: 약 130광년】 중심핵의 수소가 바닥나면서 융합이 핵 주변 껍질로 옮겨가고 별이 부풀기 시작하는 단계. ξ Hya 같은 맥동 거성은 이 시기의 밝기 변화를 통해 항성지진학 연구에 활용된다.',
  },
  {
    level: 14,
    name: '준거성',
    subname: '프로키온 급',
    type: '준거성',
    cost: { type: 'hydrogen', amount: 100000 },
    successRate: 0.49,
    sellPrice: 5000000,
    protectionCost: 3,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【거리: 약 11.5광년】 핵은 수축하고 겉껍질은 팽창하며 서서히 식어가는 과도기적 단계. 프로키온은 태양계에서 가장 가까운 준거성 중 하나로 꼽힌다.',
  },
  {
    level: 15,
    name: '적색거성가지 진입',
    subname: '알데바란 급',
    type: '적색거성가지 진입',
    cost: { type: 'hydrogen', amount: 130000 },
    successRate: 0.46,
    sellPrice: 10000000,
    protectionCost: 4,
    drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
    codexDescription: '【거리: 약 65광년 / 반지름: 태양의 약 44배】 별이 본격적으로 부풀어 오르며 표면 온도가 낮아져 붉은빛을 띠기 시작하는 단계. 알데바란은 이 적색거성가지의 대표적인 예다.',
  },
  {
    level: 16,
    name: '운명의 갈림길',
    subname: 'H-R도 분기점',
    type: '진화 분기점',
    cost: { type: 'hydrogen', amount: 170000 },
    successRate: 0.44,
    sellPrice: 20000000,
    protectionCost: 7,
    drop: { key: ITEM_KEYS.DARK_MATTER, min: 1, max: 2 },
    codexDescription: '【H-R도(헤르츠스프룽-러셀도) 상의 분기점】 여기서부터 별의 최초 질량이 그 운명을 가른다 — 조용히 식어가는 왜성이 될지, 초신성으로 폭발해 중성자별이나 블랙홀을 남길지. 다음 강화에서 하나의 트랙이 무작위로 정해진다.',
  },
];

// ============================================================
// 트랙 메타 정보
// ============================================================
const TRACK_INFO = {
  track1: { name: '적색왜성 트랙', subname: '저질량 별' },
  track2: { name: '태양형 별 트랙', subname: '태양급 질량' },
  track3: { name: '대질량 별 트랙', subname: '초신성 · 중성자별' },
  track4: { name: '초대질량 별 트랙', subname: '볼프-레이에 · 블랙홀' },
  track5: { name: '극초대질량 별 트랙', subname: '퀘이사 · 초대질량 블랙홀' },
};

// ============================================================
// 트랙별 단계 (+17 ~ +24) — level 16→17 강화 성공 시 무작위 배정
// 5개 트랙 모두 동일한 난이도 곡선을 공유해 트랙 간 공정성을 맞춘다.
// cost.level (type:'star')은 "같은 트랙"의 해당 레벨을 가리킨다.
// ============================================================
const TRACKS = {
  track1: [
    { level: 17, name: '적색왜성', subname: '프록시마 센타우리', type: 'M형 적색왜성',
      cost: { type: 'hydrogen', amount: 220000 }, successRate: 0.40, sellPrice: 44500000, protectionCost: 9,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【거리: 4.24광년 / 질량: 태양의 약 12%】 태양계에서 가장 가까운 항성. 표면온도 약 3,000K의 M형 적색왜성으로, 연료를 극도로 아껴 쓰기 시작하는 첫 단계다.' },
    { level: 18, name: '플레어별', subname: 'TRAPPIST-1 급', type: '활동성 적색왜성',
      cost: { type: 'hydrogen', amount: 300000 }, successRate: 0.38, sellPrice: 72000000, protectionCost: 10,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【거리(TRAPPIST-1): 약 40광년】 강력한 항성 플레어를 자주 일으키는 활동성 적색왜성. TRAPPIST-1은 지구형 행성 7개를 거느린 것으로 유명하다.' },
    { level: 19, name: '초장수명 주계열', subname: '붉은 왜성', type: '초장수명 주계열성',
      cost: { type: 'hydrogen', amount: 400000 }, successRate: 0.35, sellPrice: 120000000, protectionCost: 12,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【예상 수명: 수조 년】 연료를 극도로 천천히 소모해 우주 나이(138억 년)로는 단 하나도 아직 주계열을 벗어나지 못했다는 이론적 사실이 성립하는 단계다.' },
    { level: 20, name: '청색왜성化', subname: '수축·청색화', type: '이론적 진화 단계',
      cost: { type: 'hydrogen', amount: 650000 }, successRate: 0.33, sellPrice: 240000000, protectionCost: 15,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【순수 이론 단계】 먼 미래 연료가 바닥나기 시작하면, 적색왜성은 부풀지 않고 오히려 수축하며 표면온도가 올라가 푸르게 변할 것이라는 가설상의 과정이다.' },
    { level: 21, name: '청색왜성', subname: '이론상 말기', type: '이론적 천체',
      cost: { type: 'star', level: 20, amount: 1 }, successRate: 0.30, sellPrice: 300000000, protectionCost: 17,
      drop: null,
      codexDescription: '【관측된 적 없음】 우주 나이가 충분히 길어지면 적색왜성이 최종적으로 도달할 것으로 예측되는, 작고 뜨거운 가상의 상태다.' },
    { level: 22, name: '헬륨 백색왜성', subname: '시리우스 B 급', type: '백색왜성',
      cost: { type: 'item', key: ITEM_KEYS.STELLAR_WIND, amount: 10 }, successRate: 0.27, sellPrice: 400000000, protectionCost: 20,
      drop: null,
      codexDescription: '【시리우스 B 반지름: 지구와 비슷】 청색왜성 단계 이후 남은 헬륨 핵이 식어가며 만들어지는 백색왜성. 시리우스 B는 실제로는 더 무거운 별의 잔해지만 백색왜성의 대표 예시로 널리 쓰인다.' },
    { level: 23, name: '백색왜성 냉각', subname: '식어가는 잔해', type: '냉각 백색왜성',
      cost: { type: 'star', level: 22, amount: 1 }, successRate: 0.24, sellPrice: 550000000, protectionCost: 22,
      drop: null,
      codexDescription: '【냉각 기간: 수십억~수조 년】 더 이상 핵융합을 하지 않는 백색왜성이 아주 서서히 식어가는 과정. 표면온도가 낮아질수록 빛깔도 희미해진다.' },
    { level: 24, name: '흑색왜성', subname: '완전 소등 · 이론상', type: '이론적 최종 잔해',
      cost: { type: 'star', level: 24, amount: 1 }, successRate: 0.40, sellPrice: 750000000, protectionCost: 23,
      drop: null,
      codexDescription: '【우주에 아직 하나도 존재하지 않음】 백색왜성이 완전히 식어 빛을 잃은 상태. 우주가 아직 그만큼 늙지 않아 실제로는 이론상으로만 존재하는, 저질량 별 진화의 최종 종착지다. 또 하나의 흑색왜성을 만들어내면 그 중력이 시야를 은하 전체로 넓혀준다.' },
  ],
  track2: [
    { level: 17, name: '적색거성', subname: '알데바란', type: '적색거성',
      cost: { type: 'hydrogen', amount: 220000 }, successRate: 0.40, sellPrice: 44500000, protectionCost: 9,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【거리: 약 65광년 / 반지름: 태양의 약 44배】 중심 수소를 다 태운 태양형 별이 크게 부풀어 오르는 단계. 알데바란은 황소자리의 대표적인 적색거성이다.' },
    { level: 18, name: '헬륨 섬광', subname: '적색거성 핵', type: '헬륨 점화',
      cost: { type: 'hydrogen', amount: 300000 }, successRate: 0.38, sellPrice: 72000000, protectionCost: 10,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【점화 시간: 단 몇 초】 축퇴된 헬륨 핵이 임계온도에 도달하면 폭발적으로 헬륨 핵융합이 시작되는 현상. 겉으로는 별의 밝기가 거의 변하지 않는다.' },
    { level: 19, name: '수평가지', subname: '구상성단 별들', type: '헬륨 안정 연소기',
      cost: { type: 'hydrogen', amount: 400000 }, successRate: 0.35, sellPrice: 120000000, protectionCost: 12,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【H-R도 상 특징】 헬륨 섬광 이후 별이 안정적으로 헬륨을 태우는 단계. 구상성단의 H-R도에서 수평으로 늘어선 별들의 띠로 뚜렷하게 관측된다.' },
    { level: 20, name: '점근거성가지', subname: '맥동 AGB별 · R Scl', type: 'AGB 별',
      cost: { type: 'hydrogen', amount: 650000 }, successRate: 0.33, sellPrice: 240000000, protectionCost: 15,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【R 조각가자리 껍질 구조】 헬륨마저 고갈되면 다시 팽창하며 맥동하는 거대한 별이 된다. R 조각가자리는 강한 물질 방출로 만들어진 동심원 껍질 구조가 관측된 AGB별이다.' },
    { level: 21, name: '후-AGB 초바람', subname: '알 성운 · Egg', type: '초바람 방출기',
      cost: { type: 'star', level: 20, amount: 1 }, successRate: 0.30, sellPrice: 300000000, protectionCost: 17,
      drop: null,
      codexDescription: '【방출 속도: 초속 수백 km】 AGB 단계 말기, 강력한 항성풍으로 외곽 물질을 대량으로 방출한다. Egg 성운은 이 과정에서 만들어지는 대칭적인 먼지 껍질을 잘 보여준다.' },
    { level: 22, name: '행성상성운', subname: '나선성운 · Helix', type: '행성상성운',
      cost: { type: 'item', key: ITEM_KEYS.STELLAR_WIND, amount: 10 }, successRate: 0.27, sellPrice: 400000000, protectionCost: 20,
      drop: null,
      codexDescription: '【거리: 약 650광년】 방출된 가스 껍질이 뜨거운 잔해핵의 자외선에 빛나며 만드는 성운. 나선성운(Helix Nebula)은 가장 가까운 행성상성운 중 하나로 꼽힌다.' },
    { level: 23, name: '백색왜성', subname: 'NGC 2440 중심별', type: '고온 백색왜성',
      cost: { type: 'star', level: 22, amount: 1 }, successRate: 0.24, sellPrice: 550000000, protectionCost: 22,
      drop: null,
      codexDescription: '【표면온도: 약 20만K】 행성상성운 중심에 남는 뜨겁고 조밀한 잔해. NGC 2440의 중심별은 알려진 백색왜성 중 가장 뜨거운 축에 속한다.' },
    { level: 24, name: '흑색왜성', subname: '완전 소등 · 이론상', type: '이론적 최종 잔해',
      cost: { type: 'star', level: 24, amount: 1 }, successRate: 0.40, sellPrice: 750000000, protectionCost: 23,
      drop: null,
      codexDescription: '【우주에 아직 하나도 존재하지 않음】 태양형 별의 백색왜성 잔해 역시 극한의 시간 뒤에는 빛을 잃은 흑색왜성이 될 것으로 예측되는 진화의 최종 종착지다. 또 하나의 흑색왜성을 만들어내면 그 중력이 시야를 은하 전체로 넓혀준다.' },
  ],
  track3: [
    { level: 17, name: '청색초거성', subname: '리겔', type: '청색초거성',
      cost: { type: 'hydrogen', amount: 220000 }, successRate: 0.40, sellPrice: 44500000, protectionCost: 9,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【질량: 태양의 약 21배 / 반지름: 태양의 약 78배】 오리온자리의 청색초거성. 863광년 거리에서 태양보다 120,000배 밝게 빛난다. 수명이 수백만 년에 불과하며 언젠가 초신성으로 폭발해 중성자별이나 블랙홀이 될 것이다.' },
    { level: 18, name: '적색초거성', subname: '베텔게우스', type: '적색초거성',
      cost: { type: 'hydrogen', amount: 300000 }, successRate: 0.38, sellPrice: 72000000, protectionCost: 10,
      drop: { key: ITEM_KEYS.SUPERNOVA_GLOW, min: 1, max: 2 },
      codexDescription: '【질량: 태양의 약 16~19배 / 반지름: 태양의 약 700배】 오리온자리의 적색초거성. 이 별이 태양 자리에 있다면 목성 궤도까지 뒤덮는다. 700광년 거리에 있으며 수만 년 안에 초신성 폭발이 예상된다.' },
    { level: 19, name: '규소 연소', subname: '양파껍질 구조', type: '핵연소 최종기',
      cost: { type: 'hydrogen', amount: 400000 }, successRate: 0.35, sellPrice: 120000000, protectionCost: 12,
      drop: { key: ITEM_KEYS.NEUTRON_CRUST, min: 1, max: 2 },
      codexDescription: '【진행 기간: 폭발 직전 단 며칠】 중심핵에서 규소가 철로 융합되며 별 내부가 양파처럼 겹겹의 원소 층을 이루는 붕괴 직전 최종 단계다.' },
    { level: 20, name: '철핵 붕괴', subname: '1초의 붕괴', type: '중력붕괴',
      cost: { type: 'hydrogen', amount: 650000 }, successRate: 0.33, sellPrice: 240000000, protectionCost: 15,
      drop: { key: ITEM_KEYS.PULSAR_SIGNAL, min: 1, max: 2 },
      codexDescription: '【붕괴 소요시간: 약 1초】 철은 더 이상 에너지를 낼 수 없어 핵융합이 멈추고, 중심핵이 단 1초 만에 중력붕괴하며 초신성 폭발의 방아쇠를 당긴다.' },
    { level: 21, name: 'II형 초신성', subname: 'SN 1987A', type: 'II형 초신성',
      cost: { type: 'star', level: 20, amount: 1 }, successRate: 0.30, sellPrice: 300000000, protectionCost: 17,
      drop: null,
      codexDescription: '【폭발 전 질량: 태양의 약 20배 / 폭발 에너지: 약 10⁴⁴ J】 168,000광년 거리의 대마젤란 은하에서 1987년 관측된 초신성. 뉴트리노 폭풍이 지구에서 검출되어 초신성 이론을 최초로 실험적으로 검증했다.' },
    { level: 22, name: '초신성 잔해', subname: '게 성운 · M1', type: '초신성 잔해',
      cost: { type: 'item', key: ITEM_KEYS.NEUTRON_CRUST, amount: 6 }, successRate: 0.27, sellPrice: 400000000, protectionCost: 20,
      drop: null,
      codexDescription: '【크기: 직경 약 11광년】 1054년 초신성 폭발의 잔해. 6,523광년 거리. 중심에는 게 펄사가 있으며 X선부터 전파까지 폭넓게 방출한다.' },
    { level: 23, name: '중성자별', subname: 'PSR B1919+21', type: '중성자별',
      cost: { type: 'star', level: 22, amount: 1 }, successRate: 0.24, sellPrice: 550000000, protectionCost: 22,
      drop: null,
      codexDescription: '【직경: 약 20km / 질량: 태양의 약 1.4배】 1967년 조슬린 벨이 발견한 인류 최초의 펄사. 중성자별이 회전하며 방출하는 전파 빔임이 밝혀졌다.' },
    { level: 24, name: '펄사', subname: '게 펄사 · PSR B0531+21', type: '펄사',
      cost: { type: 'star', level: 24, amount: 1 }, successRate: 0.40, sellPrice: 750000000, protectionCost: 23,
      drop: null,
      codexDescription: '【직경: 약 28km / 회전주기: 초당 30회】 게 성운 중심의 중성자별. 표면 중력이 지구의 2천억 배에 달하는, 대질량 별 진화의 최종 종착지다. 또 하나의 펄사를 만들어내면 그 중력이 시야를 은하 전체로 넓혀준다.' },
  ],
  track4: [
    { level: 17, name: 'O형 초거성', subname: '제타 퍼페이', type: 'O형 초거성',
      cost: { type: 'hydrogen', amount: 220000 }, successRate: 0.40, sellPrice: 44500000, protectionCost: 9,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【질량: 태양의 약 20배 / 반지름: 태양의 약 14배】 돛자리의 O형 초고온 청색 별. 표면 온도 약 42,000K로 태양보다 250,000배 밝다. 강렬한 항성풍으로 초당 수백만 톤의 물질을 날려보낸다.' },
    { level: 18, name: '밝은청색변광성', subname: '에타 카리나', type: '광도변광성 (LBV)',
      cost: { type: 'hydrogen', amount: 300000 }, successRate: 0.38, sellPrice: 72000000, protectionCost: 10,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【질량: 태양의 약 100~150배 / 반지름: 태양의 약 240배】 7,500광년 거리의 불안정한 극거성. 1840년대 대폭발로 태양의 수백만 배 에너지를 방출했다.' },
    { level: 19, name: 'LBV 대폭발', subname: '호문쿨루스 성운', type: 'LBV 대분출',
      cost: { type: 'hydrogen', amount: 400000 }, successRate: 0.35, sellPrice: 120000000, protectionCost: 12,
      drop: { key: ITEM_KEYS.MAGNETAR_FLARE, min: 1, max: 2 },
      codexDescription: '【방출 질량: 태양의 약 10~20배】 에타 카리나의 1840년대 대분출로 만들어진 쌍극성 성운 호문쿨루스. 짧은 기간에 엄청난 양의 물질이 우주로 흩뿌려졌다.' },
    { level: 20, name: '볼프-레이에 별', subname: 'WR 104', type: '볼프-레이에 별',
      cost: { type: 'hydrogen', amount: 650000 }, successRate: 0.33, sellPrice: 240000000, protectionCost: 15,
      drop: { key: ITEM_KEYS.HYPERGIANT_CORE, min: 1, max: 2 },
      codexDescription: '【거리: 약 8,000광년】 독수리자리의 쌍성계. 두 별이 220일 주기로 공전하며 풍차 모양의 나선 성운을 만든다. 감마선 폭발 후보로 주목받는다.' },
    { level: 21, name: '극초신성 / GRB', subname: '감마선 폭발체', type: '극초신성',
      cost: { type: 'star', level: 20, amount: 1 }, successRate: 0.30, sellPrice: 300000000, protectionCost: 17,
      drop: null,
      codexDescription: '【제트 속도: 광속에 근접】 초대질량 별의 핵붕괴가 상대론적 제트를 만들어내며 극도로 강력한 감마선 폭발(GRB)을 일으키는 극단적인 초신성이다.' },
    { level: 22, name: '블랙홀 형성', subname: '강착원반 · 제트', type: '블랙홀 탄생',
      cost: { type: 'item', key: ITEM_KEYS.HYPERGIANT_CORE, amount: 6 }, successRate: 0.27, sellPrice: 400000000, protectionCost: 20,
      drop: null,
      codexDescription: '【사건지평선 형성】 붕괴하는 핵이 사건지평선을 만들고, 남은 물질이 강착원반을 이루며 제트를 뿜어내는 블랙홀 탄생의 순간이다.' },
    { level: 23, name: '항성질량 블랙홀', subname: '백조자리 X-1', type: '항성질량 블랙홀',
      cost: { type: 'star', level: 22, amount: 1 }, successRate: 0.24, sellPrice: 550000000, protectionCost: 22,
      drop: null,
      codexDescription: '【질량: 태양의 약 21배】 인류 최초로 확인된 블랙홀 후보. 약 6,100광년 거리에서 동반성의 물질을 빨아들이며 강렬한 X선을 방출한다. 스티븐 호킹이 킵 손과 이 천체를 놓고 내기를 했으며, 호킹이 졌다.' },
    { level: 24, name: 'X선 쌍성 블랙홀', subname: 'MAXI J1348-630', type: 'X선 쌍성 블랙홀',
      cost: { type: 'star', level: 24, amount: 1 }, successRate: 0.40, sellPrice: 750000000, protectionCost: 23,
      drop: null,
      codexDescription: '【발견: 2019년】 동반성의 물질을 빨아들이며 강력한 제트와 X선을 방출하는 활동적인 블랙홀 쌍성계. 초대질량 별 진화의 최종 종착지다. 또 하나의 블랙홀을 만들어내면 그 중력이 시야를 은하 전체로 넓혀준다.' },
  ],
  track5: [
    { level: 17, name: '극초거성', subname: 'UY 방패자리', type: '극초거성',
      cost: { type: 'hydrogen', amount: 220000 }, successRate: 0.40, sellPrice: 44500000, protectionCost: 9,
      drop: { key: ITEM_KEYS.STELLAR_WIND, min: 1, max: 3 },
      codexDescription: '【질량: 태양의 약 7~10배 / 반지름: 태양의 약 1,700배】 현재까지 알려진 가장 큰 별 중 하나. 9,500광년 거리에 위치하며 부피로는 태양의 50억 배에 달한다.' },
    { level: 18, name: '극대광도 별', subname: '피스톨 별', type: '극대광도 별',
      cost: { type: 'hydrogen', amount: 300000 }, successRate: 0.38, sellPrice: 72000000, protectionCost: 10,
      drop: { key: ITEM_KEYS.HYPERGIANT_CORE, min: 1, max: 2 },
      codexDescription: '【광도: 태양의 약 340만 배】 은하 중심 근처의 극도로 밝은 별. 강력한 항성풍으로 스스로를 감싸는 피스톨 성운을 만들어냈다.' },
    { level: 19, name: '種族 III 거대별', subname: 'Population III', type: '1세대 원시별',
      cost: { type: 'hydrogen', amount: 400000 }, successRate: 0.35, sellPrice: 120000000, protectionCost: 12,
      drop: { key: ITEM_KEYS.DARK_MATTER, min: 1, max: 2 },
      codexDescription: '【추정 질량: 태양의 수백 배】 빅뱅 직후 중원소가 없는 원시가스로만 만들어진 우주 최초 세대의 별. 아직 직접 관측된 적은 없는 이론적 존재다.' },
    { level: 20, name: '쌍불안정', subname: '전자쌍 생성', type: '쌍불안정 현상',
      cost: { type: 'hydrogen', amount: 650000 }, successRate: 0.33, sellPrice: 240000000, protectionCost: 15,
      drop: { key: ITEM_KEYS.HAWKING, min: 1, max: 2 },
      codexDescription: '【임계 온도: 약 10억K 이상】 중심 온도가 너무 높아 감마선이 전자-양전자 쌍으로 변환되며 복사압이 급격히 줄어 별이 불안정해지는 현상이다.' },
    { level: 21, name: '쌍불안정 초신성', subname: '완전 소멸 폭발', type: '쌍불안정 초신성',
      cost: { type: 'star', level: 20, amount: 1 }, successRate: 0.30, sellPrice: 300000000, protectionCost: 17,
      drop: null,
      codexDescription: '【잔해: 없음】 쌍불안정으로 촉발된 폭발이 별 전체를 남김없이 흩어버려, 블랙홀조차 남기지 않는 극히 드문 유형의 초신성이다.' },
    { level: 22, name: '초대질량 블랙홀 씨앗', subname: '중간질량 블랙홀', type: '중간질량 블랙홀',
      cost: { type: 'item', key: ITEM_KEYS.HAWKING, amount: 6 }, successRate: 0.27, sellPrice: 400000000, protectionCost: 20,
      drop: null,
      codexDescription: '【질량: 태양의 약 20,000배】 초기 우주에서 극초대질량 별의 붕괴로 만들어졌을 것으로 추정되는 중간질량 블랙홀. 이후 은하 중심 초대질량 블랙홀로 성장하는 씨앗 후보다.' },
    { level: 23, name: '퀘이사', subname: '3C 273', type: '퀘이사',
      cost: { type: 'star', level: 22, amount: 1 }, successRate: 0.24, sellPrice: 550000000, protectionCost: 22,
      drop: null,
      codexDescription: '【중심 블랙홀 질량: 태양의 약 9억 배 / 광도: 태양의 약 4조 배】 24억 광년 거리의 가장 밝은 퀘이사 중 하나. 1963년 최초로 확인되었으며 맨눈 한계에 가까울 정도로 밝다.' },
    { level: 24, name: '초대질량 블랙홀', subname: '궁수자리 A*', type: '초대질량 블랙홀',
      cost: { type: 'star', level: 24, amount: 1 }, successRate: 0.40, sellPrice: 750000000, protectionCost: 23,
      drop: null,
      codexDescription: '【질량: 태양의 약 400만 배】 우리 은하 중심의 초대질량 블랙홀. 2022년 사건지평선망원경(EHT)이 두 번째 블랙홀 사진으로 공개했다. 극초대질량 별 진화의 최종 종착지다. 또 하나의 초대질량 블랙홀을 만들어내면 그 중력이 시야를 은하 전체로 넓혀준다.' },
  ],
};

// ============================================================
// 트랙 종료 후 공통 구간 (+25 ~ +29) — 5개 트랙이 다시 합류.
// 별 하나의 운명에서 시야가 은하 → 은하군 → 은하단 → 초은하단 → 우주로 확대된다.
// track과 무관하게 동일하며, stageKey에서도 트랙 접두어 없이 숫자 키를 쓴다.
// ============================================================
const POST_TRACK_STAGES = [
  { level: 25, name: '우리 은하', subname: '은하수 · Milky Way', type: '막대나선은하',
    cost: { type: 'item', key: ITEM_KEYS.STELLAR_WIND, amount: 15 }, successRate: 0.35, sellPrice: 1000000000, protectionCost: 23,
    drop: null,
    codexDescription: '【지름: 약 10만 광년 / 별의 수: 약 1,000억~4,000억 개】 태양계가 속한 막대나선은하. 당신의 별은 이제 은하 원반을 도는 수천억 개의 별들 중 하나로 자리잡는다.' },
  { level: 26, name: '국부 은하군', subname: 'Local Group', type: '은하군',
    cost: { type: 'hydrogen', amount: 5000000 }, successRate: 0.50, sellPrice: 4500000000, protectionCost: -1,
    drop: null,
    codexDescription: '【지름: 약 1,000만 광년 / 은하 수: 80개 이상】 우리은하와 안드로메다은하를 중심으로 묶인 은하 무리. 두 거대 은하는 약 45억 년 후 충돌해 하나로 합쳐질 것으로 예측된다.' },
  { level: 27, name: '처녀자리 은하단', subname: 'Virgo Cluster', type: '은하단',
    cost: { type: 'item', key: ITEM_KEYS.DARK_MATTER, amount: 2 }, successRate: 0.40, sellPrice: 6000000000, protectionCost: -1,
    drop: null,
    codexDescription: '【거리: 약 5,400만 광년 / 은하 수: 약 1,300~2,000개】 국부 은하군이 속한 라니아케아 초은하단의 중력 중심 역할을 하는 거대 은하단. 처녀자리 방향에 위치한다.' },
  { level: 28, name: '라니아케아 초은하단', subname: 'Laniakea', type: '초은하단',
    cost: { type: 'hydrogen', amount: 0 }, successRate: 0.15, sellPrice: null, protectionCost: -1,
    drop: null,
    codexDescription: '【지름: 약 5억 2천만 광년 / 은하 수: 약 10만 개】 2014년 처음 경계가 규정된 초은하단. "measureless heaven"을 뜻하는 하와이어에서 이름을 땄으며, 우리은하를 포함한 모든 이웃 은하가 이 중력 유역 안에 속한다.' },
  { level: 29, name: '우주', subname: '관측가능한 우주', type: '궁극의 종착점',
    cost: null, successRate: null, sellPrice: null, protectionCost: null, drop: null,
    codexDescription: '【지름: 약 930억 광년 (관측가능)】 인류가 관측할 수 있는 모든 것의 총합. 하나의 별에서 시작해 은하, 은하군, 은하단, 초은하단을 거쳐 마침내 우주 그 자체에 도달했다 — 별 강화하기의 궁극적 엔딩.' },
];

/** 레벨(+track)에 해당하는 단계 데이터 반환 — 공통(0~16, 25~29)은 track 불필요 */
function resolveStage(level, track) {
  if (level == null) return null;
  if (level <= 16) return COMMON_STAGES[level];
  if (level <= 24) {
    const t = TRACKS[track];
    return t ? t[level - 17] : null;
  }
  return POST_TRACK_STAGES[level - 25] || null;
}

/** storedStars/unlockedCodex에 쓰는 문자열 키 — 공통(0~16, 25~29)은 "7", 트랙 구간(17~24)은 "track3_20" */
function stageKey(level, track) {
  return (level <= 16 || level >= 25) ? String(level) : `${track}_${level}`;
}

/** stageKey의 역변환 — "track3_20" → {level:20, track:'track3'}, "7" → {level:7, track:null} */
function parseStageKey(key) {
  const m = /^(track\d)_(\d+)$/.exec(key);
  return m ? { level: parseInt(m[2], 10), track: m[1] } : { level: parseInt(key, 10), track: null };
}

// ============================================================
// 상점 아이템 (하드 모드 가격) — 도약권은 전부 공통 구간(0~16) 내
// ============================================================
const SHOP_ITEMS = [
  {
    id: 'warp_9',
    name: '+9강 도약권',
    desc: 'FU 오리온 폭발(+9) 상태로 시작합니다.',
    price: 1000000,
    type: 'warp',
    targetLevel: 9,
  },
  {
    id: 'warp_13',
    name: '+13강 도약권',
    desc: '중심 수소 고갈(+13) 상태로 시작합니다.',
    price: 7000000,
    type: 'warp',
    targetLevel: 13,
  },
  {
    id: 'warp_14',
    name: '+14강 도약권',
    desc: '준거성(+14) 상태로 시작합니다.',
    price: 10000000,
    type: 'warp',
    targetLevel: 14,
  },
  {
    id: 'warp_15',
    name: '+15강 도약권',
    desc: '적색거성가지 진입(+15) 상태로 시작합니다.',
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
//
// output.type === 'star'에서 trackRelative가 있으면 "제작자 본인 트랙의
// N번째 트랙 단계"(level = 17+N)를 뜻한다 — 트랙은 무작위 배정이라
// 특정 트랙을 직접 지정할 수 없기 때문.
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
    output: { type: 'star', trackRelative: 1 },
    desc: '초신성 잔광 3개 → 내 트랙 2번째 단계 별 1개',
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
    output: { type: 'star', trackRelative: 3 },
    desc: '펄사 전파 신호 2개 → 내 트랙 4번째 단계 별 1개',
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
    output: { type: 'star', trackRelative: 5 },
    desc: '마그네타 섬광 6개 → 내 트랙 6번째 단계 별 1개',
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

// 절대 조합하면 안 되는 아이템 경고 (레시피 r7/r8/r9 재료)
const IMPORTANT_ITEM_WARNINGS = {
  [ITEM_KEYS.MAGNETAR_FLARE]: '[경고] 조합 재료(6개) — 함부로 교환하지 마세요!',
  [ITEM_KEYS.HAWKING]:        '[경고] 조합 재료(6개) — 함부로 교환하지 마세요!',
  [ITEM_KEYS.DARK_MATTER]:    '[경고] 조합 재료(4개) — 함부로 교환하지 마세요!',
};

// 레이트리밋 (분당 최대 강화 횟수)
const RATE_LIMIT = { maxPerMinute: 50 };

// 신규 유저 시작 수소
const STARTING_HYDROGEN = 2000000;
