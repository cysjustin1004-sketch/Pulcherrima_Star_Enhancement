/**
 * pan_tilt_sqm.ino
 * Pan-Tilt SQM (Sky Quality Meter) 통합 스케치
 *
 * 동작 개요:
 *   1. Pan(수평) + Tilt(앙각) 서보로 하늘 반구를 격자 스캔한다.
 *   2. 각 포인트에서 TSL2591 I2C 광센서로 풀 휘도(CH0/CH1)를 측정한다.
 *   3. SQM 공식으로 밝기를 mag/arcsec² 단위로 변환해 시리얼로 출력한다.
 *
 * 하드웨어:
 *   - ESP32 DevKitC WROOM-32D V4 (USB-C)
 *   - TSL2591 (I2C): SDA → GPIO21, SCL → GPIO22 (ESP32 기본 I2C 핀)
 *   - I2C 1602 LCD: TSL2591과 동일 I2C 버스(SDA/SCL) 공유, VCC → 5V(Vin)
 *   - Pan 서보 PWM   → GPIO12  (스트래핑 핀, setup() 이후 attach)
 *   - Tilt 서보 PWM  → GPIO13
 *
 * 의존 라이브러리:
 *   - ESP32Servo (Arduino Library Manager)
 *   - Adafruit_TSL2591 (Arduino Library Manager)
 *   - Adafruit_Sensor (Adafruit_TSL2591의 의존 라이브러리)
 *   - LiquidCrystal I2C by Frank de Brabander (Arduino Library Manager)
 */

#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_TSL2591.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>       // log()
#include "config.h"     // 핀·범위·타이밍·캘리브레이션 상수

// ─── 전역 변수 ─────────────────────────────────────────────────────────────

Servo panServo;   // Pan 서보 인스턴스
Servo tiltServo;  // Tilt 서보 인스턴스

// TSL2591_SENSOR_ID: 같은 타입의 센서가 여러 개 있을 때 구분하는 임의 식별자.
// 단일 센서 사용이므로 임의의 값 2591을 사용한다(tsl_test.ino와 동일).
Adafruit_TSL2591 tsl = Adafruit_TSL2591(2591);

// I2C 1602 LCD: TSL2591과 SDA/SCL 버스를 공유한다 (주소만 다름).
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

// ─── 함수 정의 ─────────────────────────────────────────────────────────────

/**
 * moveServos — Pan/Tilt 서보를 지정 각도로 이동하고 안정화를 기다린다.
 *
 * @param pan   Pan 각도 (0~180도)
 * @param tilt  Tilt 각도 (0~90도)
 *
 * SETTLE_MS 동안 대기하는 이유: 서보가 목표 위치에 도달한 직후에도
 * 기계적 진동이 남아 있다. 이 진동이 TSL2591 시야를 흔들면
 * 휘도 측정값이 튀므로 반드시 안정화 시간이 필요하다.
 */
void moveServos(int pan, int tilt) {
    panServo.write(pan);
    delay(MOVE_STAGGER_MS);  // Pan/Tilt 동시 구동으로 인한 순간 전류 피크 방지
    tiltServo.write(tilt);
    delay(SETTLE_MS);  // 서보 기계적 안정화 대기
}

/**
 * measureVIS — TSL2591에서 풀 휘도를 읽어 가시광선 성분(VIS)을 계산한다.
 *
 * @return  VIS 값 (게인·적분시간으로 정규화된 상대 광량). 음수가 될 수도 있다.
 *
 * getFullLuminosity()는 32비트 값 하나에 두 채널을 함께 담아 반환한다:
 *   - 하위 16비트(CH0): 가시광선 + 적외선을 모두 포함하는 "전체광" 채널
 *   - 상위 16비트(CH1): 적외선만 감지하는 채널
 *
 * VIS = (CH0 - CH1) / (TSL_GAIN_VAL × (TSL_INTEG_MS / 200))
 *   - CH0에서 CH1(적외선 성분)을 빼면 가시광선만 남는 근사값을 얻는다.
 *   - 분모는 게인과 적분시간에 따라 달라지는 카운트 값을 정규화해,
 *     설정값이 달라져도 같은 밝기에서 같은 VIS가 나오도록 맞춘다.
 *     (200은 기준 적분시간 200ms에 대한 정규화 상수)
 *   - 이 공식은 gshau/SQM_TSL2591 레퍼런스 프로젝트의 계산식을 따른다.
 */
