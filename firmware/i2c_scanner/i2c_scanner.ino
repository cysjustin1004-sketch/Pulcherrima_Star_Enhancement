/**
 * i2c_scanner.ino
 *
 * Pan-Tilt SQM 프로젝트: I2C 주소 확인용 테스트 스케치
 *
 * 목적: I2C 버스(SDA=GPIO21, SCL=GPIO22)에 연결된 모든 장치의 주소를 출력한다.
 *       1602 LCD(I2C 백팩)의 정확한 주소(보통 0x27 또는 0x3F)를 확인하기 위해 사용한다.
 *       TSL2591(0x29)도 함께 연결되어 있다면 같이 검색되어야 정상이다.
 */

#include <Wire.h>

void setup() {
    Wire.begin();  // SDA=GPIO21, SCL=GPIO22 (ESP32 기본값)
    Serial.begin(115200);
    delay(500);
    Serial.println("=== I2C 스캐너 시작 ===");
}

void loop() {
    int found = 0;

    for (uint8_t addr = 1; addr < 127; addr++) {
        // beginTransmission/endTransmission으로 ACK 응답 여부만 확인한다.
        Wire.beginTransmission(addr);
        uint8_t error = Wire.endTransmission();

        if (error == 0) {
            Serial.printf("발견: 0x%02X\n", addr);
            found++;
        }
    }

    if (found == 0) {
        Serial.println("I2C 장치를 찾을 수 없습니다. 배선(SDA/SCL/VCC/GND)을 확인하세요.");
    } else {
        Serial.printf("총 %d개 장치 발견. (TSL2591=0x29, LCD 백팩=보통 0x27 또는 0x3F)\n", found);
    }

    Serial.println("─────────────────────────────────");
    delay(3000);  // 3초마다 재스캔
}
