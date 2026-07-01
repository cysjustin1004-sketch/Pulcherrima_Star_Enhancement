// ============================================================
// firebase.js — Firebase 초기화
//
// TODO: Firebase 콘솔에서 받은 config 값을 아래에 입력하세요.
//       프로젝트 설정 → 내 앱 → 웹 앱 → SDK 설정 및 구성
// ============================================================

const firebaseConfig = {
  apiKey:            "여기에_apiKey_입력",
  authDomain:        "여기에_authDomain_입력",
  databaseURL:       "여기에_databaseURL_입력",
  projectId:         "여기에_projectId_입력",
  storageBucket:     "여기에_storageBucket_입력",
  messagingSenderId: "여기에_messagingSenderId_입력",
  appId:             "여기에_appId_입력",
};

// Firebase SDK (CDN) 로드 확인 후 초기화
// — HTML에서 Firebase CDN 스크립트를 먼저 불러와야 합니다.
firebase.initializeApp(firebaseConfig);

const db = firebase.database();

// ─── DB 헬퍼 ───────────────────────────────────────────────

/** 경로 읽기 (1회) */
function dbGet(path) {
  return db.ref(path).get().then(snap => snap.val());
}

/** 경로 쓰기 */
function dbSet(path, value) {
  return db.ref(path).set(value);
}

/** 경로 업데이트 (부분 갱신) */
function dbUpdate(path, updates) {
  return db.ref(path).update(updates);
}

/** 경로에 항목 추가 (push — 자동 키 생성) */
function dbPush(path, value) {
  return db.ref(path).push(value);
}

/** 실시간 구독 */
function dbOn(path, callback) {
  db.ref(path).on('value', snap => callback(snap.val()));
}

/** 구독 해제 */
function dbOff(path) {
  db.ref(path).off();
}

/** 트랜잭션 (동시 수정 충돌 방지) */
function dbTransaction(path, updateFn) {
  return db.ref(path).transaction(updateFn);
}
