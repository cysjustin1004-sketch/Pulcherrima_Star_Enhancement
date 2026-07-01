/**
 * servo_angle_test.ino
 *
 * Pan-Tilt SQM 프로젝트: 서보 가동 범위 수동 확인용 테스트 스케치
 *
 * 목적: 시리얼 모니터에 각도를 직접 입력하면 해당 서보를 그 각도로 즉시 이동시킨다.
 *       Pan/Tilt 각각 어디까지 끼긱거림 없이 도는지 직접 확인할 때 사용한다.
 *
 * 사용법 (시리얼 모니터, 115200 baud, 줄바꿈 "Newline" 설정):
 *   P90  → Pan 서보를 90도로 이동
 *   T45  → Tilt 서보를 45도로 이동
 *   (P 또는 T + 0~180 사이 숫자 입력 후 Enter)
 */

#include <ESP32Servo.h>

#define PAN_PIN  12   // Pan 서보(MG90S) 신호선
#define TILT_PIN 13   // Tilt 서보(SG90) 신호선

Servo panServo;
Servo tiltServo;

void setup() {
    Serial.begin(115200);
    delay(500);

    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);

    panServo.setPeriodHertz(50);
    panServo.attach(PAN_PIN, 500, 2400);

    tiltServo.setPeriodHertz(50);
    tiltServo.attach(TILT_PIN, 500, 2400);

    // 연결 즉시 자동으로 움직이지 않도록, 시작 시 별도 위치로 이동시키지 않는다.
    // 사용자가 P/T 명령을 입력해야만 서보가 움직인다.

    Serial.println("=== 서보 각도 수동 테스트 ===");
    Serial.println("입력 형식: P<각도> 또는 T<각도>  (예: P90, T45)");
    Serial.println("P = Pan 서보, T = Tilt 서보, 각도 범위 0~180");
}

void loop() {
    if (!Serial.available()) {
        return;
    }

    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() < 2) {
        return;
    }

    char axis = toupper(input.charAt(0));
    int angle = input.substring(1).toInt();

    if (angle < 0 || angle > 180) {
        Serial.println("각도는 0~180 사이여야 합니다.");
        return;
    }

    if (axis == 'P') {
        panServo.write(angle);
        Serial.printf("Pan -> %d도\n", angle);
    } else if (axis == 'T') {
        tiltServo.write(angle);
        Serial.printf("Tilt -> %d도\n", angle);
    } else {
        Serial.println("P 또는 T로 시작해야 합니다. (예: P90, T45)");
    }
}
