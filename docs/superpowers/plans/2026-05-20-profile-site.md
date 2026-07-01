# 프로필 사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기북과학고 2학년 학생의 역동적 글래스모피즘 개인 프로필 단일 페이지를 `profile.html`로 제작한다.

**Architecture:** 단일 `profile.html` 파일에 CSS와 JS를 인라인으로 포함. 탭 전환은 Vanilla JS `switchTab()` 함수로 처리. 외부 의존성은 Google Fonts CDN만 사용한다.

**Tech Stack:** HTML5, CSS3 (backdrop-filter, clip-path, CSS animations), Vanilla JS, Google Fonts (Noto Sans KR)

---

## 파일 구조

| 경로 | 역할 |
|---|---|
| `profile.html` | 전체 사이트 (HTML + `<style>` + `<script>` 인라인) |

---

### Task 1: HTML 뼈대 + 헤더 + 탭 전환

**Files:**
- Create: `profile.html`

- [ ] **Step 1: 파일 생성 — HTML 뼈대 + 헤더 + 탭 골격 작성**

`profile.html`을 아래 내용으로 생성한다.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>내 프로필</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* ── SITE WRAPPER ── */
    .site {
      position: relative;
      min-height: 100vh;
      background: linear-gradient(150deg, #1e40af 0%, #1d4ed8 30%, #0ea5e9 65%, #38bdf8 100%);
      overflow: hidden;
    }

    /* ── HEADER ── */
    .site-header {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.1rem 2rem;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255,255,255,0.2);
    }

    .site-name {
      font-size: 1.15rem;
      font-weight: 900;
      color: #fff;
      letter-spacing: -0.01em;
    }

    .site-tabs {
      display: flex;
      gap: 0.2rem;
      background: rgba(0,0,0,0.2);
      border-radius: 999px;
      padding: 0.3rem;
    }

    .tab {
      padding: 0.4rem 1.1rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      color: rgba(255,255,255,0.65);
      cursor: pointer;
      transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
      white-space: nowrap;
      user-select: none;
    }
    .tab:hover { color: #fff; }
    .tab.active {
      background: rgba(255,255,255,0.92);
      color: #1d4ed8;
      box-shadow: 0 3px 12px rgba(0,0,0,0.25);
      transform: scale(1.04);
    }

    /* ── TAB CONTENT ── */
    .tab-content {
      position: relative;
      z-index: 10;
      padding: 2.5rem 2rem 4rem;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 1.1rem;
      animation: fadeUp 0.35s ease;
    }
    .tab-content.active { display: flex; }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="site" id="site">

    <!-- 헤더 -->
    <header class="site-header">
      <div class="site-name">내 이름 ✦</div>
      <nav class="site-tabs">
        <div class="tab active" onclick="switchTab('intro', this)">소개</div>
        <div class="tab" onclick="switchTab('gallery', this)">갤러리</div>
        <div class="tab" onclick="switchTab('links', this)">링크 모음</div>
      </nav>
    </header>

    <!-- 소개 탭 -->
    <section class="tab-content active" id="tab-intro">
      <p style="color:#fff">소개 (준비 중)</p>
    </section>

    <!-- 갤러리 탭 -->
    <section class="tab-content" id="tab-gallery">
      <p style="color:#fff">갤러리 (준비 중)</p>
    </section>

    <!-- 링크 모음 탭 -->
    <section class="tab-content" id="tab-links">
      <p style="color:#fff">링크 모음 (준비 중)</p>
    </section>

  </div>

  <script>
    function switchTab(name, el) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
      el.classList.add('active');
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: 브라우저로 확인**

`profile.html`을 브라우저에서 열어 다음을 확인한다.
- 파란 그라데이션 배경이 보인다
- 상단 헤더에 이름과 탭 3개가 보인다
- 탭 클릭 시 활성 탭이 흰 pill로 바뀐다
- 탭 클릭 시 내용이 전환된다

- [ ] **Step 3: 커밋**

```bash
git init
git add profile.html
git commit -m "feat: HTML skeleton with header and tab switching"
```

> git 저장소가 없으면 `git init` 생략하고 파일만 저장해도 무방.

---

### Task 2: 배경 효과 (블롭 + 사선 레이어)

**Files:**
- Modify: `profile.html` — `<style>` 블록과 `.site` 내부에 추가

- [ ] **Step 1: 블롭 CSS를 `<style>` 블록에 추가**

`@keyframes fadeUp { ... }` 바로 아래에 다음을 삽입한다.

```css
    /* ── BACKGROUND BLOBS ── */
    .blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(70px);
      opacity: 0.45;
      animation: drift 8s ease-in-out infinite alternate;
      pointer-events: none;
    }
    .blob-1 { width: 380px; height: 380px; background: #60a5fa; top: -120px; left: -80px; animation-delay: 0s; }
    .blob-2 { width: 300px; height: 300px; background: #a78bfa; bottom: -80px; right: -60px; animation-delay: -3s; }
    .blob-3 { width: 200px; height: 200px; background: #34d399; top: 30%; left: 50%; animation-delay: -5s; }

    @keyframes drift {
      from { transform: translate(0, 0) scale(1); }
      to   { transform: translate(30px, 20px) scale(1.08); }
    }

    /* ── SLASH ACCENTS ── */
    .slash-top {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 90px;
      background: rgba(255,255,255,0.05);
      clip-path: polygon(0 0, 100% 0, 100% 40%, 0 100%);
      pointer-events: none;
    }
    .slash-bottom {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 120px;
      background: rgba(255,255,255,0.07);
      clip-path: polygon(0 60%, 100% 0%, 100% 100%, 0% 100%);
      pointer-events: none;
    }
```

- [ ] **Step 2: HTML `.site` 내부 헤더 위에 블롭 + 사선 요소 추가**

`<header class="site-header">` 바로 앞에 삽입한다.

```html
    <!-- 배경 효과 -->
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
    <div class="slash-top"></div>
    <div class="slash-bottom"></div>
```

- [ ] **Step 3: 브라우저로 확인**

새로고침 후 다음을 확인한다.
- 파란/보라/초록 블러 원형이 배경에 보인다
- 블롭이 천천히 이동한다 (8초 주기)
- 상단·하단에 반투명 사선 레이어가 보인다
- 헤더·탭 전환은 이전과 동일하게 동작한다

- [ ] **Step 4: 커밋**

```bash
git add profile.html
git commit -m "feat: animated background blobs and slash accents"
```

---

### Task 3: 소개 탭

**Files:**
- Modify: `profile.html` — CSS 추가, `#tab-intro` 내용 교체

- [ ] **Step 1: 소개 탭 CSS를 `<style>` 블록에 추가**

`.slash-bottom { ... }` 블록 바로 아래에 삽입한다.

```css
    /* ── 소개 탭 ── */
    .hero-top {
      display: flex;
      align-items: center;
      gap: 1.75rem;
      width: 100%;
      max-width: 520px;
    }

    .profile-avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 3px solid rgba(255,255,255,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.8rem;
      flex-shrink: 0;
      box-shadow: 0 0 0 6px rgba(255,255,255,0.1), 0 12px 30px rgba(0,0,0,0.25);
      animation: pulse-ring 3s ease-in-out infinite;
      overflow: hidden;
    }
    .profile-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }

    @keyframes pulse-ring {
      0%, 100% { box-shadow: 0 0 0 6px rgba(255,255,255,0.1), 0 12px 30px rgba(0,0,0,0.25); }
      50%       { box-shadow: 0 0 0 14px rgba(255,255,255,0.05), 0 12px 30px rgba(0,0,0,0.25); }
    }

    .hero-text {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .profile-name {
      font-size: 2rem;
      font-weight: 900;
      color: #fff;
      letter-spacing: -0.03em;
      line-height: 1.1;
      text-shadow: 0 2px 12px rgba(0,0,0,0.2);
    }

    .profile-school {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.75);
      font-weight: 500;
    }

    .badges {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.2rem;
    }

    .badge {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      background: rgba(255,255,255,0.18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 999px;
      padding: 0.3rem 0.8rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
    }

    .bio-card {
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.3);
      border-left: 3px solid rgba(255,255,255,0.6);
      border-radius: 18px;
      padding: 1.1rem 1.5rem;
      font-size: 0.92rem;
      line-height: 1.7;
      color: rgba(255,255,255,0.9);
      width: 100%;
      max-width: 520px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
```

- [ ] **Step 2: `#tab-intro` 내용 교체**

```html
    <!-- 소개 탭 -->
    <section class="tab-content active" id="tab-intro">
      <div class="hero-top">
        <div class="profile-avatar">
          <!-- 사진으로 교체하려면: <img src="사진경로.jpg" alt="프로필"> -->
          🙂
        </div>
        <div class="hero-text">
          <div class="profile-name">이름을 입력하세요</div>
          <div class="profile-school">경기북과학고등학교 2학년</div>
          <div class="badges">
            <span class="badge">🏃 운동</span>
            <span class="badge">🎮 게임</span>
          </div>
        </div>
      </div>
      <div class="bio-card">
        여기에 자기소개를 쓰세요. 좋아하는 것, 목표, 하고 싶은 말 등 자유롭게.
      </div>
    </section>
```

- [ ] **Step 3: 브라우저로 확인**

새로고침 후 소개 탭에서 다음을 확인한다.
- 프로필 사진(이모지)이 원형으로 보인다
- 박동하는 링 효과가 있다
- 이름·학교·뱃지가 옆에 배치된다
- 하단에 자기소개 카드가 보인다
- 카드 왼쪽에 흰 세로선이 있다

- [ ] **Step 4: 커밋**

```bash
git add profile.html
git commit -m "feat: intro tab with profile avatar, badges, bio card"
```

---

### Task 4: 갤러리 탭

**Files:**
- Modify: `profile.html` — CSS 추가, `#tab-gallery` 내용 교체

- [ ] **Step 1: 갤러리 CSS를 `<style>` 블록에 추가**

`.bio-card { ... }` 블록 바로 아래에 삽입한다.

```css
    /* ── 갤러리 탭 ── */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      width: 100%;
      max-width: 580px;
    }

    .gallery-item {
      aspect-ratio: 1;
      border-radius: 14px;
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      overflow: hidden;
      position: relative;
      transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s;
    }

    .gallery-item img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .gallery-item::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 60%);
      pointer-events: none;
    }

    .gallery-item:hover {
      transform: scale(1.05) translateY(-3px);
      box-shadow: 0 16px 40px rgba(0,0,0,0.35);
      border-color: rgba(255,255,255,0.5);
    }
```

- [ ] **Step 2: `#tab-gallery` 내용 교체**

```html
    <!-- 갤러리 탭 -->
    <section class="tab-content" id="tab-gallery">
      <div class="gallery-grid">
        <!-- 사진을 추가하려면 📷 대신 <img src="사진경로.jpg" alt="설명"> 삽입 -->
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
        <div class="gallery-item">📷</div>
      </div>
    </section>
```

- [ ] **Step 3: 브라우저로 확인**

갤러리 탭 클릭 후 다음을 확인한다.
- 3열 그리드로 9개 카드가 보인다
- 카드가 정사각형 비율이다
- 카드에 마우스를 올리면 살짝 커지고 위로 뜬다

- [ ] **Step 4: 커밋**

```bash
git add profile.html
git commit -m "feat: gallery tab with 3-column grid and hover effects"
```

---

### Task 5: 링크 모음 탭

**Files:**
- Modify: `profile.html` — CSS 추가, `#tab-links` 내용 교체

- [ ] **Step 1: 링크 모음 CSS를 `<style>` 블록에 추가**

`.gallery-item:hover { ... }` 블록 바로 아래에 삽입한다.

```css
    /* ── 링크 모음 탭 ── */
    .link-list {
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
      width: 100%;
      max-width: 440px;
    }

    .link-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.28);
      border-radius: 16px;
      padding: 0.9rem 1.2rem;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s, background 0.2s;
    }

    .link-item:hover {
      transform: translateX(6px);
      background: rgba(255,255,255,0.22);
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }

    .link-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      flex-shrink: 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .link-icon.ig { background: linear-gradient(135deg, #f43f5e, #a855f7); }
    .link-icon.tw { background: linear-gradient(135deg, #0f172a, #334155); border: 1px solid rgba(255,255,255,0.15); }
    .link-icon.etc { background: linear-gradient(135deg, #0284c7, #0ea5e9); }

    .link-text { flex: 1; }
    .link-platform { font-size: 0.72rem; color: rgba(255,255,255,0.55); font-weight: 500; }
    .link-handle   { font-size: 0.95rem; font-weight: 700; color: #fff; }

    .link-arrow {
      color: rgba(255,255,255,0.5);
      font-size: 1rem;
      transition: transform 0.2s, color 0.2s;
    }
    .link-item:hover .link-arrow { transform: translateX(4px); color: #fff; }
```

- [ ] **Step 2: `#tab-links` 내용 교체**

```html
    <!-- 링크 모음 탭 -->
    <section class="tab-content" id="tab-links">
      <div class="link-list">
        <a class="link-item" href="https://instagram.com/여기에_아이디" target="_blank" rel="noopener">
          <div class="link-icon ig">📸</div>
          <div class="link-text">
            <div class="link-platform">Instagram</div>
            <div class="link-handle">@여기에_아이디</div>
          </div>
          <span class="link-arrow">→</span>
        </a>
        <a class="link-item" href="https://twitter.com/여기에_아이디" target="_blank" rel="noopener">
          <div class="link-icon tw">🐦</div>
          <div class="link-text">
            <div class="link-platform">Twitter / X</div>
            <div class="link-handle">@여기에_아이디</div>
          </div>
          <span class="link-arrow">→</span>
        </a>
        <!-- 링크 추가하려면 아래 블록을 복사해서 href·platform·handle 수정 -->
        <a class="link-item" href="#" target="_blank" rel="noopener">
          <div class="link-icon etc">＋</div>
          <div class="link-text">
            <div class="link-platform">추가 링크</div>
            <div class="link-handle">플랫폼 이름</div>
          </div>
          <span class="link-arrow">→</span>
        </a>
      </div>
    </section>
```

- [ ] **Step 3: 브라우저로 확인**

링크 모음 탭 클릭 후 다음을 확인한다.
- 3개 링크 카드가 세로로 나열된다
- 마우스 올리면 오른쪽으로 살짝 밀린다
- 화살표(→)도 오른쪽으로 이동한다
- Instagram 카드는 분홍~보라, Twitter 카드는 다크, 추가 카드는 파란 아이콘이다

- [ ] **Step 4: 커밋**

```bash
git add profile.html
git commit -m "feat: links tab with glassmorphism cards and slide hover"
```

---

### Task 6: 반응형 (모바일 대응)

**Files:**
- Modify: `profile.html` — `<style>` 블록 하단에 미디어 쿼리 추가

- [ ] **Step 1: 미디어 쿼리를 `</style>` 바로 앞에 추가**

```css
    /* ── 반응형 ── */
    @media (max-width: 600px) {
      .site-header {
        padding: 0.9rem 1rem;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .tab {
        padding: 0.35rem 0.85rem;
        font-size: 0.8rem;
      }

      .tab-content {
        padding: 2rem 1rem 3rem;
      }

      /* 소개: 세로 배치 */
      .hero-top {
        flex-direction: column;
        align-items: center;
        text-align: center;
        max-width: 100%;
      }

      .badges { justify-content: center; }

      .profile-name { font-size: 1.6rem; }

      /* 갤러리: 2열 */
      .gallery-grid {
        grid-template-columns: repeat(2, 1fr);
        max-width: 100%;
      }

      /* 링크 */
      .link-list { max-width: 100%; }
    }
```

- [ ] **Step 2: 브라우저 개발자 도구로 모바일 확인**

브라우저에서 F12 → 반응형 모드(Ctrl+Shift+M) → 너비 375px로 설정 후 다음을 확인한다.
- 소개 탭: 프로필 사진이 위, 이름·뱃지가 아래(가운데 정렬)
- 갤러리 탭: 2열 그리드
- 링크 탭: 카드가 화면 폭에 맞게 늘어남
- 헤더 탭이 잘리지 않음

- [ ] **Step 3: 커밋**

```bash
git add profile.html
git commit -m "feat: responsive layout for mobile (≤600px)"
```

---

### Task 7: 개인 정보 입력 및 최종 확인

**Files:**
- Modify: `profile.html` — 이름, 링크 실제 값으로 교체

- [ ] **Step 1: 이름·링크를 실제 값으로 교체**

아래 항목을 실제 정보로 수정한다.

| 위치 | 교체 전 | 교체 후 |
|---|---|---|
| `.site-name` | `내 이름 ✦` | 본인 이름 또는 닉네임 |
| `.profile-name` | `이름을 입력하세요` | 본인 이름 |
| `.bio-card` | 자기소개 예시 텍스트 | 실제 자기소개 |
| Instagram `href` | `https://instagram.com/여기에_아이디` | 실제 URL |
| Instagram `.link-handle` | `@여기에_아이디` | 실제 아이디 |
| Twitter `href` | `https://twitter.com/여기에_아이디` | 실제 URL |
| Twitter `.link-handle` | `@여기에_아이디` | 실제 아이디 |

프로필 사진을 넣으려면 `.profile-avatar` 안의 🙂 이모지를 삭제하고 아래로 교체한다.

```html
<img src="사진파일명.jpg" alt="프로필 사진">
```

(사진 파일은 `profile.html`과 같은 폴더에 넣는다.)

- [ ] **Step 2: 전체 탭 최종 확인**

브라우저에서 모든 탭을 클릭하며 확인한다.
- 소개: 본인 이름·정보 표시, 프로필 링 애니메이션 동작
- 갤러리: 카드 9개 표시, 호버 효과 동작
- 링크: 실제 링크 클릭 시 새 탭으로 이동
- 모바일 너비(375px)에서 레이아웃 깨짐 없음

- [ ] **Step 3: 최종 커밋**

```bash
git add profile.html
git commit -m "feat: fill in personal info and finalize profile site"
```

---

## 완성 후 체크리스트

- [ ] 모든 탭 정상 전환
- [ ] 배경 블롭 애니메이션 동작
- [ ] 프로필 맥박 링 동작
- [ ] 갤러리 호버 효과 동작
- [ ] 링크 슬라이드 호버 동작
- [ ] 모바일(375px) 레이아웃 정상
- [ ] 링크 클릭 시 새 탭으로 이동
