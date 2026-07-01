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