float measureVIS() {
    uint32_t lum = tsl.getFullLuminosity();
    uint16_t ch0 = lum & 0xFFFF;   // 전체광(가시광선 + 적외선)
    uint16_t ch1 = lum >> 16;      // 적외선

    return (float)(ch0 - ch1) / (TSL_GAIN_VAL * (TSL_INTEG_MS / 200.0f));
}

/**
 * calcSQM — VIS 값을 SQM(mag/arcsec²)으로 변환한다.
 *
 * @param vis  measureVIS()가 반환한 가시광선 성분 값
 * @return     SQM 값 (mag/arcsec²). 유효하지 않으면 -1.0f.
 *
 * 공식: SQM = CAL_OFFSET - 1.086 * ln(vis)
 *   - 1.086 ≈ 2.5 / ln(10): Pogson 공식(등급 차 = -2.5 * log10(밝기 비))을
 *     자연로그 기준으로 환산한 계수. gshau/SQM_TSL2591 레퍼런스 프로젝트가
 *     사용하는 공식을 그대로 따른다.
 *   - vis(밝기)가 클수록 ln(vis)가 커져 SQM 값이 낮아진다
 *     (SQM은 낮을수록 밝은 하늘, 높을수록 어두운 하늘).
 *   - CAL_OFFSET(기본값 12.6)은 레퍼런스 프로젝트의 기본 캘리브레이션 상수이며,
 *     실측 후 기준 SQM계와 비교해 조정해야 한다.
 */
float calcSQM(float vis) {
    // vis가 0 이하이면 log() 정의역 오류 → 유효하지 않음을 -1로 표시
    if (vis <= 0.0f) {
        return -1.0f;
    }
    return CAL_OFFSET - 1.086f * log(vis);
}

// ─── setup ─────────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    Serial.println("[setup] 초기화 시작");

    // ESP32Servo는 ESP32 하드웨어 타이머를 사용한다.
    // 타이머 0, 1만 할당: 타이머 2, 3은 tone() 등 다른 라이브러리와 충돌
    // 가능성이 있어 2개만 명시적으로 예약한다.
    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);

    // 표준 아날로그 서보는 50 Hz PWM(20 ms 주기)으로 제어한다.
    // 펄스 폭 범위 500~2400 µs: 500 µs = 0°, 2400 µs = 180°.
    // 일반적인 서보보다 범위를 넓게(1000~2000 → 500~2400) 잡아
    // 실제 가동 범위를 최대한 활용한다.
    panServo.setPeriodHertz(50);
    panServo.attach(PAN_PIN, 500, 2400);  // GPIO12, setup() 이후라 안전

    tiltServo.setPeriodHertz(50);
    tiltServo.attach(TILT_PIN, 500, 2400);

    // 홈 포지션: Pan 90°(정면), Tilt 45°(45도 앙각)
    // 스캔 시작 전 알려진 위치로 복귀해 서보 상태를 초기화한다.
    moveServos(90, 45);
    Serial.println("[setup] 홈 포지션 (Pan:90, Tilt:45) 이동 완료");

    // TSL2591 I2C 초기화: ESP32 기본 I2C 핀(SDA=21, SCL=22) 사용
    Wire.begin();

    // tsl.begin()이 실패하면 배선/주소 문제로 센서와 통신할 수 없는 상태이다.
    // 이 상태로 계속 진행하면 측정값이 항상 0이 되어 잘못된 SQM이 출력되므로,
    // 여기서 멈추고 사용자가 배선을 확인하도록 안내한다.
    if (!tsl.begin()) {
        Serial.println("TSL2591 센서를 찾을 수 없습니다. 배선을 확인하세요.");
        while (1) {
            delay(1000);
        }
    }

    // 게인/적분시간 설정: config.h에 정의된 값 사용
    // (밝은 환경: GAIN_LOW + 100MS / 야간 측정: GAIN_MAX + 600MS)
    tsl.setGain(TSL_GAIN);
    tsl.setTiming(TSL_INTEG);

    // 센서 초기화 직후 1초 대기: 전원 안정화 및 첫 측정값의 노이즈 완화
    delay(1000);

    // I2C 1602 LCD 초기화: TSL2591과 같은 버스를 쓰지만 주소가 달라 충돌하지 않는다.
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("Pan-Tilt SQM");
    lcd.setCursor(0, 1);
    lcd.print("Scanning...");

    Serial.println("=== Pan-Tilt SQM 스캔 시작 ===");
}

