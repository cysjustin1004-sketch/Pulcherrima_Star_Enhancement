  # Pan-Tilt SQM 사용 매뉴얼

ESP32 + TSL2591 광센서 + Pan-Tilt HAT(FIT0731, Pan축 MG90S + Tilt축 SG90)로 만드는
하늘 밝기(SQM, mag/arcsec²) 자동 격자 스캔 측정기.

> 설계 배경은 `docs/superpowers/specs/2026-06-09-pan-tilt-sqm-design.md`,
> 펌웨어 작성 계획은 `docs/superpowers/plans/2026-06-09-pan-tilt-sqm.md` 참고.

---

## 1. 준비물

| 부품 | 비고 |
|------|------|
| ESP32 DevKitC WROOM-32D V4 (USB-C) | 메인 컨트롤러 |
| TSL2591 (Qwiic/I2C 모듈) | 광센서 |
| Pan-Tilt HAT FIT0731 (Pan축 MG90S + Tilt축 SG90 포함) | 팬-틸트 구조물 |
| I2C 1602 LCD (PCF8574 백팩) | SQM 결과 표시용 |
| MB-102 브레드보드 | 프로토타이핑용 |
| 점퍼선 (M/F 20cm 등) | 배선용 |
| USB-C 케이블 (PC 연결용) | 펌웨어 업로드 + 시리얼 출력 |
| AA 건전지 소켓 (4구) + AA 건전지 4개 | 야외 운용 시 전원 공급용 (2.5절 참고) |

> 15° LED용 집광렌즈는 평판형 TSL2591에 장착 불가하므로 **렌즈 없이** 진행한다.
> (추후 차광 튜브로 시야각 제한 가능)

---

## 2. 배선

### 2.1 전체 배선표

```
ESP32 DevKitC (USB-C)
│
├── GPIO 21 ──────────── TSL2591 SDA, LCD SDA (I2C 데이터, 버스 공유)
├── GPIO 22 ──────────── TSL2591 SCL, LCD SCL (I2C 클럭, 버스 공유)
├── GPIO 12 ──────────── Pan 서보 신호선 (Pan-Tilt HAT 커넥터의 S0)
├── GPIO 13 ──────────── Tilt 서보 신호선 (Pan-Tilt HAT 커넥터의 S1)
│
├── 3.3V ─────────────── TSL2591 VIN
├── 5V (Vin) ─────────── Pan 서보 5V, Tilt 서보 5V, LCD VCC, AA 건전지 소켓 (+)
└── GND ──────────────── TSL2591 GND, Pan 서보 GND, Tilt 서보 GND, LCD GND, AA 건전지 소켓 (−)
```

> LCD(I2C 1602)는 TSL2591과 SDA/SCL 버스를 그대로 공유한다.
> 두 장치의 I2C 주소(TSL2591=0x29, LCD=보통 0x27 또는 0x3F)가 다르므로 충돌하지 않는다.
> 단, 대부분의 1602 I2C 백팩은 **5V 전원**이 필요하므로 VCC는 3.3V가 아닌 5V(Vin)에 연결한다.

> AA 건전지 소켓은 USB 케이블 대신 사용하는 보조 전원이다. PC에 연결해
> 펌웨어를 업로드/모니터링할 때는 USB-C를, 야외에서 단독 운용할 때는
> 건전지 소켓의 (+)/(−)를 ESP32 "5V (Vin)" / "GND"에 연결한다.
> **두 전원을 동시에 연결하지 않는다** (역전류 방지).

### 2.2 TSL2591 핀맵

```
VIN → ESP32 3.3V
GND → ESP32 GND
SDA → ESP32 GPIO 21
SCL → ESP32 GPIO 22
```

### 2.2-1 I2C 1602 LCD 핀맵

```
VCC → ESP32 5V (Vin)   ← 대부분 1602 I2C 백팩은 5V 동작 (3.3V 아님)
GND → ESP32 GND
SDA → ESP32 GPIO 21    ← TSL2591과 공유
SCL → ESP32 GPIO 22    ← TSL2591과 공유
```

> LCD 백팩의 정확한 I2C 주소(0x27 또는 0x3F)는 모듈마다 다를 수 있다.
> `firmware/i2c_scanner/i2c_scanner.ino`를 업로드해 확인 후,
> `config.h`의 `LCD_ADDR` 값을 실제 주소로 맞춘다.

