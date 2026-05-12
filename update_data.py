# 파일명: update_data.py
# 경로: 깃허브 저장소 최상위 (main 브랜치 루트)

import os
import re
import json
import time
import random
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
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

def get_latest_round():
    try:
        first_draw_date = datetime(2002, 12, 7, 21, 0, 0)
        korea_time = datetime.utcnow() + timedelta(hours=9)
        delta = korea_time - first_draw_date
        current_round = int(delta.total_seconds() // (7 * 24 * 3600)) + 1
        return current_round
    except:
        return 0

def fetch_winning_numbers(draw_no):
    # [핵심 수정] 찾아주신 레퍼런스와 100% 동일한 방식: 동행복권 HTML 결과 페이지 직접 스크래핑
    url = f"https://dhlottery.co.kr/gameResult.do?method=byWin&drwNo={draw_no}"
    try:
        r = requests.get(url, headers=get_headers(), timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")

        # 레퍼런스의 태그 셀렉터(div.num.win span.ball_645) 그대로 적용
        balls = soup.select('div.num.win span.ball_645')
        if len(balls) == 6:
            nums = [int(ball.text.strip()) for ball in balls]
            
            # 보너스 번호 태그 셀렉터 적용
            bonus_ball = soup.select_one('div.num.bonus span.ball_645')
            if bonus_ball:
                nums.append(int(bonus_ball.text.strip()))
                return nums
    except: pass
    return None

def fetch_stores_news(draw_no):
    stores_map = {}
    queries = [f"로또 {draw_no}회 1등 배출점", f"로또 {draw_no}회 1등 판매점"]
    links = []
    
    # 1. 네이버 뉴스 우선 탐색
    for query in queries:
        url = f"https://search.naver.com/search.naver?where=news&query={requests.utils.quote(query)}&sort=1"
        try:
            r = requests.get(url, headers=get_headers(), timeout=5)
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all('a', href=True):
                href = a['href']
                if ('news.naver.com' in href or 'n.news.naver.com' in href) and 'article' in href:
                    if href not in links: links.append(href)
            if len(links) >= 3: break
        except: continue

    # 2. 다음 뉴스 탐색 (네이버가 차단했을 때 백업)
    if not links:
        for query in queries:
            url = f"https://search.daum.net/search?w=news&q={requests.utils.quote(query)}"
            try:
                r = requests.get(url, headers=get_headers(), timeout=5)
                soup = BeautifulSoup(r.text, "html.parser")
                for a in soup.find_all('a', href=True):
                    href = a['href']
                    if 'v.daum.net/v/' in href:
                        if href not in links: links.append(href)
                if len(links) >= 3: break
            except: continue

    if not links:
        print("  ⚠️ 포털(네이버/다음) 뉴스에서 1등 배출점 관련 기사를 찾지 못했습니다.")
        return []

    blacklist = ["홈페이지", "뉴스", "기자", "기사", "동행복권", "인터넷", "판매점", "당첨", "연합뉴스"]
    for link in links[:5]:
        try:
            nr = requests.get(link, headers=get_headers(), timeout=5)
            nr.encoding = 'utf-8'
            nsoup = BeautifulSoup(nr.text, "html.parser")
            
            content = nsoup.find('article') or nsoup.find('div', id='dic_area') or nsoup.find('div', class_='article_view')
            if not content: continue
            
            text = content.get_text(separator="\n")
            matches = list(re.finditer(r'(?:▲|△|■|▶|●|\*|\-|[\d]+\.)\s*([가-힣\w\d&/\s()+\-.,]+?)\s*\(([^)]+)\)', text))
            for m in matches:
                p1, p2 = m.group(1).strip(), m.group(2).strip()
                if any(word in p1 for word in blacklist) and len(p1) < 10: continue
                if len(p1) < 2 or len(p2) < 2: continue

                if any(x in p1 for x in ['시 ', '구 ', '군 ', '읍 ', '면 ', '리 ']) or re.search(r'\d+-\d+', p1):
                    name, addr = p2, p1
                else:
                    name, addr = p1, p2

                method = "자동"
                if "수동" in text[max(0, m.start()-80):m.end()+150]: method = "수동"
                if "반자동" in text[max(0, m.start()-80):m.end()+150]: method = "반자동"

                key = (name, addr)
                if key not in stores_map: stores_map[key] = method
        except: continue

    return [{"n": n, "a": a, "m": m, "r": draw_no} for (n, a), m in stores_map.items()]

def geocode(address):
    addr = re.sub(r"(\d+)억?", r"\1", address).rstrip("., ").strip()
    try:
        r = requests.get("https://dapi.kakao.com/v2/local/search/address.json", headers={"Authorization": "KakaoAK " + KAKAO_API_KEY}, params={"query": addr}, timeout=5)
        data = r.json()
        if data.get("documents"): return float(data["documents"][0]["y"]), float(data["documents"][0]["x"])
    except: pass
    return 0.0, 0.0

def main():
    history_file = 'lotto_history_data.js'
    data_file = 'lotto_data.js'

    latest_round = get_latest_round()
    if latest_round == 0: 
        print("❌ 회차 계산에 실패했습니다.")
        return

    print(f"✅ 현재 최신 회차: {latest_round}회")
    print("🔍 최근 5회차의 누락분만 빠르게 스캔합니다.\n")

    hist_data = load_js_data(history_file, is_dict=True)
    store_data = load_js_data(data_file, is_dict=False)
    existing_store_rounds = set(item.get('r') for item in store_data if isinstance(item, dict) and 'r' in item)

    unsaved_updates = 0
    
    start_round = max(1, latest_round - 5)

    for draw_no in range(start_round, latest_round + 1):
        missing_hist = str(draw_no) not in hist_data
        missing_store = draw_no not in existing_store_rounds

        if not missing_hist and not missing_store:
            print(f"⏩ [{draw_no}회차] 데이터 정상 보유 (패스)")
            continue

        print(f"▶ [{draw_no}회차] 누락 확인. 데이터 수집 시작...")

        if missing_hist:
            nums = fetch_winning_numbers(draw_no)
            if nums:
                hist_data[str(draw_no)] = nums
                print(f"  ✅ 당첨번호 복구 완료: {nums}")
                unsaved_updates += 1
            else:
                print(f"  ❌ 당첨번호 수집 실패 (웹페이지 크롤링 차단됨)")

        if missing_store:
            stores = fetch_stores_news(draw_no)
            if stores:
                for st in stores:
                    is_online = "인터넷" in st["n"] or "사이트" in st["m"] or "dhlottery" in st["n"].lower()
                    if is_online:
                        st["n"], st["a"] = "동행복권(dhlottery.co.kr)", "서울특별시 서초구 남부순환로 2423 1층"
                        lat, lng = 37.4831, 127.0225
                    else:
                        lat, lng = geocode(st["a"])

                    store_data.append({"r": draw_no, "n": st["n"], "m": st["m"], "a": st["a"], "lat": lat, "lng": lng, "verified": is_online})
                print(f"  ✅ 1등 판매점 {len(stores)}곳 복구 완료")
                unsaved_updates += 1

        # [핵심 추가] 서버 부담 완화 및 차단 방지를 위한 1초 대기 (마지막 회차 제외)
        if draw_no < latest_round:
            time.sleep(1)

    if unsaved_updates > 0:
        store_data.sort(key=lambda x: x.get('r', 0) if isinstance(x, dict) else 0, reverse=True)
        save_js_data(history_file, 'LOTTO_HISTORY', hist_data)
        save_js_data(data_file, 'lottoData', store_data)
        print("\n💾 새로운 데이터가 파일에 안전하게 기록되었습니다.")
    else:
        print("\n🎉 모든 데이터가 최신 상태입니다. 업데이트할 내용이 없습니다.")

if __name__ == "__main__":
    main()
