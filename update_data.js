// 파일명: update_data.js
// 경로: 깃허브 저장소 최상위 (main 브랜치 루트)

const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const KAKAO_API_KEY = "a6b27b6dab16c7e3459bb9589bf1269d";

function getLatestRound() {
    const firstDrawDate = new Date('2002-12-07T21:00:00+09:00');
    const now = new Date();
    const diff = now.getTime() - firstDrawDate.getTime();
    if (diff < 0) return 0;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function loadJsData(filepath, isDict) {
    if (!fs.existsSync(filepath)) return isDict ? {} : [];
    let content = fs.readFileSync(filepath, 'utf8');
    let start = isDict ? content.indexOf('{') : content.indexOf('[');
    if (start === -1) return isDict ? {} : [];
    let jsonStr = content.substring(start).trim();
    if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);
    try { return JSON.parse(jsonStr); } catch (e) { return isDict ? {} : []; }
}

function saveJsData(filepath, varName, data) {
    const jsonStr = JSON.stringify(data, null, 4);
    fs.writeFileSync(filepath, `const ${varName} = ${jsonStr};\n`, 'utf8');
}

// [핵심 변경] 깃허브 IP가 동행복권에서 차단될 경우를 완벽하게 대비하여
// 동행복권 웹 ➔ 동행복권 API ➔ 다음(Daum) 검색 ➔ 네이버 검색 순으로 4중 백업 파싱 로직 적용
async function fetchWinningNumbers(drawNo) {
    // 1순위: 동행복권 웹페이지
    try {
        const res = await axios.get(`https://dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${drawNo}`, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
        const $ = cheerio.load(res.data);
        const numbers = [];
        $('div.num.win span.ball_645').each((i, el) => numbers.push(parseInt($(el).text().trim(), 10)));
        if (numbers.length === 6) {
            const bonusStr = $('div.num.bonus span.ball_645').text().trim();
            if (bonusStr) { numbers.push(parseInt(bonusStr, 10)); return numbers; }
        }
    } catch (e) { console.log(`  [동행복권 웹 차단됨] ${e.message}`); }

    // 2순위: 동행복권 API
    try {
        const res = await axios.get(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drawNo}`, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
        if (res.data && res.data.returnValue === "success") {
            const nums = [];
            for (let i = 1; i <= 6; i++) nums.push(res.data[`drwtNo${i}`]);
            nums.push(res.data.bnusNo);
            return nums;
        }
    } catch (e) { console.log(`  [동행복권 API 차단됨] ${e.message}`); }

    // 3순위: 다음(Daum) 검색 (해외 IP 차단이 없어 깃허브 액션에서 가장 안전하게 동작)
    try {
        const res = await axios.get(`https://search.daum.net/search?w=tot&q=${encodeURIComponent(`로또 ${drawNo}회 당첨번호`)}`, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
        const text = res.data.replace(/<[^>]*>?/gm, ' ');
        const mainMatch = text.match(/(?:당첨번호|당첨 번호)\D{0,15}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})/);
        if (mainMatch) {
            const nums = mainMatch.slice(1, 7).map(n => parseInt(n, 10));
            const bonusMatch = text.match(/보너스\D{0,15}?(\d{1,2})(?!\d|등)/);
            if (bonusMatch) {
                const bonus = parseInt(bonusMatch[1], 10);
                if (!nums.includes(bonus)) { nums.push(bonus); return nums; }
            }
        }
    } catch (e) { console.log(`  [Daum 검색 에러] ${e.message}`); }

    // 4순위: 네이버 검색
    try {
        const res = await axios.get(`https://search.naver.com/search.naver?query=${encodeURIComponent(`로또 ${drawNo}회 당첨번호`)}`, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
        const text = res.data.replace(/<[^>]*>?/gm, ' ');
        const mainMatch = text.match(/(?:당첨번호|당첨 번호)\D{0,15}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})\D{1,5}?(\d{1,2})/);
        if (mainMatch) {
            const nums = mainMatch.slice(1, 7).map(n => parseInt(n, 10));
            const bonusMatch = text.match(/보너스\D{0,15}?(\d{1,2})(?!\d|등)/);
            if (bonusMatch) {
                const bonus = parseInt(bonusMatch[1], 10);
                if (!nums.includes(bonus)) { nums.push(bonus); return nums; }
            }
        }
    } catch (e) { console.log(`  [Naver 검색 에러] ${e.message}`); }

    return null;
}

