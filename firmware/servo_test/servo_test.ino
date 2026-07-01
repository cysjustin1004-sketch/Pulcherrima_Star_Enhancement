/**
 * servo_test.ino
 *
 * Pan-Tilt SQM 프로젝트 1단계: 서보모터 단독 테스트 스케치
 *
 * 목적: Pan(GPIO 12)과 Tilt(GPIO 13) 서보 배선과 동작을 검증한다.
 *       전체 시스템 통합 전에 서보가 제대로 연결되어 있는지 확인하기 위한
 *       임시 테스트 코드다.
 *
 * 하드웨어:
 *   - ESP32 DevKitC WROOM-32D V4 (USB-C)
 *   - Pan 서보 (MG90S): 신호선 → GPIO 12, VCC → 5V(Vin), GND → GND
 *   - Tilt 서보 (SG90): 신호선 → GPIO 13, VCC → 5V(Vin), GND → GND
 *
 * 참고: MG90S(금속기어)와 SG90(플라스틱기어)는 PWM 사양(50Hz, 500~2400µs)이
 *       동일하여 코드상 구분 없이 동일하게 제어한다.
 *
 * 라이브러리: ESP32Servo by Kevin Harrington
 *   Arduino IDE 라이브러리 매니저에서 "ESP32Servo" 검색 후 설치 필요.
 *   표준 Arduino Servo.h 는 ESP32에서 동작하지 않으므로 반드시 ESP32Servo 사용.
 */

#include <ESP32Servo.h>

// ── 핀 정의 ──────────────────────────────────────────────
// 상수로 분리해 두면 핀 번호를 변경할 때 한 곳만 수정하면 된다.
#define PAN_PIN  12   // Pan  서보 신호선 연결 핀
#define TILT_PIN 13   // Tilt 서보 신호선 연결 핀

// ── 서보 객체 ─────────────────────────────────────────────
// ESP32Servo 라이브러리가 제공하는 Servo 클래스 인스턴스.
// 전역으로 선언해야 setup/loop 양쪽에서 접근 가능하다.
Servo panServo;
Servo tiltServo;

// ── 대기 시간 상수 ────────────────────────────────────────
// 서보가 목표 각도에 완전히 도달할 때까지 기다리는 시간.
// MG90S/SG90 모두 사양상 60°/0.1s이므로 180° 이동에도 약 300ms면 충분하지만,
// 부하와 전원 변동을 감안해 여유 있게 1000ms(1초)로 설정.
#define MOVE_DELAY_MS 1000

// ════════════════════════════════════════════════════════
//  setup() — 1회 초기화
// ════════════════════════════════════════════════════════
void setup() {
  // 시리얼 모니터 초기화 (115200 baud)
  // Arduino IDE 시리얼 모니터의 baud rate 설정과 반드시 일치시켜야 한다.
  Serial.begin(115200);
  delay(500); // ESP32 부팅 직후 시리얼 안정화 대기

  Serial.println("=== 서보 테스트 시작 ===");
  Serial.print("Pan  핀: GPIO ");
  Serial.println(PAN_PIN);
  Serial.print("Tilt 핀: GPIO ");
  Serial.println(TILT_PIN);

  // ESP32Servo 라이브러리의 타이머 할당.
  // 서보 2개에 타이머 2개(0, 1)만 확보한다.
  // 불필요하게 모든 타이머(0~3)를 선점하면 이후 PWM 기능과 충돌할 수 있다.
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);

  // MG90S/SG90 표준 PWM 범위(500~2400 µs)로 서보를 핀에 연결.
  // attach(핀, 최소펄스µs, 최대펄스µs) — 범위를 명시하면
  // 각도 계산이 더 정확해지고 서보가 한계를 넘어 파손되는 것을 막는다.
  panServo.setPeriodHertz(50);            // MG90S 표준 PWM 주파수 50Hz
  // GPIO 12는 ESP32 부팅 시 스트래핑 핀으로 사용됨.
  // setup() 이후에 PWM을 시작하므로 부팅 간섭 없음 — 의도적으로 사용 중.
  panServo.attach(PAN_PIN, 500, 2400);    // Pan 서보(MG90S) 핀 연결

  tiltServo.setPeriodHertz(50);           // SG90 표준 PWM 주파수 50Hz
  tiltServo.attach(TILT_PIN, 500, 2400);  // Tilt 서보(SG90) 핀 연결

  // 초기 위치(90°, 중앙)로 이동 — 시작 시 갑작스러운 동작을 방지한다.
  panServo.write(90);
  tiltServo.write(90);
  delay(MOVE_DELAY_MS);

  Serial.println("초기화 완료. 테스트 루프를 시작합니다.");
  Serial.println("─────────────────────────────────");
}

// ════════════════════════════════════════════════════════
//  loop() — 반복 테스트 시퀀스
// ════════════════════════════════════════════════════════
void loop() {

  // ── Pan 서보 테스트 ─────────────────────────────────
  // 0° → 90° → 180° → 90° 순서로 이동하며
  // 전체 가동 범위와 복귀 동작을 확인한다.

  Serial.println("[Pan] 0도로 이동");
  panServo.write(0);
  delay(MOVE_DELAY_MS);

  Serial.println("[Pan] 90도(중앙)로 이동");
  panServo.write(90);
  delay(MOVE_DELAY_MS);

  Serial.println("[Pan] 180도로 이동");
  panServo.write(180);
  delay(MOVE_DELAY_MS);

  Serial.println("[Pan] 90도(중앙)로 복귀");
  panServo.write(90);
  delay(MOVE_DELAY_MS);

  Serial.println("─ Pan 시퀀스 완료 ─");

  // ── Tilt 서보 테스트 ────────────────────────────────
  // 0° → 45° → 90° → 45° 순서로 이동한다.
  // Tilt 축은 기구물 간섭 가능성이 있어 180°까지 이동하지 않고
  // 90°를 최대값으로 제한한다(필요 시 조정 가능).

  Serial.println("[Tilt] 0도로 이동");
  tiltServo.write(0);
  delay(MOVE_DELAY_MS);

  Serial.println("[Tilt] 45도로 이동");
  tiltServo.write(45);
  delay(MOVE_DELAY_MS);

  Serial.println("[Tilt] 90도(최대)로 이동");
  tiltServo.write(90);
  delay(MOVE_DELAY_MS);

  Serial.println("[Tilt] 45도로 복귀");
  tiltServo.write(45);
  delay(MOVE_DELAY_MS);

  Serial.println("─ Tilt 시퀀스 완료 ─");
  Serial.println("=== 루프 1회 완료. 재시작합니다. ===");
  Serial.println("─────────────────────────────────");

  // 다음 루프 시작 전 짧은 대기 — 두 시퀀스 사이의 구분을 명확히 한다.
  delay(MOVE_DELAY_MS);
}
