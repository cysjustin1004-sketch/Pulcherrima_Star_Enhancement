#pragma once

#include <Adafruit_TSL2591.h>
#include <LiquidCrystal_I2C.h>

// 핀 설정
#define PAN_PIN       12    // Pan 서보(MG90S) PWM
#define TILT_PIN      13    // Tilt 서보(SG90) PWM
// TSL2591: SDA=GPIO21, SCL=GPIO22 (ESP32 기본 I2C 핀, Wire.begin() 기본값)

// 스캔 범위
#define PAN_MIN       0     // Pan 시작 각도
#define PAN_MAX       180   // Pan 끝 각도 (서보 전원 분리 후 0~180 전 구간 정상 동작 확인)
#define TILT_MIN      0     // Tilt 시작 각도 (지평선)
#define TILT_MAX      30    // Tilt 끝 각도
#define ANGLE_STEP    30    // Pan 스캔 간격 (도) — 변경 가능
#define TILT_STEP     15    // Tilt 스캔 간격 (도) — 변경 가능

// 타이밍
#define SETTLE_MS       1000  // 서보 이동 후 안정화 대기 (ms) — TSL2591 측정 안정성을 위해 여유 있게 설정
#define MOVE_STAGGER_MS 200   // Pan/Tilt를 동시에 구동하지 않도록 두는 시차 (ms) — 순간 전류 피크 분산

// TSL2591 게인/적분시간 — 초기 검증(밝은 환경)용 기본값
// 야간 측정 시 GAIN_MAX + INTEGRATIONTIME_600MS로 변경
#define TSL_GAIN      TSL2591_GAIN_LOW
#define TSL_GAIN_VAL  1.0f
#define TSL_INTEG     TSL2591_INTEGRATIONTIME_100MS
#define TSL_INTEG_MS  100.0f

// SQM 캘리브레이션
// 실측 후 기준 SQM계와 비교해 조정할 것
#define CAL_OFFSET    12.6f

// I2C LCD (1602) — TSL2591과 동일 I2C 버스(SDA=21, SCL=22)를 공유한다.
// 정확한 주소는 i2c_scanner 스케치로 확인할 것 (보통 0x27 또는 0x3F)
#define LCD_ADDR      0x27
#define LCD_COLS      16
#define LCD_ROWS      2
