# Pan-Tilt SQM 설계 문서

**날짜:** 2026-06-09 (2026-06-10 TSL2591 전환 반영)  
**상태:** 승인됨 (TSL2591 전환)

---

## 개요

ESP32 + TSL2591 광센서 + Pan-Tilt HAT(FIT0731, Pan축 MG90S + Tilt축 SG90)를 사용해
하늘 여러 방향의 하늘 밝기(SQM, mag/arcsec²)를 자동으로 격자 스캔 측정하는 장치.
측정 결과는 USB 시리얼로 PC에 출력한다.

---

## 확정 부품

| 부품 | 모델 | 비고 |
|------|------|------|
| 메인 컨트롤러 | ESP32 DevKitC WROOM-32D V4 (USB-C) | CH9102X USB 칩 |
| 광센서 | TSL2591 (Qwiic) | I2C 디지털 광센서 |
| 팬-틸트 키트 | Pan-Tilt HAT FIT0731 | Pan축 MG90S(금속기어) + Tilt축 SG90(플라스틱기어) 포함 |
| 브레드보드 | MB-102 830핀 | 프로토타이핑 |
| 점퍼선 | M/F 40P 20cm | 배선 |

> **변경 이력:** 원래 TSL237S-LF(광-주파수 변환)를 사용할 계획이었으나
> 부품 문제로 TSL2591(I2C)로 전환. 15° LED용 집광렌즈는 TSL2591(평판형)에
> 장착 불가하여 일단 렌즈 없이 진행 (추후 차광 튜브로 시야각 제한 검토).

---

## 하드웨어 설계

### PCA9685 우회 방식

FIT0731 HAT에는 PCA9685 I2C 서보 드라이버가 내장되어 있으나,
초기 동작 확인 단계에서는 이를 우회하고 **서보 신호선을 ESP32 GPIO에 직결**한다.
HAT은 기계적 팬-틸트 구조물로만 사용한다.

> Pan-Tilt HAT 커넥터는 6핀(GND/5V/S1/GND/5V/S0) 구조이며,
> S0/S1이 각각 Pan/Tilt 서보 신호선에 해당한다.

### 배선표

```
ESP32 DevKitC (USB-C)
│
├── GPIO 21 ──────────── TSL2591 SDA (I2C 데이터)
├── GPIO 22 ──────────── TSL2591 SCL (I2C 클럭)
├── GPIO 12 ──────────── Pan 서보 신호선 (S0)
├── GPIO 13 ──────────── Tilt 서보 신호선 (S1)
│
├── 3.3V ─────────────── TSL2591 VIN
├── 5V (Vin) ─────────── Pan 서보 5V
│                        Tilt 서보 5V
└── GND ──────────────── TSL2591 GND
                         Pan 서보 GND
                         Tilt 서보 GND
```

### TSL2591 핀맵 (Qwiic/I2C 모듈)

```
VIN → ESP32 3.3V
GND → ESP32 GND
SDA → ESP32 GPIO 21
SCL → ESP32 GPIO 22
```

### 서보 배선 색상 (MG90S/SG90 공통)

```
갈색/검정 → GND
빨강      → 5V (Vin)
주황/노랑  → GPIO 12 (Pan, MG90S) 또는 GPIO 13 (Tilt, SG90)
```

> MG90S(Pan)와 SG90(Tilt)은 PWM 사양(50Hz, 500~2400µs)과 배선 색상 규칙이
> 동일하여 코드/배선 방식에 차이가 없다.

### 렌즈/시야각 제한

- 보유한 15° LED용 집광렌즈는 평판형 TSL2591에 장착 불가 (LED 돔 패키지 전용)
- **1차 진행:** 렌즈/튜브 없이 동작 확인 우선
- **추후 옵션:** 검은색 차광 튜브를 TSL2591 위에 씌워 시야각 제한 (튜브 길이/지름 비율로 FOV 결정)

### 전원 주의사항

- MG90S + SG90 동시 구동 시 전류 소모 최대 ~400~500mA
- USB 전원 단독으로도 동작하나, 서보 움직임이 많을 때 전압 강하 가능
- 안정적인 테스트를 위해 유전원 USB 허브 또는 외부 5V 어댑터 권장

---

## 소프트웨어 설계

### 스캔 파라미터

- **Pan 범위:** 0° ~ 180° (MG90S 물리 한계, 하늘 절반 커버)
- **Tilt 범위:** 0° ~ 90° (지평선 ~ 천정)
- **각도 간격:** 30° (코드 상수로 변경 가능)
- **총 측정 포인트:** 7 × 4 = 28포인트
- **예상 소요 시간:** 약 1분

### 프로그램 흐름

