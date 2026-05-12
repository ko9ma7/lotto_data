# 파일명: update_data.py
# 경로: 깃허브 저장소 최상위 (main 브랜치 루트)

import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
KAKAO_API_KEY = "a6b27b6dab16c7e3459bb9589bf1269d"

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

# 동행복권 웹페이지 직접 스크래핑 (API 차단 방어)
def fetch_winning_numbers(draw_no):
    url = f"https://dhlottery.co.kr/gameResult.do?method=byWin&drwNo={draw_no}"
    try:
        r = requests.get(url, headers={'User-Agent': USER_AGENT}, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")
        
        balls = soup.select('div.num.win span.ball_645')
        if len(balls) == 6:
            nums = [int(ball.text.strip()) for ball in balls]
            bonus_ball = soup.select_one('div.num.bonus span.ball_645')
            if bonus_ball:
                nums.append(int(bonus_ball.text.strip()))
                return nums
    except: pass
    return None

# 불안정한 포털 검색 대신 동행복권 공식 1등 배출점 웹페이지 직접 조회
def fetch_stores(draw_no):
    url = f"https://dhlottery.co.kr/store.do?method=topStore&pageGubun=L645&drwNo={draw_no}"
    stores = []
    try:
        r = requests.get(url, headers={'User-Agent': USER_AGENT}, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")
        
        rows = soup.select('table.tbl_data tbody tr')
        for row in rows:
            tds = row.find_all('td')
            if len(tds) >= 4:
                name = tds[1].text.strip()
                method = tds[2].text.strip()
                addr = tds[3].text.strip()
                if name and '조회 결과가 없습니다' not in name:
                    stores.append({"n": name, "m": method, "a": addr, "r": draw_no})
    except: pass
    return stores

def geocode(address):
    addr = re.sub(r"(\d+)억?", r"\1", address).rstrip("., ").strip()
    try:
        url = f"https://dapi.kakao.com/v2/local/search/address.json"
        r = requests.get(url, headers={"Authorization": f"KakaoAK {KAKAO_API_KEY}"}, params={"query": addr}, timeout=5)
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
                print(f"  ❌ 당첨번호 수집 실패 (동행복권 접속 지연)")

        if missing_store:
            stores = fetch_stores(draw_no)
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
            else:
                print(f"  ⚠️ 동행복권에 아직 1등 배출점 정보가 올라오지 않았습니다.")

        # 서버 차단 방지를 위한 1초 대기
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
