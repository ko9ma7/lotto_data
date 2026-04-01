/* 파일경로: predict.js */

class LottoPredictor {
    constructor(historyData = {}) {
        this.historyData = historyData;
        this.frequencyMap = new Map();
        this.recentFreqMap = new Map();
        
        for (let i = 1; i <= 45; i++) {
            this.frequencyMap.set(i, 0);
            this.recentFreqMap.set(i, 0);
        }
        
        this.analyzeHistory();
    }

    analyzeHistory() {
        if (!this.historyData || Object.keys(this.historyData).length === 0) return;

        const sortedRounds = Object.keys(this.historyData).map(Number).sort((a, b) => b - a);
        sortedRounds.forEach((drawNo, index) => {
            const numbers = this.historyData[drawNo];
            if (Array.isArray(numbers) && numbers.length >= 6) {
                const mainNumbers = numbers.slice(0, 6);
                mainNumbers.forEach(num => {
                    if (this.frequencyMap.has(num)) this.frequencyMap.set(num, this.frequencyMap.get(num) + 1);
                    if (index < 10 && this.recentFreqMap.has(num)) this.recentFreqMap.set(num, this.recentFreqMap.get(num) + 1);
                });
            }
        });
    }

    shuffle(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    generateSingle(algo) {
        let pool = new Set();
        const allNums = Array.from({length: 45}, (_, i) => i + 1);
        
        const sortedOverall = Array.from(this.frequencyMap.entries()).sort((a, b) => b[1] - a[1]);
        const sortedRecent = Array.from(this.recentFreqMap.entries()).sort((a, b) => b[1] - a[1]);

        // 데이터가 없으면 무조건 랜덤으로 Fallback
        if (sortedOverall.length === 0 || sortedOverall[0][1] === 0) algo = 'random';

        const hotOverall = sortedOverall.slice(0, 15).map(x => x[0]);
        const coldOverall = sortedOverall.slice(-15).map(x => x[0]);
        const hotRecent = sortedRecent.slice(0, 15).map(x => x[0]);

        if (algo === 'balanced') {
            this.shuffle(hotOverall).slice(0, 2).forEach(n => pool.add(n));
            this.shuffle(coldOverall).slice(0, 2).forEach(n => pool.add(n));
        } else if (algo === 'recent_trend') {
            this.shuffle(hotRecent).slice(0, 4).forEach(n => pool.add(n));
        } else if (algo === 'hot_cold') {
            this.shuffle(hotOverall).slice(0, 3).forEach(n => pool.add(n));
            this.shuffle(coldOverall).slice(0, 3).forEach(n => pool.add(n));
        }

        // 남은 자리는 전체에서 랜덤 추출
        let available = this.shuffle(allNums);
        for (let num of available) {
            if (pool.size >= 6) break;
            pool.add(num);
        }

        return Array.from(pool).slice(0, 6).sort((a, b) => a - b);
    }

    // 지정된 개수만큼 게임 생성
    generateMultiple(count, algo) {
        const games = [];
        for (let i = 0; i < count; i++) {
            games.push(this.generateSingle(algo));
        }
        return games;
    }

    getLatestDrawInfo() {
        if (!this.historyData || Object.keys(this.historyData).length === 0) return { drawNo: '알 수 없음' };
        const rounds = Object.keys(this.historyData).map(Number).sort((a, b) => b - a);
        return { drawNo: rounds[0] || '최신' };
    }
}

// 전역 객체화
window.predictor = new LottoPredictor(typeof LOTTO_HISTORY !== 'undefined' ? LOTTO_HISTORY : {});