// [수정됨] 1등 배출점 또한 동행복권 차단 시 포털 뉴스로 즉각 우회하는 백업 로직 통합
async function fetchStores(drawNo) {
    let stores = [];
    try {
        const res = await axios.get(`https://dhlottery.co.kr/store.do?method=topStore&pageGubun=L645&drwNo=${drawNo}`, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
        const $ = cheerio.load(res.data);
        $('table.tbl_data').eq(0).find('tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length >= 4) {
                const name = $(tds[1]).text().trim();
                const method = $(tds[2]).text().trim();
                const addr = $(tds[3]).text().trim();
                if (name && !name.includes('조회 결과가 없습니다')) {
                    stores.push({ n: name, m: method, a: addr, r: drawNo });
                }
            }
        });
        if (stores.length > 0) return stores;
    } catch (e) { console.log(`  [동행복권 배출점 차단됨] ${e.message}`); }

    console.log(`  ⚠️ 동행복권 직접 수집 불가. 포털 뉴스를 통해 우회 수집합니다.`);
    return await fetchStoresFromNews(drawNo);
}

async function fetchStoresFromNews(drawNo) {
    const storesMap = new Map();
    const queries = [`로또 ${drawNo}회 1등 배출점`, `로또 ${drawNo}회 1등 판매점`];
    const links = [];

    for (const q of queries) {
        try {
            const res = await axios.get(`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(q)}&sort=1`, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
            const $ = cheerio.load(res.data);
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && (href.includes('news.naver.com') || href.includes('n.news.naver.com')) && href.includes('article')) {
                    if (!links.includes(href)) links.push(href);
                }
            });
            if (links.length >= 3) break;
        } catch(e){}
    }

    if (links.length === 0) {
        for (const q of queries) {
            try {
                const res = await axios.get(`https://search.daum.net/search?w=news&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
                const $ = cheerio.load(res.data);
                $('a').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.includes('v.daum.net/v/')) {
                        if (!links.includes(href)) links.push(href);
                    }
                });
                if (links.length >= 3) break;
            } catch(e){}
        }
    }

    const blacklist = ["홈페이지", "뉴스", "기자", "기사", "동행복권", "인터넷", "판매점", "당첨", "연합뉴스"];
    for (const link of links.slice(0, 5)) {
        try {
            const res = await axios.get(link, { headers: { 'User-Agent': USER_AGENT }, timeout: 5000 });
            const $ = cheerio.load(res.data);
            const article = $('article').text() || $('#dic_area').text() || $('.article_view').text();
            if (!article) continue;

            const regex = /(?:▲|△|■|▶|●|\*|\-|[\d]+\.)\s*([가-힣\w\d&\/\s()+\-.,]+?)\s*\(([^)]+)\)/g;
            let match;
            while ((match = regex.exec(article)) !== null) {
                let p1 = match[1].trim();
                let p2 = match[2].trim();

                if (blacklist.some(b => p1.includes(b)) && p1.length < 10) continue;
                if (p1.length < 2 || p2.length < 2) continue;

                let name, addr;
                if (['시 ', '구 ', '군 ', '읍 ', '면 ', '리 '].some(x => p1.includes(x)) || /\d+-\d+/.test(p1)) {
                    name = p2; addr = p1;
                } else {
                    name = p1; addr = p2;
                }

                let method = "자동";
                const context = article.substring(Math.max(0, match.index - 80), match.index + 150);
                if (context.includes("수동")) method = "수동";
                if (context.includes("반자동")) method = "반자동";

                const key = `${name}|${addr}`;
                if (!storesMap.has(key)) {
                    storesMap.set(key, { n: name, m: method, a: addr, r: drawNo });
                }
            }
        } catch(e){}
    }
    return Array.from(storesMap.values());
}

async function geocode(address) {
    let addr = address.replace(/(\d+)억?/g, '$1').replace(/[.,\s]+$/, '').trim();
    try {
        const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`;
        const res = await axios.get(url, { headers: { 'Authorization': `KakaoAK ${KAKAO_API_KEY}` }, timeout: 5000 });
        const docs = res.data.documents;
        if (docs && docs.length > 0) {
            return { lat: parseFloat(docs[0].y), lng: parseFloat(docs[0].x) };
        }
    } catch (e) { }
    return { lat: 0.0, lng: 0.0 };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const historyFile = 'lotto_history_data.js';
    const dataFile = 'lotto_data.js';

    const latestRound = getLatestRound();
    if (latestRound === 0) return;

    console.log(`✅ 현재 최신 회차: ${latestRound}회`);

    const histData = loadJsData(historyFile, true);
    const storeData = loadJsData(dataFile, false);
    const existingStoreRounds = new Set(storeData.map(item => item.r));

    let unsavedUpdates = 0;
    const startRound = Math.max(1, latestRound - 5);

    for (let drawNo = startRound; drawNo <= latestRound; drawNo++) {
        const missingHist = !(drawNo.toString() in histData);
        const missingStore = !existingStoreRounds.has(drawNo);

        if (!missingHist && !missingStore) {
            console.log(`⏩ [${drawNo}회차] 데이터 정상 보유 (패스)`);
            continue;
        }

        console.log(`▶ [${drawNo}회차] 누락 확인. 데이터 수집 시작...`);

        if (missingHist) {
            const nums = await fetchWinningNumbers(drawNo);
            if (nums) {
                histData[drawNo.toString()] = nums;
                console.log(`  ✅ 당첨번호 복구 완료: ${nums}`);
                unsavedUpdates++;
            } else {
                console.log(`  ❌ 당첨번호 수집 실패 (모든 우회 경로 막힘)`);
            }
        }

        if (missingStore) {
            const stores = await fetchStores(drawNo);
            if (stores && stores.length > 0) {
                for (let st of stores) {
                    const isOnline = st.n.includes("인터넷") || st.m.includes("사이트") || st.n.toLowerCase().includes("dhlottery");
                    let lat = 0.0, lng = 0.0;
                    if (isOnline) {
                        st.n = "동행복권(dhlottery.co.kr)";
                        st.a = "서울특별시 서초구 남부순환로 2423 1층";
                        lat = 37.4831;
                        lng = 127.0225;
                    } else {
                        const coords = await geocode(st.a);
                        lat = coords.lat;
                        lng = coords.lng;
                    }
                    storeData.push({ r: drawNo, n: st.n, m: st.m, a: st.a, lat: lat, lng: lng, verified: isOnline });
                }
                console.log(`  ✅ 1등 판매점 ${stores.length}곳 복구 완료`);
                unsavedUpdates++;
            } else {
                console.log(`  ⚠️ 1등 배출점 정보가 아직 없거나 모두 차단되었습니다.`);
            }
        }

        if (drawNo < latestRound) {
            await sleep(1000);
        }
    }

    if (unsavedUpdates > 0) {
        storeData.sort((a, b) => b.r - a.r);
        saveJsData(historyFile, 'LOTTO_HISTORY', histData);
        saveJsData(dataFile, 'lottoData', storeData);
        console.log(`\n💾 새로운 데이터 기록 완료.`);
    } else {
        console.log(`\n🎉 업데이트할 내용이 없습니다.`);
    }
}

main().catch(err => console.error(err));
