// scripts/updateData.js
const fs = require('fs');
const path = require('path');

// 기존 데이터 파일 경로
const dataFilePath = path.join(__dirname, '../data.json');

async function updateLottoData() {
  try {
    // 1. 기존 데이터 읽기
    let existingData = [];
    if (fs.existsSync(dataFilePath)) {
      const rawData = fs.readFileSync(dataFilePath, 'utf-8');
      existingData = JSON.parse(rawData);
    }

    // 2. 다음 수집할 회차 계산 (기존 데이터의 최신 회차 + 1)
    const lastRound = existingData.length > 0 ? existingData[0].round : 1218;
    const nextRound = lastRound + 1;

    // 3. 동행복권 공식 API 호출
    const response = await fetch(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${nextRound}`);
    const result = await response.json();

    // 4. API 결과가 'success'인 경우에만 데이터 추가
    if (result.returnValue === 'success') {
      const newData = {
        round: result.drwNo,
        date: result.drwNoDate,
        numbers: [result.drwtNo1, result.drwtNo2, result.drwtNo3, result.drwtNo4, result.drwtNo5, result.drwtNo6],
        bonus: result.bnusNo,
        estimated1stPrize: result.firstAccumamnt.toLocaleString() + '원', // 총 당첨금액으로 임시 대체
        locations: [] // API에서 판매점 정보는 제공하지 않으므로 빈 배열로 둠
      };

      // 새 데이터를 배열의 맨 앞에 추가
      existingData.unshift(newData);

      // 5. data.json 파일 덮어쓰기
      fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2), 'utf-8');
      console.log(`${nextRound}회차 데이터 업데이트 완료.`);
    } else {
      console.log(`${nextRound}회차 데이터가 아직 발표되지 않았거나 오류가 발생했습니다.`);
    }
  } catch (error) {
    console.error('데이터 업데이트 중 오류 발생:', error);
  }
}

updateLottoData();