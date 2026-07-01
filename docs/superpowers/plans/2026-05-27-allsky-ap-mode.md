# Allsky AP 모드 오프라인 운용 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** allsky-master.zip에서 인터넷 의존 코드를 최소 수정(3개 파일)하여 AP 모드 오프라인 환경에서 graceful하게 동작하도록 만들고, 수정된 파일을 라즈베리파이 전송용으로 패키징한다.

**Architecture:** allsky-master.zip을 Python으로 추출 → 3개 파일 수정 → `C:\Users\flyer\my-first-vibe\allsky-ap-mod\` 에 결과물 저장. 수정 범위: getForecast.php(타임아웃 추가), getNewestAllskyVersion.sh(curl 타임아웃+실패 처리), controller.js(aurora 이미지 오류 처리 + getForecast catch 추가).

**Tech Stack:** Python 3 (zipfile, shutil), Bash (라즈베리파이), PHP, JavaScript(AngularJS)

---

### Task 1: 작업 폴더 준비 및 zip 추출

**Files:**
- Create: `C:\Users\flyer\my-first-vibe\allsky-ap-mod\` (출력 폴더)
- Source: `C:\Users\flyer\OneDrive\문서\카카오톡 받은 파일\allsky-master.zip`

- [ ] **Step 1: 추출 스크립트 실행**

PowerShell에서 실행:
```powershell
cd "C:\Users\flyer\my-first-vibe"
python -c "
import zipfile, os, shutil

src_zip = r'C:\Users\flyer\OneDrive\문서\카카오톡 받은 파일\allsky-master.zip'
out_dir = r'C:\Users\flyer\my-first-vibe\allsky-ap-mod'

# 기존 폴더 있으면 삭제 후 재생성
if os.path.exists(out_dir):
    shutil.rmtree(out_dir)

with zipfile.ZipFile(src_zip, 'r') as z:
    z.extractall(out_dir)

print('추출 완료:', out_dir)
extracted = os.path.join(out_dir, 'allsky-master')
print('파일 수:', sum(len(f) for _, _, f in os.walk(extracted)))
"
```

- [ ] **Step 2: 추출 결과 확인**

```powershell
ls "C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master" | Select-Object Name
```

예상 출력 (다음 폴더/파일들이 보여야 함):
```
allsky.sh
config_repo
html
install.sh
scripts
src
variables.sh
version
```

---

### Task 2: getForecast.php 수정 (타임아웃 + 친화적 오류 메시지)

**Files:**
- Modify: `C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\html\allsky\getForecast.php`

**현재 코드 문제:**
- `file_get_contents($url)` 에 타임아웃 없음 → 인터넷 없을 때 최대 30초 대기 후 실패
- 실패 시 `"WARNING: Unable to get data from 'https://services.swpc.noaa.gov/...'"` 메시지에 외부 URL 노출

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\html\allsky\getForecast.php` 내용:

```php
<?php
$url = "https://services.swpc.noaa.gov/text/3-day-forecast.txt";
// Don't want warning messages to go into the web log for things like the server is down.
// We display a message to the user which is sufficient.
error_reporting(E_ALL ^ E_WARNING);

// AP 모드 오프라인 대응: 5초 타임아웃 설정
$ctx = stream_context_create([
    'http' => [
        'timeout' => 5,
    ]
]);
$forecast = @file_get_contents($url, false, $ctx);

if ($forecast != "") {
    $stripStart = substr($forecast, strpos($forecast, "00-03UT"));
    $kpTable    = substr($stripStart, 0, strpos($stripStart, "Rationale") -2 );
    $rows       = explode("\n", $kpTable);

    foreach($rows as $row => $data)
    {
        //get row data
        $noBrackets = preg_replace("/\([^)]+\)/","", $data);
        $dataFormatted = preg_replace('!\s+!', ' ', $noBrackets);
        $row_data = explode(' ', $dataFormatted);
        $info[$row]['time']  = $row_data[0];
        $info[$row]['day1']  = $row_data[1];
        $info[$row]['day2']  = $row_data[2];
        $info[$row]['day3']  = $row_data[3];
    }
} else {
    // AP 모드 오프라인 대응: URL 대신 간결한 메시지 반환
    // JavaScript의 WARNING 체크(substring(0,9) == "WARNING: ")와 호환 유지
    $info[0]['time'] = "WARNING: 인터넷 연결 없음 - Aurora 예보를 사용할 수 없습니다";
}
echo json_encode($info);
?>
```

