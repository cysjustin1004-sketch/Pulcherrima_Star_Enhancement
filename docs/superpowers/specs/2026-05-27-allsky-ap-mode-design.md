# Allsky AP 모드 오프라인 운용 설계

**날짜**: 2026-05-27  
**상태**: 승인됨

---

## 개요

라즈베리파이에서 allsky-master를 실행하되, 인터넷에 연결하지 않고 WiFi AP(Access Point) 모드로 컴퓨터/스마트폰과 연결한다. 연결된 기기의 웹 브라우저에서 `http://192.168.32.1/allsky/` 로 접속해 실시간 카메라 이미지, 이미지 갤러리, 타임랩스 영상을 열람한다.

---

## 아키텍처

```
[라즈베리파이]
  wlan0 (AP 모드, 192.168.32.1)
  ├── hostapd  → WiFi AP 데몬 (기설정 완료)
  ├── dnsmasq  → DHCP 서버 (기설정 완료)
  ├── lighttpd → 웹 서버 (포트 80, 전체 인터페이스)
  └── allsky   → RPi Camera 캡처 → /tmp/allsky/ 이미지 저장

[컴퓨터 / 스마트폰]
  WiFi로 AP 접속 → 브라우저에서 http://192.168.32.1/allsky/ 접속
```

### 데이터 흐름

```
RPi Camera
  → allsky.sh (캡처)
  → saveImage.sh (처리 및 저장)
  → /home/pi/allsky/tmp/ (현재 이미지)
  → /home/pi/allsky/images/<날짜>/ (날짜별 아카이브)
  → lighttpd (웹 서버 서비스)
  → 브라우저 (http://192.168.32.1/allsky/)
```

---

## 전제 조건