```
[초기화]
  ├── Serial.begin(115200)
  ├── ESP32Servo 라이브러리로 Pan/Tilt 서보 attach
  │     └── Pan: GPIO 12, Tilt: GPIO 13
  └── TSL2591 I2C 초기화 (Wire.begin, gain/integration time 설정)

[격자 스캔 루프]
  for pan = 0 to 180, step 30°:       // 7포인트
    for tilt = 0 to 90, step 30°:     // 4포인트
      1. 서보 이동 (pan, tilt 각도 설정)
      2. 안정화 대기 (500ms)
      3. TSL2591 풀 휘도 읽기 (getFullLuminosity)
      4. CH0(전체광), CH1(적외선) → VIS = (CH0-CH1) / (gain × integration/200)
      5. SQM = CAL_OFFSET - 1.086 * log(VIS)  // VIS<=0 예외처리 포함
      6. 시리얼 출력: "Pan:X Tilt:Y VIS:Z.ZZ SQM:W.WW"

[스캔 완료]
  └── "SCAN DONE" 출력 후 서보 홈 위치(Pan:90, Tilt:45) 복귀
```

### 핵심 코드 상수

```cpp
#define PAN_PIN       12      // Pan 서보 PWM 핀
#define TILT_PIN      13      // Tilt 서보 PWM 핀
// TSL2591: SDA=GPIO21, SCL=GPIO22 (ESP32 기본 I2C 핀, Wire.begin() 기본값)

#define PAN_MIN       0       // Pan 시작 각도
#define PAN_MAX       180     // Pan 끝 각도
#define TILT_MIN      0       // Tilt 시작 각도 (지평선)
#define TILT_MAX      90      // Tilt 끝 각도 (천정)
#define ANGLE_STEP    30      // 스캔 간격 (도)

#define SETTLE_MS     500     // 서보 안정화 대기 시간

// TSL2591 게인/적분시간 — 초기 검증(밝은 환경)용 기본값
// 야간 측정 시 GAIN_MAX + INTEGRATIONTIME_600MS 로 변경
#define TSL_GAIN      TSL2591_GAIN_LOW
#define TSL_GAIN_VAL  1.0f
#define TSL_INTEG     TSL2591_INTEGRATIONTIME_100MS
#define TSL_INTEG_MS  100.0f

#define CAL_OFFSET    12.6f   // SQM 캘리브레이션 상수 (실측 후 조정)
```

### TSL2591 → SQM 변환 (gshau/SQM_TSL2591 참고)

```
VIS = (CH0 - CH1) / (TSL_GAIN_VAL × TSL_INTEG_MS / 200.0)
SQM (mag/arcsec²) = CAL_OFFSET - 1.086 × log(VIS)
```

- `CH0`: 전체광(가시광+적외선), `CH1`: 적외선만 → 차이가 가시광선 성분
- `CAL_OFFSET`: 레퍼런스 프로젝트 기본값 12.6, 기준 SQM 측정기와 비교 후 조정
- VIS <= 0 (완전 암흑) 처리: 별도 분기로 "측정불가" 출력

### 시리얼 출력 형식

```
=== Pan-Tilt SQM 스캔 시작 ===
Pan:0, Tilt:0, VIS:1234.00, SQM:19.82
Pan:0, Tilt:30, VIS:1189.00, SQM:19.86
Pan:0, Tilt:60, VIS:1300.00, SQM:19.78
Pan:0, Tilt:90, VIS:900.00, SQM:19.98
Pan:30, Tilt:0, VIS:1100.00, SQM:19.91
...
=== SCAN DONE (28 points) ===
```

---

## 사용 라이브러리 (Arduino IDE)

| 라이브러리 | 용도 | 설치 방법 |
|-----------|------|---------|
| ESP32Servo | MG90S/SG90 서보 제어 | Arduino 라이브러리 매니저에서 "ESP32Servo" 검색 |
| Adafruit_TSL2591 | TSL2591 I2C 광센서 제어 | 라이브러리 매니저에서 "Adafruit TSL2591" 검색 (의존성 Adafruit_Sensor도 함께 설치) |
| Wire (내장) | I2C 통신 | 별도 설치 불필요 |

---

## 성공 기준

1. 시리얼 모니터(115200 baud)에서 28개 포인트 데이터 순서대로 출력
2. Pan/Tilt 서보가 각 각도로 정확히 이동 (육안 확인)
3. TSL2591 VIS 값이 빛 차단 시 감소, 밝은 빛에서 증가
4. SQM 값이 합리적인 범위(0~22 mag/arcsec², 환경에 따라 변동)로 출력

---

## 제약 및 향후 과제

| 현재 제약 | 향후 해결 방법 |
|---------|-------------|
| Pan 최대 180° (하늘 절반) | 연속회전 서보 또는 스텝모터로 교체 |
| USB 케이블 연결 필요 | 배터리 충방전 모듈 + 무선(WiFi) 추가 |
| CAL_OFFSET 미보정 | 기준 SQM계와 비교 후 상수 조정 |
| 시야각(FOV) 제한 없음 (렌즈 미사용) | 차광 튜브를 TSL2591 위에 부착해 FOV 제한 |
| 게인/적분시간 고정값 (밝은 환경 기준) | 야간 측정 시 TSL_GAIN/TSL_INTEG를 GAIN_MAX/600MS로 조정 |