- [ ] **Step 2: 수정 확인**

```powershell
python -c "
with open(r'C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\html\allsky\getForecast.php', encoding='utf-8') as f:
    content = f.read()
assert 'timeout' in content, 'timeout 없음!'
assert 'stream_context_create' in content, 'stream_context_create 없음!'
assert '인터넷 연결 없음' in content, '오류 메시지 없음!'
print('getForecast.php 수정 확인 완료')
"
```

예상 출력: `getForecast.php 수정 확인 완료`

---

### Task 3: getNewestAllskyVersion.sh 수정 (curl 타임아웃 + 실패 시 graceful 종료)

**Files:**
- Modify: `C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\scripts\utilities\getNewestAllskyVersion.sh`

**현재 코드 문제 (26~30번째 줄):**
```bash
if ! NEWEST_VERSION="$( curl --show-error --silent "${GIT_FILE}" 2>&1 )" ; then
    echo "${ME}: ERROR: Unable to get newest Allsky version: ${NEWEST_VERSION}."
    exit 1
fi
```
- curl에 타임아웃 없음 → 인터넷 없을 때 수십 초 대기
- 실패 시 exit 1 → 상위에서 오류 처리 필요

- [ ] **Step 1: Python으로 정확한 수정 적용**

```powershell
python -c "
path = r'C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\scripts\utilities\getNewestAllskyVersion.sh'
with open(path, encoding='utf-8') as f:
    content = f.read()

# 기존 curl 실패 처리 블록 교체
old = '''if ! NEWEST_VERSION=\"\$( curl --show-error --silent \"\${GIT_FILE}\" 2>&1 )\" ; then
	echo \"\${ME}: ERROR: Unable to get newest Allsky version: \${NEWEST_VERSION}.\"
	exit 1
fi'''

new = '''# AP 모드 오프라인 대응: 5초 타임아웃, 실패 시 현재 버전 반환 후 정상 종료
if ! NEWEST_VERSION=\"\$( curl --show-error --silent --max-time 5 \"\${GIT_FILE}\" 2>&1 )\" ; then
	# 인터넷 없음: 현재 설치 버전을 반환하고 조용히 종료
	echo \"\$( get_version )\"
	exit 0
fi'''

if old not in content:
    print('ERROR: 교체할 코드를 찾지 못함!')
    print('--- 파일 내 curl 라인 ---')
    for i, line in enumerate(content.split('\n'), 1):
        if 'curl' in line:
            print(f'{i}: {line}')
else:
    new_content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('getNewestAllskyVersion.sh 수정 완료')
"
```

- [ ] **Step 2: 수정 확인**

```powershell
python -c "
with open(r'C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\scripts\utilities\getNewestAllskyVersion.sh', encoding='utf-8') as f:
    content = f.read()
assert '--max-time 5' in content, '--max-time 5 없음!'
assert 'get_version' in content, 'get_version 없음!'
assert 'exit 0' in content, 'exit 0 없음!'
print('getNewestAllskyVersion.sh 수정 확인 완료')
"
```

예상 출력: `getNewestAllskyVersion.sh 수정 확인 완료`

---

### Task 4: controller.js 수정 (aurora 이미지 오류 + getForecast catch 추가)

**Files:**
- Modify: `C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\html\allsky\js\controller.js`

**수정 위치 1 (line 568): aurora 이미지 load 에러 핸들러**

현재 코드 - aurora 이미지 실패 시에도 allsky 이미지 오류처럼 표시하는 문제:
```javascript
    }).on('error', function(e) {
        if ($scope.messages.innerHTML == "") {
            console.log("GOT ERROR reading image");
            let message = "The image at <span style='color: white;'>";
```