- AP 모드 설정 완료 (https://with-rl.com 가이드 기준)
  - SSID: 사용자 설정값
  - Pi IP: 192.168.32.1
  - DHCP 범위: 192.168.32.2 ~ 192.168.32.10
- 카메라: Raspberry Pi 공식 카메라 (RPi Camera)
- allsky 미설치 상태

---

## 핵심 설계 원칙

인터넷 의존 기능(Aurora 예보, 버전 알림 등)은 **코드에서 제거하지 않는다**.  
대신 인터넷이 없을 때 **조용히 실패(graceful fail)** 하도록 수정한다.

- 인터넷 없음 → 해당 기능이 빈 칸으로 표시되거나 숨겨짐 (오류 없음)
- 나중에 랜선(eth0) 연결 시 → 자동으로 해당 기능 정상 동작

---

## 수정 범위 (3개 파일)

lighttpd는 기본적으로 전체 인터페이스(wlan0 포함)에서 서비스하므로 수정 불필요.

### 수정 파일 1: `html/allsky/getForecast.php`

**문제**:
- `file_get_contents(url)` 기본 타임아웃이 없어 인터넷 없을 때 최대 30초 대기 후 실패
- 실패 시 반환하는 WARNING 메시지에 외부 URL이 그대로 노출됨

**수정 내용**:
- `stream_context_create`로 HTTP 타임아웃 5초 설정
- 실패 시 URL 대신 사용자 친화적 메시지(`"인터넷 연결 없음"`) 반환

```php
<?php
$url = "https://services.swpc.noaa.gov/text/3-day-forecast.txt";
error_reporting(E_ALL ^ E_WARNING);

// 타임아웃 5초 설정 (AP 모드 오프라인 대응)
$ctx = stream_context_create(['http' => ['timeout' => 5]]);
$forecast = @file_get_contents($url, false, $ctx);

if ($forecast != "") {
    // 기존 파싱 로직 그대로 유지
    $stripStart = substr($forecast, strpos($forecast, "00-03UT"));
    $kpTable    = substr($stripStart, 0, strpos($stripStart, "Rationale") - 2);
    $rows       = explode("\n", $kpTable);
    foreach ($rows as $row => $data) {
        $noBrackets   = preg_replace("/\([^)]+\)/", "", $data);
        $dataFormatted = preg_replace('!\s+!', ' ', $noBrackets);
        $row_data     = explode(' ', $dataFormatted);
        $info[$row]['time'] = $row_data[0];
        $info[$row]['day1'] = $row_data[1];
        $info[$row]['day2'] = $row_data[2];
        $info[$row]['day3'] = $row_data[3];
    }
} else {
    // 인터넷 없을 때: URL 대신 간결한 메시지
    $info[0]['time'] = "WARNING: 인터넷 연결 없음";
}
echo json_encode($info);
?>
```

---

### 수정 파일 2: `scripts/utilities/getNewestAllskyVersion.sh`

**문제**:
- `curl` 명령에 타임아웃 옵션이 없어 인터넷 없을 때 수십 초 대기 후 오류 로그 기록
- 오류 발생 시 exit 1로 종료 → 상위 스크립트에서 불필요한 경고 발생

**수정 내용**:
- `curl`에 `--max-time 5` 옵션 추가 (5초 타임아웃)
- curl 실패 시 현재 설치 버전을 반환하고 exit 0으로 조용히 종료

변경 위치 (curl 호출 직후):
```bash
# 기존
if ! NEWEST_VERSION="$( curl --show-error --silent "${GIT_FILE}" 2>&1 )" ; then
    echo "${ME}: ERROR: Unable to get newest Allsky version: ${NEWEST_VERSION}."
    exit 1
fi

# 수정 후
if ! NEWEST_VERSION="$( curl --show-error --silent --max-time 5 "${GIT_FILE}" 2>&1 )" ; then
    # 인터넷 없음: 현재 버전을 반환하고 정상 종료
    echo "$( get_version )"
    exit 0
fi
```

---

### 수정 파일 3: `html/allsky/js/controller.js`

**문제**:
- Aurora 오버레이 이미지를 NOAA 서버에서 직접 로드할 때 인터넷 없으면 브라우저 콘솔에 네트워크 오류 발생
- `$http.get` 실패 시 에러 핸들러가 없어 Angular 오류 발생 가능

**수정 내용**:
- Aurora 이미지 로드 실패 시 빈 이미지로 대체하는 `.catch()` 핸들러 추가
- Aurora 예보(`getForecast.php`) 요청 실패 시 조용히 빈 상태 유지

변경 위치: `$http.get(url, ...)` 호출부에 에러 핸들러 추가:
```javascript
// 기존
$http.get(url, { ... })
    .then(function(response) { ... });

// 수정 후
$http.get(url, { ... })
    .then(function(response) { ... })
    .catch(function() {
        // 인터넷 없음: 조용히 무시
    });
```

---

## 설치 및 배포 절차

### 파일 준비 (이 Windows PC)
1. allsky-master.zip 압축 해제
2. 위 3개 파일 수정
3. 수정된 폴더를 zip으로 재압축

### 라즈베리파이로 전송
```
방법 A: WinSCP (GUI)
  - 호스트: 192.168.32.1, 사용자: pi
  - 드래그&드롭으로 전송

방법 B: scp 명령어 (PowerShell)
  scp allsky-master.zip pi@192.168.32.1:/home/pi/
```

### 라즈베리파이에서 설치
```bash
# 1. AP 모드 종료 후 인터넷 WiFi 연결
sudo systemctl stop hostapd dnsmasq

# 2. 일반 WiFi 연결 (또는 랜선)
sudo raspi-config  # Network Options → WiFi

# 3. allsky 압축 해제 및 설치
cd /home/pi
unzip allsky-master.zip
cd allsky-master
./install.sh

# 4. 설치 완료 후 AP 모드 복구
sudo systemctl start hostapd dnsmasq
```

### 접속 확인
- PC/스마트폰에서 AP WiFi 재접속
- 브라우저: `http://192.168.32.1/allsky/`

---

## 인터넷 연결 후 자동 동작하는 기능

| 기능 | 인터넷 없을 때 | 인터넷 있을 때 (랜선 eth0) |
|------|--------------|--------------------------|
| Aurora KP 예보 | 빈 칸 표시 | 자동 동작 |
| Aurora 오버레이 이미지 | 표시 안 됨 | 자동 동작 |
| 버전 업데이트 알림 | 표시 안 됨 | 자동 동작 |
| 실시간 카메라 이미지 | ✅ 정상 동작 | ✅ 정상 동작 |
| 이미지 갤러리 | ✅ 정상 동작 | ✅ 정상 동작 |
| 타임랩스 영상 | ✅ 정상 동작 | ✅ 정상 동작 |
| Keogram / Startrails | ✅ 정상 동작 | ✅ 정상 동작 |
| 별자리 오버레이 | ✅ 정상 동작 | ✅ 정상 동작 |
