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
