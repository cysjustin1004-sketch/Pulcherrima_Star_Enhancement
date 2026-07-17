// ============================================================
// notify.js — 새 메시지 / 친구 요청 실시간 알림 (로그인된 모든 화면 공통)
//
// index.html 전용이던 배틀 알림(showBattleNotifications, /api/battle/notifications —
// battleLogs에 seen:false로 쌓아뒀다가 폴링으로 소비하는 방식)과 동일한 패턴을
// 메시지·친구요청에도 적용하되, 페이지를 가리지 않고 뜨도록 공용 모듈로 분리했다.
//
// 의존성: game.js(apiCall), auth.js(getToken), 그리고 이 파일을 포함하는 각 페이지
// 자신의 showToast — 셋 다 이 스크립트보다 먼저 로드되어 있어야 한다(다른 페이지들도
// <script src="game.js">까지는 <head>에서 먼저 불러오고, showToast는 body 하단 인라인
// 스크립트에 있지만 실제 폴링은 아래에서 setInterval로 지연 실행되므로 문제없음).
// ============================================================

const GLOBAL_NOTIFY_POLL_MS = 10000; // 배틀 알림과 동일한 주기

let _msgNotifyRunning = false;
let _friendReqNotifyRunning = false;

async function pollMessageNotifications() {
  if (_msgNotifyRunning) return;
  _msgNotifyRunning = true;
  try {
    const res = await apiCall('/api/messages/notifications', {});
    if (!res.ok || !res.items || !res.items.length) return;

    for (const n of res.items) {
      const text = n.text || '';
      const preview = text.length > 24 ? text.slice(0, 24) + '…' : text;
      showToast(`${n.nickname}님: ${preview}`, 'toast-top');
      await new Promise(r => setTimeout(r, 2400)); // 토스트가 겹치지 않게 순차 표시
    }
  } finally {
    _msgNotifyRunning = false;
  }
}

async function pollFriendRequestNotifications() {
  if (_friendReqNotifyRunning) return;
  _friendReqNotifyRunning = true;
  try {
    const res = await apiCall('/api/friends/notifications', {});
    if (!res.ok || !res.items || !res.items.length) return;

    for (const n of res.items) {
      showToast(`${n.fromNickname}님이 친구 요청을 보냈습니다.`, 'toast-top');
      await new Promise(r => setTimeout(r, 2400));
    }
  } finally {
    _friendReqNotifyRunning = false;
  }
}

(function startGlobalNotifications() {
  if (!getToken()) return; // 로그인 상태가 아니면(예: 세션 만료) 폴링하지 않음

  pollMessageNotifications();
  pollFriendRequestNotifications();
  setInterval(() => {
    pollMessageNotifications();
    pollFriendRequestNotifications();
  }, GLOBAL_NOTIFY_POLL_MS);
})();