### 2.3 Pan-Tilt HAT (FIT0731) 6핀 커넥터

커넥터 구성: `GND / 5V / S1 / GND / 5V / S0`

- **S0 → Pan 서보 신호선 → ESP32 GPIO 12**
- **S1 → Tilt 서보 신호선 → ESP32 GPIO 13**
- 5V 두 핀 → ESP32 5V(Vin)
- GND 두 핀 → ESP32 GND

> S0/S1 중 어느 쪽이 실제 Pan인지 확신이 없다면, 1단계 `servo_test` 업로드 후
> 어느 서보가 좌우(Pan)로 도는지 육안으로 확인하고 필요하면 배선을 바꾼다.

### 2.4 서보 배선 색상 (MG90S/SG90 공통)

```
갈색/검정 → GND
빨강      → 5V (Vin)
주황/노랑  → 신호선 (S0 또는 S1)
```

> Pan(MG90S)과 Tilt(SG90)은 PWM 사양(50Hz, 500~2400µs)과 배선 색상이 동일해
> 배선/코드에 차이가 없다.

### 2.5 전원 주의사항 (AA 건전지 4개 운용 시)

- MG90S + SG90 동시 구동 시 전류 소모 최대 약 400~500mA.
- AA 건전지(알카라인) 4개 직렬 = 신품 약 6V, 방전될수록 4V대까지 떨어진다.
  ESP32의 5V→3.3V 레귤레이터는 입력 전압이 약 4.4V 이하로 떨어지면
  3.3V를 안정적으로 만들지 못해 **갑자기 리셋되거나 멈출 수 있다.**
- 특히 두 서보가 동시에 움직이는 순간 전압이 일시적으로 더 떨어지므로,
  배터리가 어느 정도 소모된 상태에서는 리셋 위험이 커진다.
- **권장 사항:**
  - 가능하면 새 알카라인 건전지(또는 충전된 니켈수소 4개, 약 4.8~5.2V)를 사용한다.
  - 측정 중 ESP32가 갑자기 재부팅되거나 시리얼 출력이 처음부터 다시 시작되면
    배터리 전압 저하가 원인일 가능성이 높다 → 새 건전지로 교체.
  - 장시간/반복 측정처럼 안정성이 중요한 경우에는 USB 전원 뱅크(5V) 또는
    Li-ion + 5V 부스트 컨버터처럼 전압이 일정하게 유지되는 전원으로 전환을 고려한다.
- USB로 PC와 연결해 사용할 때는 가능하면 유전원(전원 공급 가능한) USB 허브 또는
  외부 5V 어댑터 사용을 권장.

---

## 3. 개발 환경 준비 (Arduino IDE)