수정 후 - aurora 이미지(`forecast-map`) 실패는 조용히 처리:
```javascript
    }).on('error', function(e) {
        // AP 모드 오프라인 대응: aurora 예보 이미지 로드 실패는 조용히 무시
        if (imageClass === 'forecast-map') {
            console.log("Aurora forecast image unavailable (no internet)");
            return;
        }
        if ($scope.messages.innerHTML == "") {
            console.log("GOT ERROR reading image");
            let message = "The image at <span style='color: white;'>";
```

**수정 위치 2 (line 810): getForecast .catch() 추가**

현재 코드:
```javascript
            $http.get("getForecast.php")
                .then(function (response) {
                    ...
                });
```

수정 후:
```javascript
            $http.get("getForecast.php")
                .then(function (response) {
                    ...
                })
                .catch(function () {
                    // AP 모드 오프라인 대응: getForecast.php 자체 실패 시 조용히 무시
                    console.log("Aurora forecast unavailable (no internet)");
                });
```

- [ ] **Step 1: Python으로 두 군데 수정 적용**

```powershell
python -c "
path = r'C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\html\allsky\js\controller.js'
with open(path, encoding='utf-8') as f:
    content = f.read()

# --- 수정 1: aurora 이미지 에러 핸들러 ---
old1 = '''	}).on('error', function(e) {
				if (\$scope.messages.innerHTML == \"\") {
					console.log(\"GOT ERROR reading image\");'''

new1 = '''	}).on('error', function(e) {
				// AP 모드 오프라인 대응: aurora 예보 이미지 로드 실패는 조용히 무시
				if (imageClass === 'forecast-map') {
					console.log(\"Aurora forecast image unavailable (no internet)\");
					return;
				}
				if (\$scope.messages.innerHTML == \"\") {
					console.log(\"GOT ERROR reading image\");'''

if old1 not in content:
    print('ERROR: 수정1 대상 코드를 찾지 못함!')
else:
    content = content.replace(old1, new1)
    print('수정 1 적용 완료')

# --- 수정 2: getForecast .catch() 추가 ---
old2 = '''\$http.get(\"getForecast.php\")
				.then(function (response) {
					\$scope.forecast = {};
					// If the 1st 'time' value begins with \"WARNING\", there was an error getting data.
					msg = response.data[0]['time'];
					if ((msg.substring(0,9) == \"WARNING: \") || response.data == \"\") {
						// 100 indicates warning
						\$scope.forecast[''] = 100;	// displays \"WARNING\"
						\$scope.forecast[msg.substring(9)] = -1; // displays msg
					} else {
						\$scope.forecast[getDay(0)] = getSum(response.data, \"day1\");
						\$scope.forecast[getDay(1)] = getSum(response.data, \"day2\");
						\$scope.forecast[getDay(2)] = getSum(response.data, \"day3\");
					}
				});'''

new2 = '''\$http.get(\"getForecast.php\")
				.then(function (response) {
					\$scope.forecast = {};
					// If the 1st 'time' value begins with \"WARNING\", there was an error getting data.
					msg = response.data[0]['time'];
					if ((msg.substring(0,9) == \"WARNING: \") || response.data == \"\") {
						// 100 indicates warning
						\$scope.forecast[''] = 100;	// displays \"WARNING\"
						\$scope.forecast[msg.substring(9)] = -1; // displays msg
					} else {
						\$scope.forecast[getDay(0)] = getSum(response.data, \"day1\");
						\$scope.forecast[getDay(1)] = getSum(response.data, \"day2\");
						\$scope.forecast[getDay(2)] = getSum(response.data, \"day3\");
					}
				})
				.catch(function () {
					// AP 모드 오프라인 대응: getForecast.php 자체 실패 시 조용히 무시
					console.log(\"Aurora forecast unavailable (no internet)\");
				});'''

if old2 not in content:
    print('ERROR: 수정2 대상 코드를 찾지 못함!')
else:
    content = content.replace(old2, new2)
    print('수정 2 적용 완료')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('controller.js 저장 완료')
"
```

