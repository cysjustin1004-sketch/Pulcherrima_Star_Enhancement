# Pan-Tilt SQM 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ESP32 + TSL2591 + Pan-Tilt HAT(Pan축 MG90S, Tilt축 SG90)로 하늘 28개 방향의 SQM을 자동 스캔해 시리얼로 출력하는 펌웨어 작성

**Architecture:** 단계별 하드웨어 검증 방식 — 서보 단독 → TSL2591 단독 → 통합 순서로 확인. 각 단계에서 시리얼 출력으로 동작을 검증한 뒤 다음 단계로 진행한다.

**Tech Stack:** Arduino IDE 2.x, ESP32 보드 패키지(Espressif), ESP32Servo 라이브러리, Adafruit_TSL2591 + Adafruit_Sensor 라이브러리, Wire(I2C)

---

## 파일 구조

```
(Arduino 스케치북 폴더)/
├── servo_test/
│   └── servo_test.ino       # Task 2: 서보 단독 테스트용 임시 스케치
├── tsl_test/
│   └── tsl_test.ino         # Task 3: TSL2591 단독 테스트용 임시 스케치
└── pan_tilt_sqm/
    ├── config.h             # Task 4: 핀 번호 및 상수 정의
    └── pan_tilt_sqm.ino     # Task 5: 최종 통합 스케치
```

> Arduino IDE에서는 스케치(.ino)가 반드시 **같은 이름의 폴더** 안에 있어야 한다.

---

## Task 1: Arduino IDE 환경 설정

**목표:** ESP32 코드를 작성하고 업로드할 수 있는 환경 준비

- [ ] **Step 1: Arduino IDE 2.x 설치**

  https://www.arduino.cc/en/software 에서 Arduino IDE 2.x 다운로드 후 설치.

- [ ] **Step 2: ESP32 보드 패키지 추가**

  Arduino IDE 실행 → 상단 메뉴 `File > Preferences` 열기.
  
  "Additional boards manager URLs" 칸에 아래 URL 붙여넣기:
  ```
  https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  ```
  
  OK 클릭.

- [ ] **Step 3: ESP32 보드 패키지 설치**

  메뉴 `Tools > Board > Boards Manager` 열기.
  검색창에 `esp32` 입력.
  "esp32 by Espressif Systems" 옆 Install 클릭 (설치에 수 분 소요).

- [ ] **Step 4: 필요한 라이브러리 설치**

  메뉴 `Sketch > Include Library > Manage Libraries` 열기.

  - 검색창에 `ESP32Servo` 입력 → "ESP32Servo by Kevin Harrington" Install
  - 검색창에 `Adafruit TSL2591` 입력 → "Adafruit TSL2591 Library by Adafruit" Install
    - 의존성 설치 확인 창이 뜨면 "Install all"을 눌러 Adafruit_Sensor도 함께 설치
  - `Wire` 라이브러리는 ESP32 보드 패키지에 내장되어 있어 별도 설치 불필요

- [ ] **Step 5: 보드 및 포트 선택**

  ESP32를 USB 케이블로 PC에 연결.
  
  메뉴 `Tools > Board > esp32 > ESP32 Dev Module` 선택.
  
  메뉴 `Tools > Port` 에서 새로 나타난 COM 포트 선택.
  (예: Windows는 `COM3`, `COM4` 등. 장치관리자에서 확인 가능)

- [ ] **Step 6: 업로드 테스트 (빈 스케치)**

  `File > New Sketch` 로 빈 스케치 생성.
  업로드 버튼(→ 화살표)을 클릭.
  하단에 "Done uploading." 메시지 확인.
  
  > 업로드 실패 시: ESP32 보드의 BOOT 버튼을 누른 채 업로드 버튼 클릭.

---

## Task 2: 서보 모터 단독 테스트

**목표:** Pan/Tilt 서보가 올바르게 배선되고 각도 명령에 반응하는지 확인

**배선 확인:**
```
Pan 서보(MG90S)  주황/노랑 → ESP32 GPIO 12
           빨강     → ESP32 5V (Vin 핀)
           갈색/검정 → ESP32 GND

Tilt 서보(SG90)  주황/노랑 → ESP32 GPIO 13
           빨강     → ESP32 5V (Vin 핀)
           갈색/검정 → ESP32 GND
```