1. [Arduino IDE 2.x](https://www.arduino.cc/en/software) 설치
2. `File > Preferences` → "Additional boards manager URLs"에 아래 URL 추가:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. `Tools > Board > Boards Manager` → `esp32` 검색 → "esp32 by Espressif Systems" 설치
4. `Sketch > Include Library > Manage Libraries`에서 아래 라이브러리 설치:
   - `ESP32Servo` (Kevin Harrington)
   - `Adafruit TSL2591 Library` (설치 시 의존성 `Adafruit_Sensor`도 함께 설치 — "Install all" 선택)
   - `LiquidCrystal I2C` (Frank de Brabander) — I2C 1602 LCD 제어
   - `Wire`는 ESP32 보드 패키지에 내장되어 있어 별도 설치 불필요
5. ESP32를 USB-C로 PC에 연결 → `Tools > Board > esp32 > ESP32 Dev Module` 선택
6. `Tools > Port`에서 ESP32가 연결된 COM 포트 선택
7. 빈 스케치를 업로드해 "Done uploading." 메시지가 뜨는지 확인
   - 업로드 실패 시 ESP32의 BOOT 버튼을 누른 채 업로드 버튼 클릭

---

## 4. 펌웨어 폴더 구조

```
(Arduino 스케치북 폴더)/
├── servo_test/
│   └── servo_test.ino     # 1단계: 서보 단독 테스트
├── tsl_test/
│   └── tsl_test.ino       # 2단계: TSL2591 단독 테스트
├── i2c_scanner/
│   └── i2c_scanner.ino    # 3단계: I2C 주소 확인 (LCD 주소 확인용)
└── pan_tilt_sqm/
    ├── config.h            # 핀/범위/캘리브레이션/LCD 상수
    └── pan_tilt_sqm.ino    # 4단계: 최종 통합 스케치
```

이 프로젝트의 `firmware/` 폴더 안 내용을 그대로 위 구조로 Arduino 스케치북 폴더에 복사하면 된다.
(Arduino IDE는 `.ino` 파일이 반드시 같은 이름의 폴더 안에 있어야 한다.)

---

## 5. 단계별 테스트 순서

### 5.1 1단계 — 서보 동작 확인 (`servo_test.ino`)

1. `servo_test` 스케치를 열고 업로드
2. `Tools > Serial Monitor`를 열고 속도를 `115200`으로 설정
3. 확인 항목:
   - Pan 서보가 0° → 90° → 180° → 90° 순서로 회전하는가?
   - Tilt 서보가 0° → 45° → 90° → 45° 순서로 회전하는가?
   - 시리얼 모니터에 각 단계 메시지가 출력되는가?

**문제 발생 시:**
- 서보가 안 움직임 → 5V(Vin) 연결, 신호선 GPIO 번호 확인
- 서보가 반대로 움직임 → 물리적으로 장착 방향만 조정 (코드 수정 불필요)
- 한쪽 서보만 움직임 → GPIO 12/13(S0/S1) 배선이 바뀌었는지 확인

### 5.2 2단계 — TSL2591 광센서 확인 (`tsl_test.ino`)

1. `tsl_test` 스케치를 열고 업로드
2. 시리얼 모니터(115200) 확인
3. 확인 항목:
   - "TSL2591 센서 인식 완료" 메시지가 뜨는가?
   - `CH0(전체광)`, `CH1(적외선)` 값이 1초마다 출력되는가?
   - 손으로 센서를 가리면 값이 작아지고, 빛을 비추면 값이 커지는가?

**문제 발생 시:**
- "센서를 찾을 수 없습니다" → SDA(GPIO21)/SCL(GPIO22), VIN(3.3V) 배선 재확인
- 값이 항상 0 또는 항상 65535(포화) → `tsl_test.ino`의
  `tsl.setGain()` / `tsl.setTiming()` 값을 환경에 맞게 조정
  (밝은 곳: GAIN_LOW + 100MS, 어두운 곳: GAIN_MAX + 600MS)

### 5.3 3단계 — I2C 주소 확인 (`i2c_scanner.ino`)

LCD를 배선한 뒤, 통합 스케치를 업로드하기 전에 LCD의 정확한 I2C 주소를 확인한다.

1. LCD를 2.2-1절 배선대로 연결 (SDA/SCL은 TSL2591과 같은 핀에 공유 연결)
2. `i2c_scanner` 스케치를 열고 업로드
3. 시리얼 모니터(115200) 확인
4. 확인 항목:
   - `0x29`(TSL2591)와 LCD 주소(`0x27` 또는 `0x3F` 등)가 함께 출력되는가?
   - LCD 주소가 `0x27`이 아니라면, `firmware/pan_tilt_sqm/config.h`의
     `LCD_ADDR` 값을 실제 출력된 주소로 수정한다.

**문제 발생 시:**
- 아무 주소도 안 뜸 → SDA(GPIO21)/SCL(GPIO22), VCC(5V)/GND 배선 재확인
- `0x29`만 뜨고 LCD 주소가 안 뜸 → LCD VCC가 5V(Vin)에 연결되어 있는지,
  LCD 백라이트가 켜져 있는지 확인

### 5.4 4단계 — 통합 스캔 (`pan_tilt_sqm.ino`)

1. `config.h`의 `LCD_ADDR`이 5.3에서 확인한 주소와 일치하는지 확인
2. `pan_tilt_sqm` 스케치를 열고 업로드 (같은 폴더의 `config.h`도 함께 컴파일됨)
3. 시리얼 모니터(115200) 확인
4. 동작 흐름:
   - Pan 0°~180° (30° 간격, 7포인트) × Tilt 0°~90° (30° 간격, 4포인트) = 28포인트
   - 각 포인트마다: 서보 이동 → 0.5초 안정화 → TSL2591 측정 → VIS/SQM 계산 →
     시리얼 출력 + LCD 표시 (1행: `Pan:XXX Tilt:XX`, 2행: `SQM:XX.XX`)
   - 스캔 완료 후 "SCAN DONE" 출력 + LCD에 "SCAN DONE / 28 points" 표시,
     홈 위치(Pan:90, Tilt:45)로 복귀 후 대기

**예시 출력:**
```
=== Pan-Tilt SQM 스캔 시작 ===
Pan:  0, Tilt: 0, VIS: 1234.00, SQM:19.82
Pan:  0, Tilt:30, VIS: 1189.00, SQM:19.86
...
Pan:180, Tilt:90, VIS:  900.00, SQM:19.98
=== SCAN DONE (28 points) ===
```

**확인 항목 (성공 기준):**
1. 28개 포인트가 순서대로 출력되는가?
2. 서보가 시리얼 출력에 맞춰 실제로 이동하는가?
3. VIS 값이 빛을 가리면 줄고 밝아지면 느는가?
4. SQM 값이 합리적인 범위(0~22 mag/arcsec², 환경에 따라 변동)인가?

---

## 6. 캘리브레이션 (조정이 필요할 때)

`firmware/pan_tilt_sqm/config.h`에서 아래 값을 조정한다.

| 상수 | 기본값 | 언제 바꾸나 |
|------|--------|------------|
| `CAL_OFFSET` | `12.6f` | 기준 SQM 측정기(예: Unihedron SQM)와 비교해 값이 일관되게 높거나 낮으면 보정 |
| `TSL_GAIN` / `TSL_GAIN_VAL` | `TSL2591_GAIN_LOW` / `1.0f` | 야간 측정 시 `TSL2591_GAIN_MAX` / `9876.0f`로 변경 |
| `TSL_INTEG` / `TSL_INTEG_MS` | `TSL2591_INTEGRATIONTIME_100MS` / `100.0f` | 야간 측정 시 `TSL2591_INTEGRATIONTIME_600MS` / `600.0f`로 변경 |
| `ANGLE_STEP` | `30` | 더 촘촘한 스캔이 필요하면 `15`나 `10`으로 (소요 시간 증가) |

> `TSL_GAIN`과 `TSL_GAIN_VAL`(또는 `TSL_INTEG`/`TSL_INTEG_MS`)은 항상 **짝을 맞춰서** 변경해야 한다.
> 게인 값 대응표: LOW=1x, MED=25x, HIGH=428x, MAX=9876x

---

## 7. 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| 서보가 안 움직임 | 5V(Vin) 미연결 또는 전류 부족 | 유전원 USB 허브 사용, GND 공통 확인 |
| "TSL2591 센서를 찾을 수 없습니다" | SDA/SCL 또는 VIN 배선 오류 | I2C 배선(GPIO21/22, 3.3V) 재확인 |
| VIS 값이 항상 0에 가까움 | 게인/적분시간이 너무 낮음 | `TSL_GAIN`/`TSL_INTEG`를 GAIN_MAX/600MS로 |
| VIS 값이 항상 포화(매우 큼) | 게인/적분시간이 너무 높음 (밝은 환경) | `TSL_GAIN`/`TSL_INTEG`를 GAIN_LOW/100MS로 |
| SQM 값이 기준기와 차이남 | `CAL_OFFSET` 미보정 | 기준 SQM계와 비교 후 `CAL_OFFSET` 조정 |
| 업로드 실패 | ESP32 부트 모드 문제 | BOOT 버튼 누른 채 업로드 재시도 |
| 측정 중 갑자기 재부팅/처음부터 재시작 | AA 건전지 전압 저하로 브라운아웃 | 새 건전지로 교체, 또는 USB 전원으로 전환 |
| LCD에 아무것도 안 뜸 / 네모만 가득 참 | I2C 주소 불일치 또는 대비(contrast) 문제 | `i2c_scanner`로 주소 확인 후 `LCD_ADDR` 수정, 백팩의 가변저항으로 대비 조절 |
| LCD 백라이트만 켜지고 글자 깨짐 | LCD VCC가 3.3V에 연결됨 | LCD VCC를 5V(Vin)로 재배선 |

---

## 8. 다음 단계 (선택)

- 차광 튜브를 TSL2591 위에 부착해 시야각(FOV) 제한
- `ANGLE_STEP`을 줄여 해상도 향상
- WiFi 추가로 PC 없이 야외 무선 운용 (현재 AA 건전지로 단독 전원, LCD로 결과 확인 가능)
- 연속회전 서보/스텝모터로 교체해 Pan 360° 전체 스캔