- [ ] **Step 2: 수정 확인**

```powershell
python -c "
with open(r'C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master\html\allsky\js\controller.js', encoding='utf-8') as f:
    content = f.read()
assert \"imageClass === 'forecast-map'\" in content, 'aurora 이미지 에러 핸들러 없음!'
assert \".catch(function ()\" in content, '.catch() 없음!'
print('controller.js 수정 확인 완료')
"
```

예상 출력: `controller.js 수정 확인 완료`

---

### Task 5: 전송용 zip 패키징 및 설치 가이드 생성

**Files:**
- Create: `C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master-ap.zip` (전송용 zip)
- Create: `C:\Users\flyer\my-first-vibe\allsky-ap-mod\설치가이드.txt`

- [ ] **Step 1: 전송용 zip 생성**

```powershell
python -c "
import zipfile, os

src_dir = r'C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master'
out_zip = r'C:\Users\flyer\my-first-vibe\allsky-ap-mod\allsky-master-ap.zip'

with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, os.path.dirname(src_dir))
            zf.write(file_path, arcname)

size_mb = os.path.getsize(out_zip) / 1024 / 1024
print(f'패키징 완료: {out_zip}')
print(f'파일 크기: {size_mb:.1f} MB')
"
```

- [ ] **Step 2: 설치 가이드 생성**

`C:\Users\flyer\my-first-vibe\allsky-ap-mod\설치가이드.txt` 생성:

```powershell
@'
=== Allsky AP 모드 설치 가이드 ===

[ 1단계: 이 파일(allsky-master-ap.zip)을 라즈베리파이로 전송 ]

방법 A - WinSCP 사용 (GUI):
  1. WinSCP 설치: https://winscp.net/
  2. 새 세션: SFTP, 호스트 192.168.32.1, 사용자 pi
  3. allsky-master-ap.zip 을 /home/pi/ 로 드래그&드롭

방법 B - scp 명령어 (PowerShell):
  scp allsky-master-ap.zip pi@192.168.32.1:/home/pi/

[ 2단계: 라즈베리파이에서 - AP 모드 일시 중지 후 인터넷 연결 ]

  sudo systemctl stop hostapd dnsmasq
  # 그 후 raspi-config 로 일반 WiFi 연결 또는 랜선 연결

[ 3단계: 라즈베리파이에서 - allsky 설치 ]

  cd /home/pi
  unzip allsky-master-ap.zip
  cd allsky-master
  ./install.sh

[ 4단계: 라즈베리파이에서 - AP 모드 복구 ]

  sudo systemctl start hostapd dnsmasq
  # 또는 재부팅: sudo reboot

[ 5단계: 접속 확인 ]

  PC/스마트폰에서 AP WiFi 재접속
  브라우저: http://192.168.32.1/allsky/

=== 수정된 파일 목록 (3개) ===
- html/allsky/getForecast.php         : NOAA API 5초 타임아웃 추가
- html/allsky/js/controller.js        : aurora 이미지 오류 graceful 처리
- scripts/utilities/getNewestAllskyVersion.sh : GitHub 버전체크 실패 시 조용히 종료

=== 나중에 인터넷 추가 시 ===
  랜선(eth0)만 연결하면 Aurora 예보, 버전 알림 자동 동작
'@ | Out-File -Encoding utf8 "C:\Users\flyer\my-first-vibe\allsky-ap-mod\설치가이드.txt"
Write-Host "설치가이드.txt 생성 완료"
```

- [ ] **Step 3: 최종 결과물 확인**

```powershell
ls "C:\Users\flyer\my-first-vibe\allsky-ap-mod\" | Select-Object Name, Length
```

예상 출력:
```
Name                    Length
----                    ------
allsky-master           (폴더)
allsky-master-ap.zip    (수 MB)
설치가이드.txt
```