- [ ] **Step 1: servo_test 스케치 폴더 생성**

  Arduino 스케치북 폴더(기본값: `문서/Arduino`) 안에 `servo_test` 폴더 생성.
  그 안에 `servo_test.ino` 파일 생성.

- [ ] **Step 2: 서보 테스트 코드 작성**

  `servo_test.ino` 에 아래 내용 입력:

  ```cpp
  #include <ESP32Servo.h>

  #define PAN_PIN  12
  #define TILT_PIN 13

  Servo panServo;
  Servo tiltServo;

  void setup() {
    Serial.begin(115200);
    panServo.attach(PAN_PIN);
    tiltServo.attach(TILT_PIN);
    Serial.println("서보 테스트 시작");
  }

  void loop() {
    Serial.println("Pan 0도");
    panServo.write(0);
    delay(1000);

    Serial.println("Pan 90도");
    panServo.write(90);
    delay(1000);

    Serial.println("Pan 180도");
    panServo.write(180);
    delay(1000);

    Serial.println("Pan 90도 복귀");
    panServo.write(90);
    delay(1000);

    Serial.println("Tilt 0도 (지평선)");
    tiltServo.write(0);
    delay(1000);

    Serial.println("Tilt 45도");
    tiltServo.write(45);
    delay(1000);

    Serial.println("Tilt 90도 (천정)");
    tiltServo.write(90);
    delay(1000);

    Serial.println("Tilt 45도 복귀");
    tiltServo.write(45);
    delay(2000);
  }
  ```

- [ ] **Step 3: 업로드 및 동작 확인**

  Arduino IDE에서 업로드(→) 클릭.
  
  업로드 완료 후 `Tools > Serial Monitor` 열기, 우측 하단 속도 `115200` 설정.
  
  **확인 항목:**
  - 시리얼 모니터에 "Pan 0도", "Pan 90도" 등 메시지가 순서대로 출력되는가?
  - Pan 서보가 0° → 90° → 180° → 90° 순서로 실제로 회전하는가?
  - Tilt 서보가 0° → 45° → 90° → 45° 순서로 실제로 회전하는가?
  
  **문제 발생 시:**
  - 서보가 안 움직임 → 5V(Vin) 연결 확인, 신호선 GPIO 번호 확인
  - 서보가 반대 방향으로 움직임 → 물리적으로 서보 장착 방향 조정 (코드 변경 불필요)
  - 서보 1개만 움직임 → GPIO 12/13 연결 교체 확인

---

## Task 3: TSL2591 광센서 측정 테스트

**목표:** TSL2591 센서가 I2C로 정상 인식되고, 빛의 양에 비례한 채널 값을 출력하는지 확인

**배선 확인:**
```
TSL2591 (Qwiic/I2C 모듈)
VIN → ESP32 3.3V
GND → ESP32 GND
SDA → ESP32 GPIO 21
SCL → ESP32 GPIO 22
```

- [ ] **Step 1: tsl_test 스케치 폴더 생성**

  Arduino 스케치북 폴더 안에 `tsl_test` 폴더 생성.
  그 안에 `tsl_test.ino` 파일 생성.

