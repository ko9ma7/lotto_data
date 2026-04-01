# 파일명: colab_legacy_updater.py
# 코랩 좌측 파일 탭에 lotto_data.js, lotto_history_data.js 업로드 후 실행하세요.

import os
import re
import time
import json
import random
import requests
from bs4 import BeautifulSoup

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Safari/605.1.15"
]
KAKAO_API_KEY = "a6b27b6dab16c7e3459bb9589bf1269d"

def get_headers():
    return {"User-Agent": random.choice(USER_AGENTS), "Accept-Language": "ko-KR,ko;q=0.9"}

def load_js_data(filepath, is_dict):
    if not os.path.exists(filepath): return {} if is_dict else []
    with open(filepath, 'r', encoding='utf-8') as f: content = f.read()
    start = content.find('{') if is_dict else content.find('[')
    if start == -1: return {} if is_dict else []
    json_str = content[start:].strip()
    if json_str.endswith(';'): json_str = json_str[:-1]
    try: return json.loads(json_str)
    except: return {} if is_dict else []

def save_js_data(filepath, var_name, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(f"const {var_name} = ")
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.write(";\n")

# 최신 회차 탐색 (가장 빠르고 안전한 네이버 검색 우선)
def get_latest_round():
    try:
        url = "https://search.naver.com/search.naver?query=로또당첨번호"
        r = requests.get(url, headers=get_headers(), timeout=10)
        m = re.search(r'(\d+)회\s*당첨번호', r.text)
        if m: return int(m.group(1))
    except: pass
    print("❌ 인터넷 연결이나 네이버 접속이 원활하지 않습니다.")
    return 0

# 사용자님 원본 그대로: 네이버 검색 기반 당첨번호 수집
def fetch_winning_numbers_naver(draw_no):
    url = f"https://search.naver.com/search.naver?query={requests.utils.quote(f'로또 {draw_no}회 당첨번호')}"
    try:
        r = requests.get(url, headers=get_headers(), timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")
        text = soup.get_text(separator=" ")

        pattern = r'(?:당첨번호|당첨 번호)\D{0,15}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})'
        for m in re.finditer(pattern, text):
            nums = [int(m.group(i)) for i in range(1, 7)]
            if len(set(nums)) == 6:
                search_region = text[max(0, m.start()-100):m.end()+300]
                bonus = None
                bonus_patterns = [
                    r"보너스\s*번호는\s*['‘’\"“”](\d{1,2})",
                    r'보너스\s*번호\s*[:：]?\s*(?<!\d)(\d{1,2})(?!\d|등)',
                    r'보너스\D{0,15}?(?<!\d)(\d{1,2})(?!\d|등)'
                ]
                for bp in bonus_patterns:
                    bm = re.search(bp, search_region)
                    if bm:
                        bonus = int(bm.group(1))
                        break
                if bonus is None:
                    for bp in bonus_patterns:
                        bm = re.search(bp, text)
                        if bm:
                            bonus = int(bm.group(1))
                            break
                if bonus is not None and bonus not in nums:
                    nums.append(bonus)
                    return nums
    except: pass
    return None

# 사용자님 원본 그대로 + 최근 기사 기호(-, ▶, *)만 추가 반영
def fetch_stores_naver_news(draw_no):
    stores_map = {}
    queries = [f"로또 {draw_no}회 1등 배출점", f"로또 {draw_no}회 1등 판매점"]
    links = []

    for query in queries:
        url = f"https://search.naver.com/search.naver?where=news&query={requests.utils.quote(query)}&sort=1"
        try:
            r = requests.get(url, headers=get_headers(), timeout=10)
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all('a', href=True):
                href = a['href']
                if 'news.naver.com' in href and 'article' in href:
                    if href not in links: links.append(href)
            if len(links) >= 5: break
        except: continue

    if not links:
        return []

    links = links[:5]
    blacklist = ["홈페이지", "뉴스", "기자", "기사", "로또복권", "동행복권", "인터넷", "판매점", "당첨", "연합뉴스"]

    for link in links:
        try:
            nr = requests.get(link, headers=get_headers(), timeout=10)
            nr.encoding = 'utf-8'
            nsoup = BeautifulSoup(nr.text, "html.parser")
            content = nsoup.find('article', id='dic_area') or nsoup.find('div', id='dic_area')
            if not content: continue

            text = content.get_text(separator="\n")

            # 최근 뉴스에서 사용하는 특수기호(-, ▶, *, ●) 추가 반영
            matches = list(re.finditer(r'(?:▲|△|■|▶|●|\*|\-|[\d]+\.)\s*([가-힣\w\d&/\s()+\-.,]+?)\s*\(([^)]+)\)', text))

            for m in matches:
                p1, p2 = m.group(1).strip(), m.group(2).strip()
                if any(word in p1 for word in blacklist) and len(p1) < 10: continue
                if len(p1) < 2 or len(p2) < 2: continue

                # 주소와 상호명 뒤바뀜 보정 (사용자님 원본 로직)
                if any(x in p1 for x in ['시 ', '구 ', '군 ', '읍 ', '면 ', '리 ']) or re.search(r'\d+-\d+', p1):
                    name, addr = p2, p1
                else:
                    name, addr = p1, p2

                if any(w in name for w in ["홈페이지", "뉴스1", "연합뉴스", "기자"]): continue

                method = "자동"
                if "수동" in text[max(0, m.start()-80):m.end()+150]: method = "수동"
                if "반자동" in text[max(0, m.start()-80):m.end()+150]: method = "반자동"

                key = (name, addr)
                if key not in stores_map: stores_map[key] = method

            # 뉴스 과부하 방지를 위해 아주 짧은 딜레이만 줌
            time.sleep(random.uniform(0.3, 0.7))
        except: continue

    return [{"n": n, "a": a, "m": m, "r": draw_no} for (n, a), m in stores_map.items()]

def geocode(address):
    addr = re.sub(r"(\d+)억?", r"\1", address).rstrip("., ").strip()
    try:
        r = requests.get("https://dapi.kakao.com/v2/local/search/address.json", headers={"Authorization": "KakaoAK " + KAKAO_API_KEY}, params={"query": addr}, timeout=10)
        data = r.json()
        if data.get("documents"):
            return float(data["documents"][0]["y"]), float(data["documents"][0]["x"])
    except: pass
    return 0.0, 0.0

def main():
    history_file = 'lotto_history_data.js'
    data_file = 'lotto_data.js'

    if not os.path.exists(history_file) or not os.path.exists(data_file):
        print(f"❌ 코랩 파일 탭에 {history_file} 및 {data_file}을 업로드해주세요.")
        return

    latest_round = get_latest_round()
    if latest_round == 0: return

    print(f"✅ 현재 최신 회차: {latest_round}회")
    print(f"🔍 1회차부터 {latest_round}회차까지 내 데이터를 스캔하여 누락분을 채웁니다.\n")

    hist_data = load_js_data(history_file, is_dict=True)
    store_data = load_js_data(data_file, is_dict=False)

    # 내 데이터에 존재하는 판매점 회차 목록 세팅
    existing_store_rounds = set(item.get('r') for item in store_data if isinstance(item, dict) and 'r' in item)

    unsaved_updates = 0

    for draw_no in range(1, latest_round + 1):
        # 오직 내 데이터를 기준으로만 누락 여부 판단
        missing_hist = str(draw_no) not in hist_data
        missing_store = draw_no not in existing_store_rounds

        if not missing_hist and not missing_store:
            # 50회 단위로 생존 신고
            if draw_no % 50 == 0 or draw_no == 1:
                print(f"⏩ [{draw_no}회차] 데이터 정상 보유 (패스)")
            continue

        print(f"\n▶ [{draw_no}회차] 누락 확인. 데이터 수집 시작...")

        # 1. 당첨번호 수집
        if missing_hist:
            nums = fetch_winning_numbers_naver(draw_no)
            if nums:
                hist_data[str(draw_no)] = nums
                print(f"  ✅ 당첨번호 복구 완료: {nums}")
                unsaved_updates += 1
            else:
                print(f"  ❌ 당첨번호 기사 없음 (비워둠)")

        # 2. 1등 판매점 수집
        if missing_store:
            stores = fetch_stores_naver_news(draw_no)
            if stores:
                for st in stores:
                    is_online = "인터넷" in st["n"] or "사이트" in st["m"] or "dhlottery" in st["n"].lower()
                    if is_online:
                        st["n"], st["a"] = "동행복권(dhlottery.co.kr)", "서울특별시 서초구 남부순환로 2423 1층"
                        lat, lng = 37.4831, 127.0225
                    else:
                        lat, lng = geocode(st["a"])
                        time.sleep(0.1) # 카카오 API 속도 조절

                    store_data.append({"r": draw_no, "n": st["n"], "m": st["m"], "a": st["a"], "lat": lat, "lng": lng, "verified": is_online})

                print(f"  ✅ 1등 판매점 {len(stores)}곳 복구 완료")
                unsaved_updates += 1
            else:
                print("  ⚠️ 판매점 기사 없음 (비워둠)")

        # 40건의 새로운 데이터를 찾을 때마다 자동 저장
        if unsaved_updates >= 40:
            print(f"\n💾 (진행 중 자동 저장) 현재까지 찾은 누락분을 파일에 안전하게 기록했습니다.")
            store_data.sort(key=lambda x: x.get('r', 0) if isinstance(x, dict) else 0, reverse=True)
            save_js_data(history_file, 'LOTTO_HISTORY', hist_data)
            save_js_data(data_file, 'lottoData', store_data)
            unsaved_updates = 0

    # 전체 루프 종료 후 최종 저장
    if unsaved_updates > 0:
        print(f"\n💾 (최종 저장) 마지막 데이터를 파일에 안전하게 기록했습니다.")
        store_data.sort(key=lambda x: x.get('r', 0) if isinstance(x, dict) else 0, reverse=True)
        save_js_data(history_file, 'LOTTO_HISTORY', hist_data)
        save_js_data(data_file, 'lottoData', store_data)

    print("\n🎉 전체 스캔 및 데이터 보완이 완료되었습니다! 파일 탭에서 다운로드하여 사용하세요.")

if __name__ == "__main__":
    main()