// ─── loop ──────────────────────────────────────────────────────────────────

void loop() {
    // Pan: 0, 30, 60, 90, 120, 150, 180 → 7포인트
    // Tilt: 0, 15, 30                  → 3포인트
    // 합계: 7 × 3 = 21포인트

    // 전체 사이클의 평균 SQM 계산용 누적값
    // (vis <= 0이라 SQM이 유효하지 않은 포인트는 평균에서 제외한다)
    float sqmSum = 0.0f;
    int sqmCount = 0;
    int totalCount = 0;

    for (int pan = PAN_MIN; pan <= PAN_MAX; pan += ANGLE_STEP) {
        for (int tilt = TILT_MIN; tilt <= TILT_MAX; tilt += TILT_STEP) {

            // 1. 해당 격자 포인트로 이동 (내부에서 SETTLE_MS 대기)
            moveServos(pan, tilt);

            // 2. TSL2591 풀 휘도 측정 후 VIS(가시광선 성분) 계산
            float vis = measureVIS();

            // 3. SQM 계산
            float sqm = calcSQM(vis);

            // 4. 결과 출력
            totalCount++;
            char lcdLine2[LCD_COLS + 1];
            if (sqm < 0.0f) {
                // VIS 값이 0 이하인 경우 (낮에는 발생하지 않아야 함)
                Serial.printf("Pan:%3d, Tilt:%2d, VIS:%8.2f, SQM:N/A\n",
                              pan, tilt, vis);
                snprintf(lcdLine2, sizeof(lcdLine2), "SQM:N/A");
            } else {
                Serial.printf("Pan:%3d, Tilt:%2d, VIS:%8.2f, SQM:%.2f\n",
                              pan, tilt, vis, sqm);
                snprintf(lcdLine2, sizeof(lcdLine2), "SQM:%.2f", sqm);
                // 평균 계산용 누적 (N/A인 포인트는 제외)
                sqmSum += sqm;
                sqmCount++;
            }

            // LCD 1행: 현재 측정 각도, 2행: SQM 값 (16x2 한 화면에 표시)
            char lcdLine1[LCD_COLS + 1];
            snprintf(lcdLine1, sizeof(lcdLine1), "Pan:%3d Tilt:%2d", pan, tilt);
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print(lcdLine1);
            lcd.setCursor(0, 1);
            lcd.print(lcdLine2);
        }
    }

    // 스캔 완료 알림: 21포인트(7 pan × 3 tilt) 모두 측정 완료
    Serial.println("=== SCAN DONE (21 points) ===");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("SCAN DONE");
    lcd.setCursor(0, 1);
    lcd.print("21 points");
    delay(2000);  // "SCAN DONE" 화면을 잠시 보여준 뒤 평균 화면으로 전환

    // 평균 SQM 계산 및 표시 (N/A 포인트는 제외하고 평균)
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Avg SQM");
    lcd.setCursor(0, 1);
    if (sqmCount > 0) {
        float avgSqm = sqmSum / sqmCount;
        Serial.printf("=== 평균 SQM: %.2f (유효 %d/%d 포인트) ===\n",
                      avgSqm, sqmCount, totalCount);
        char lcdAvg[LCD_COLS + 1];
        snprintf(lcdAvg, sizeof(lcdAvg), "%.2f (%d/%d)", avgSqm, sqmCount, totalCount);
        lcd.print(lcdAvg);
    } else {
        Serial.println("=== 평균 SQM: 유효한 측정값 없음 ===");
        lcd.print("N/A");
    }

    // 홈 포지션 복귀: 서보 수명 보호 및 다음 사용 전 기준점 확인
    moveServos(90, 45);
    Serial.println("[loop] 홈 포지션 복귀 완료. 재실행 방지 대기 중...");

    // 재실행 방지: loop()는 Arduino 프레임워크가 자동으로 반복 호출하므로
    // 한 번 스캔 후 무한 대기로 진입해 의도치 않은 재스캔을 막는다.
    // 재스캔이 필요하면 ESP32를 리셋하거나 이 블록을 제거한다.
    while (true) {
        delay(1000);
    }
}
