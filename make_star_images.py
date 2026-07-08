"""
별 강화하기 — 이미지 자동 생성 스크립트
Wikipedia에서 천문 사진을 받아 게임용 PNG로 가공합니다.
"""

import sys
import requests
import io
import os
import time
from PIL import Image, ImageEnhance, ImageFilter

# Windows 콘솔 인코딩 문제 방지
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "star-game", "images")
SIZE = 500  # 출력 해상도 (CSS에서 140px로 표시됨)

# 각 레벨별 Wikipedia 페이지 제목
WIKI_PAGES = {
    0:  "Orion Nebula",
    1:  "Horsehead Nebula",
    2:  "Pillars of Creation",
    3:  "HL Tauri",
    4:  "Zeta Puppis",
    5:  "Rigel",
    6:  "Eta Carinae",
    7:  "WR 104",
    8:  "Betelgeuse",
    9:  "UY Scuti",
    10: "SN 1987A",
    11: "Crab Nebula",
    12: "PSR B1919+21",
    13: "Crab Pulsar",
    14: "Magnetar",
    15: "Cygnus X-1",
    16: "HLX-1",
    # 25~29 : 트랙 종료 후 공통 구간(우리 은하 → 우주) — track 무관, star_25.png~star_29.png
    25: "Milky Way",
    26: "Local Group",
    27: "Virgo Cluster",
    28: "Laniakea Supercluster",
    29: "Observable universe",
}

HEADERS = {"User-Agent": "StarGameImageBot/1.0 (educational project)"}


def get_wikipedia_image_url(page_title: str) -> str | None:
    """Wikipedia 페이지의 대표 이미지 URL 가져오기 (재시도 포함)"""
    params = {
        "action": "query",
        "titles": page_title,
        "prop": "pageimages",
        "format": "json",
        "pithumbsize": 1000,
        "pilimit": 1,
    }
    for attempt in range(4):
        try:
            resp = requests.get(
                "https://en.wikipedia.org/w/api.php",
                params=params,
                headers=HEADERS,
                timeout=20,
            )
            if resp.status_code == 429 or len(resp.content) == 0:
                wait = (attempt + 1) * 5
                print(f"\n    속도 제한 감지 — {wait}초 대기...", end=" ", flush=True)
                time.sleep(wait)
                continue
            pages = resp.json().get("query", {}).get("pages", {})
            for page in pages.values():
                src = page.get("thumbnail", {}).get("source")
                if src:
                    return src
            return None  # 이미지 없음 (재시도 불필요)
        except Exception as e:
            wait = (attempt + 1) * 3
            print(f"\n    오류({e}) — {wait}초 대기...", end=" ", flush=True)
            time.sleep(wait)
    return None


def process_image(img_data: bytes) -> Image.Image:
    """이미지 가공: 정사각 크롭 → 색감 강화 → 원형 비네트 → 검정 배경"""
    img = Image.open(io.BytesIO(img_data)).convert("RGBA")

    # 1. 정사각 센터 크롭
    w, h = img.size
    min_dim = min(w, h)
    left = (w - min_dim) // 2
    top = (h - min_dim) // 2
    img = img.crop((left, top, left + min_dim, top + min_dim))
    img = img.resize((SIZE, SIZE), Image.LANCZOS)

    # 2. 색감 강화 (채도 · 대비 · 선명도)
    rgb = img.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.9)       # 채도 강하게
    rgb = ImageEnhance.Contrast(rgb).enhance(1.35)   # 대비
    rgb = ImageEnhance.Brightness(rgb).enhance(1.05) # 살짝 밝게
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.5)   # 선명도
    img = rgb.convert("RGBA")

    # 3. 원형 비네트 마스크 (중앙 선명 → 가장자리 부드럽게 페이드)
    mask = Image.new("L", (SIZE, SIZE), 0)
    pixels = mask.load()
    cx = cy = SIZE // 2
    fade_start = SIZE * 0.28   # 여기까지 완전 불투명
    max_r     = SIZE * 0.50   # 여기서 완전 투명

    for y in range(SIZE):
        for x in range(SIZE):
            r = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if r <= fade_start:
                pixels[x, y] = 255
            elif r <= max_r:
                ratio = (r - fade_start) / (max_r - fade_start)
                pixels[x, y] = int(255 * (1 - ratio) ** 1.5)  # 비선형 페이드
            else:
                pixels[x, y] = 0

    # 마스크 블러 → 가장자리 자연스럽게
    mask = mask.filter(ImageFilter.GaussianBlur(radius=14))

    r_ch, g_ch, b_ch, _ = img.split()
    img = Image.merge("RGBA", (r_ch, g_ch, b_ch, mask))

    # 4. 검정 배경에 합성
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    result = Image.alpha_composite(bg, img)
    return result.convert("RGB")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"출력 폴더: {OUTPUT_DIR}\n")

    success = 0
    fail = 0

    for level, page_title in WIKI_PAGES.items():
        out_path = os.path.join(OUTPUT_DIR, f"star_{level}.png")

        if os.path.exists(out_path):
            print(f"[SKIP] star_{level}.png 이미 존재")
            success += 1
            continue

        print(f"[{level:02d}] {page_title} ...", end=" ", flush=True)

        img_url = get_wikipedia_image_url(page_title)
        if not img_url:
            print("이미지 없음 (수동 추가 필요)")
            fail += 1
            time.sleep(0.5)
            continue

        try:
            img_data = requests.get(img_url, headers=HEADERS, timeout=20).content
            result = process_image(img_data)
            result.save(out_path, "PNG")
            print(f"완료")
            success += 1
        except Exception as e:
            print(f"실패 ({e})")
            fail += 1

        time.sleep(2.5)  # Wikipedia 서버 부하 방지

    print(f"\n=== 완료: {success}개 성공, {fail}개 실패 ===")
    if fail > 0:
        print("실패한 이미지는 수동으로 star-game/images/ 에 추가하세요.")


if __name__ == "__main__":
    main()
