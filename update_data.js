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
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        return isDict ? {} : [];
    }
}

function saveJsData(filepath, varName, data) {
    const jsonStr = JSON.stringify(data, null, 4);
    fs.writeFileSync(filepath, `const ${varName} = ${jsonStr};\n`, 'utf8');
}

// [핵심 변경] 차장님이 찾으신 레퍼런스와 동일하게 axios를 이용한 동행복권 당첨번호 HTML 직접 파싱 (방화벽 우회)
async function fetchWinningNumbers(drawNo) {
    const url = `https://dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${drawNo}`;
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 });
        const $ = cheerio.load(res.data);
        const numbers = [];
        $('div.num.win span.ball_645').each((i, el) => {
            numbers.push(parseInt($(el).text().trim(), 10));
        });
        if (numbers.length === 6) {
            const bonusStr = $('div.num.bonus span.ball_645').text().trim();
            if (bonusStr) {
                numbers.push(parseInt(bonusStr, 10));
                return numbers;
            }
        }
    } catch (e) { }
    return null;
}

// [핵심 변경] 불안정한 네이버 뉴스 크롤링을 완전히 폐기하고, 동행복권 공식 웹페이지의 '1등 배출점' 테이블을 직접 읽어오도록 개선
async function fetchStores(drawNo) {
    const url = `https://dhlottery.co.kr/store.do?method=topStore&pageGubun=L645&drwNo=${drawNo}`;
    try {
        const res = await axios.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 });
        const $ = cheerio.load(res.data);
        const stores = [];
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
        return stores;
    } catch (e) { }
    return [];
}

async function geocode(address) {
    let addr = address.replace(/(\d+)억?/g, '$1').replace(/[.,\s]+$/, '').trim();
    try {
        const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`;
        const res = await axios.get(url, {
            headers: { 'Authorization': `KakaoAK ${KAKAO_API_KEY}` },
            timeout: 5000
        });
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
                console.log(`  ❌ 당첨번호 수집 실패`);
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
                console.log(`  ⚠️ 1등 배출점 정보 업데이트 대기 중`);
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