- [ ] **Step 2: TSL2591 테스트 코드 작성**

  `tsl_test.ino` 에 아래 내용 입력:

  ```cpp
  /**
   * tsl_test.ino
   * TSL2591 I2C 광센서 단독 테스트 스케치
   *
   * 목적: TSL2591 배선과 I2C 통신, 채널 값 측정 동작을 검증하기 위한 임시 테스트 코드
   *
   * 하드웨어 연결:
   *   TSL2591 VIN → ESP32 3.3V
   *   TSL2591 GND → ESP32 GND
   *   TSL2591 SDA → ESP32 GPIO 21
   *   TSL2591 SCL → ESP32 GPIO 22
   */

  #include <Wire.h>
  #include <Adafruit_Sensor.h>
  #include <Adafruit_TSL2591.h>

  // TSL2591_SENSOR_ID: 같은 타입의 센서가 여러 개 있을 때 구분하는 임의 식별자.
  // 단일 센서 사용이므로 임의의 값 2591을 사용한다.
  Adafruit_TSL2591 tsl = Adafruit_TSL2591(2591);

  void setup() {
    Serial.begin(115200);
    delay(500); // ESP32 부팅 직후 시리얼 안정화 대기

    // ESP32 기본 I2C 핀(SDA=21, SCL=22)으로 I2C 시작
    Wire.begin();

    if (!tsl.begin()) {
      Serial.println("TSL2591 센서를 찾을 수 없습니다. 배선을 확인하세요.");
      while (1) {
        delay(1000);
      }
    }

    Serial.println("TSL2591 센서 인식 완료");

    // 게인/적분시간 설정: 초기 검증(밝은 환경)용 기본값
    // 야간 측정 시 GAIN_MAX + INTEGRATIONTIME_600MS로 변경 필요
    tsl.setGain(TSL2591_GAIN_LOW);
    tsl.setTiming(TSL2591_INTEGRATIONTIME_100MS);

    Serial.println("TSL2591 측정 시작 (1초 간격)");
  }

  void loop() {
    // getFullLuminosity()는 32비트 값에 CH0(전체광)와 CH1(적외선)을 함께 담아 반환한다.
    // 하위 16비트 = CH0, 상위 16비트 = CH1
    uint32_t lum = tsl.getFullLuminosity();
    uint16_t ch0 = lum & 0xFFFF;
    uint16_t ch1 = lum >> 16;

    Serial.printf("CH0(전체광): %u, CH1(적외선): %u\n", ch0, ch1);

    delay(1000);
  }
  ```

- [ ] **Step 3: 업로드 및 동작 확인**

  업로드 후 시리얼 모니터 열기 (115200 baud).

  **확인 항목:**

  1. "TSL2591 센서 인식 완료" 메시지가 출력되는가? (I2C 배선 정상)
  2. 일반 실내 밝기에서 CH0, CH1 값이 0보다 큰가?
  3. 손으로 센서를 완전히 가리면 CH0, CH1 값이 작아지는가?
  4. 밝은 빛(핸드폰 플래시 등)을 비추면 CH0, CH1 값이 크게 올라가는가?

  **예시 출력:**
  ```
  TSL2591 센서 인식 완료
  TSL2591 측정 시작 (1초 간격)
  CH0(전체광): 1234, CH1(적외선): 567
  CH0(전체광): 1198, CH1(적외선): 552
  CH0(전체광): 30, CH1(적외선): 12      ← 손으로 가린 경우
  CH0(전체광): 65535, CH1(적외선): 41230 ← 플래시 비춘 경우 (포화)
  ```

  **문제 발생 시:**
  - "센서를 찾을 수 없습니다" → SDA(GPIO21)/SCL(GPIO22) 연결 확인, VIN 3.3V 연결 확인
  - 값이 항상 0 또는 항상 65535(포화) → setGain()/setTiming() 값을 환경에 맞게 조정
    (밝은 환경에서는 GAIN_LOW + 100MS, 어두운 환경에서는 GAIN_MAX + 600MS)

---

## Task 4: 최종 스케치 기본 파일 생성

**목표:** 통합 스케치를 위한 폴더 및 설정 파일 준비

- [ ] **Step 1: pan_tilt_sqm 폴더 및 파일 생성**

  Arduino 스케치북 폴더 안에 `pan_tilt_sqm` 폴더 생성.
  그 안에 `config.h`, `pan_tilt_sqm.ino` 두 파일 생성.

- [ ] **Step 2: config.h 작성**

  `config.h` 에 아래 내용 입력:

  ```cpp
  #pragma once

  #include <Adafruit_TSL2591.h>

  // 핀 설정
  #define PAN_PIN       12    // Pan 서보 PWM
  #define TILT_PIN      13    // Tilt 서보 PWM
  // TSL2591: SDA=GPIO21, SCL=GPIO22 (ESP32 기본 I2C 핀, Wire.begin() 기본값)

  // 스캔 범위
  #define PAN_MIN       0     // Pan 시작 각도
  #define PAN_MAX       180   // Pan 끝 각도 (MG90S 물리 한계)
  #define TILT_MIN      0     // Tilt 시작 각도 (지평선)
  #define TILT_MAX      90    // Tilt 끝 각도 (천정)
  #define ANGLE_STEP    30    // 스캔 간격 (도) — 변경 가능

  // 타이밍
  #define SETTLE_MS     500   // 서보 이동 후 안정화 대기 (ms)

  // TSL2591 게인/적분시간 — 초기 검증(밝은 환경)용 기본값
  // 야간 측정 시 GAIN_MAX + INTEGRATIONTIME_600MS로 변경
  #define TSL_GAIN      TSL2591_GAIN_LOW
  #define TSL_GAIN_VAL  1.0f
  #define TSL_INTEG     TSL2591_INTEGRATIONTIME_100MS
  #define TSL_INTEG_MS  100.0f

  // SQM 캘리브레이션
  // 실측 후 기준 SQM계와 비교해 조정할 것
  #define CAL_OFFSET    12.6f
  ```

---

## Task 5: 최종 통합 스케치 작성 및 검증

**목표:** 격자 스캔 + SQM 계산 + 시리얼 출력을 통합한 최종 펌웨어 완성

- [ ] **Step 1: pan_tilt_sqm.ino 작성**

  `pan_tilt_sqm.ino` 에 아래 내용 입력:

  ```cpp
  #include <ESP32Servo.h>
  #include <Wire.h>
  #include <Adafruit_Sensor.h>
  #include <Adafruit_TSL2591.h>
  #include <math.h>
  #include "config.h"

  Servo panServo;
  Servo tiltServo;

  // TSL2591_SENSOR_ID: 같은 타입의 센서가 여러 개 있을 때 구분하는 임의 식별자.
  // 단일 센서 사용이므로 임의의 값 2591을 사용한다.
  Adafruit_TSL2591 tsl = Adafruit_TSL2591(2591);

  // 서보를 지정 각도로 이동하고 안정화 대기
  void moveServos(int pan, int tilt) {
    panServo.write(pan);
    tiltServo.write(tilt);
    delay(SETTLE_MS);
  }

  // TSL2591 풀 휘도를 읽어 가시광선 성분(VIS) 계산
  // VIS = (CH0 - CH1) / (게인값 × 적분시간(ms) / 200)
  float measureVIS() {
    uint32_t lum = tsl.getFullLuminosity();
    uint16_t ch0 = lum & 0xFFFF;
    uint16_t ch1 = lum >> 16;

    return (float)(ch0 - ch1) / (TSL_GAIN_VAL * (TSL_INTEG_MS / 200.0f));
  }

  // VIS 값을 SQM(mag/arcsec²)으로 변환 (gshau/SQM_TSL2591 공식 참고)
  // vis <= 0이면 -1 반환 (측정 불가 신호)
  float calcSQM(float vis) {
    if (vis <= 0.0f) return -1.0f;
    return CAL_OFFSET - 1.086f * log(vis);
  }

  void setup() {
    Serial.begin(115200);

    // ESP32Servo는 ESP32 하드웨어 타이머를 사용한다.
    // 타이머 0, 1만 할당: 다른 라이브러리와의 충돌을 막기 위해 2개만 예약한다.
    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);

    // 서보 초기화 및 홈 포지션 이동
    panServo.setPeriodHertz(50);
    panServo.attach(PAN_PIN, 500, 2400);
    tiltServo.setPeriodHertz(50);
    tiltServo.attach(TILT_PIN, 500, 2400);
    moveServos(90, 45); // 중앙 위치에서 시작

    // TSL2591 I2C 초기화
    Wire.begin();
    if (!tsl.begin()) {
      Serial.println("TSL2591 센서를 찾을 수 없습니다. 배선을 확인하세요.");
      while (1) {
        delay(1000);
      }
    }
    tsl.setGain(TSL_GAIN);
    tsl.setTiming(TSL_INTEG);

    delay(1000); // 서보 안정화
    Serial.println("=== Pan-Tilt SQM 스캔 시작 ===");
  }

  void loop() {
    int count = 0;

    for (int pan = PAN_MIN; pan <= PAN_MAX; pan += ANGLE_STEP) {
      for (int tilt = TILT_MIN; tilt <= TILT_MAX; tilt += ANGLE_STEP) {
        moveServos(pan, tilt);

        float vis = measureVIS();
        float sqm = calcSQM(vis);

        if (sqm < 0.0f) {
          Serial.printf("Pan:%3d, Tilt:%2d, VIS:%8.2f, SQM:N/A\n",
                        pan, tilt, vis);
        } else {
          Serial.printf("Pan:%3d, Tilt:%2d, VIS:%8.2f, SQM:%.2f\n",
                        pan, tilt, vis, sqm);
        }
        count++;
      }
    }

    Serial.printf("=== SCAN DONE (%d points) ===\n", count);

    // 홈 복귀 후 무한 대기 (리셋 버튼으로 재시작)
    moveServos(90, 45);
    while (true) { delay(1000); }
  }
  ```

- [ ] **Step 2: 업로드**

  Arduino IDE에서 `pan_tilt_sqm` 스케치 열기 (File > Open).
  업로드(→) 클릭.
  "Done uploading." 확인.

- [ ] **Step 3: 시리얼 모니터로 전체 동작 검증**

  `Tools > Serial Monitor` 열기, 속도 `115200` 설정.
  
  **확인 항목 (성공 기준):**
  
  1. `=== Pan-Tilt SQM 스캔 시작 ===` 메시지 출력되는가?
  2. Pan 0° → 30° → ... → 180°, 각 Pan마다 Tilt 0° → 30° → 60° → 90° 순서인가?
  3. 총 28줄의 측정값 출력 후 `=== SCAN DONE (28 points) ===` 가 나오는가?
  4. 서보가 시리얼 출력에 맞춰 실제로 이동하는가? (육안 확인)
  5. VIS 값이 손으로 가릴 때 줄고, 밝은 빛에서 늘어나는가?

  **예시 출력:**
  ```
  === Pan-Tilt SQM 스캔 시작 ===
  Pan:  0, Tilt: 0, VIS: 1234.00, SQM:19.82
  Pan:  0, Tilt:30, VIS: 1189.00, SQM:19.86
  Pan:  0, Tilt:60, VIS: 1300.00, SQM:19.78
  Pan:  0, Tilt:90, VIS:  900.00, SQM:19.98
  Pan: 30, Tilt: 0, VIS: 1100.00, SQM:19.91
  ...
  === SCAN DONE (28 points) ===
  ```

- [ ] **Step 4: 자주 발생하는 문제 체크리스트**

  | 증상 | 원인 | 해결 |
  |------|------|------|
  | 서보가 안 움직임 | 5V(Vin) 미연결 또는 전류 부족 | 유전원 USB 허브 사용, GND 공통 확인 |
  | "TSL2591 센서를 찾을 수 없습니다" | SDA(GPIO21)/SCL(GPIO22) 또는 VIN(3.3V) 연결 오류 | I2C 배선 재확인 |
  | VIS 값이 항상 0 또는 매우 작음 | 게인/적분시간이 너무 낮음 | config.h의 TSL_GAIN/TSL_INTEG를 GAIN_MAX/600MS로 조정 |
  | VIS 값이 항상 포화(매우 큼) | 게인/적분시간이 너무 높음 (밝은 환경) | config.h의 TSL_GAIN/TSL_INTEG를 GAIN_LOW/100MS로 조정 |
  | SQM 값이 이상함 | CAL_OFFSET 미보정 | config.h의 CAL_OFFSET 값 조정 |
  | 업로드 실패 | ESP32 부트 모드 문제 | BOOT 버튼 누르며 업로드 재시도 |

---

## 완료 후 다음 단계 (선택)

- CAL_OFFSET 보정: 기준 SQM계(예: Unihedron SQM)와 동일한 하늘을 측정해 값 비교 후 상수 조정
- 야간 측정 시 TSL_GAIN/TSL_INTEG를 GAIN_MAX/600MS로 조정해 어두운 하늘에서도 충분한 신호 확보
- 차광 튜브 부착으로 시야각(FOV) 제한
- ANGLE_STEP을 10°로 줄여 해상도 향상 (소요 시간 증가)
- LCD 모듈(I2C 1602) 추가로 케이블 없이 결과 확인
- 배터리 모듈 추가로 야외 독립 운용
