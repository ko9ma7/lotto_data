class LottoPredictor {
    constructor(historyData = {}) {
        this.historyData = historyData;
        this.rounds = Object.keys(historyData)
            .map(Number)
            .filter(Number.isFinite)
            .sort((a, b) => b - a);
        this.latestRound = this.rounds[0] || 0;
        this.frequency = this.buildFrequency(this.rounds);
        this.recentFrequency = this.buildFrequency(this.rounds.slice(0, 20));
        this.gaps = this.buildGaps();
        this.pairFrequency = this.buildPairFrequency();
        this.drawMetrics = this.rounds.map((round) => {
            const numbers = this.getDraw(round);
            return {
                round,
                sum: numbers.reduce((total, number) => total + number, 0),
                odd: numbers.filter((number) => number % 2).length,
                ac: this.calculateAC(numbers)
            };
        });
    }

    getDraw(round) {
        const draw = this.historyData[round] || this.historyData[String(round)] || [];
        return Array.isArray(draw) ? draw.slice(0, 6).map(Number).sort((a, b) => a - b) : [];
    }

    buildFrequency(rounds) {
        const counts = Array(46).fill(0);
        rounds.forEach((round) => this.getDraw(round).forEach((number) => {
            if (number >= 1 && number <= 45) counts[number] += 1;
        }));
        return counts;
    }

    buildGaps() {
        const gaps = Array(46).fill(this.rounds.length);
        this.rounds.forEach((round, index) => this.getDraw(round).forEach((number) => {
            if (gaps[number] === this.rounds.length) gaps[number] = index;
        }));
        return gaps;
    }

    buildPairFrequency() {
        const pairs = Array.from({ length: 46 }, () => Array(46).fill(0));
        this.rounds.forEach((round) => {
            const draw = this.getDraw(round);
            for (let i = 0; i < draw.length; i += 1) {
                for (let j = i + 1; j < draw.length; j += 1) {
                    pairs[draw[i]][draw[j]] += 1;
                    pairs[draw[j]][draw[i]] += 1;
                }
            }
        });
        return pairs;
    }

    randomIndex(length) {
        if (length <= 1) return 0;
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const max = Math.floor(0x100000000 / length) * length;
            const buffer = new Uint32Array(1);
            do crypto.getRandomValues(buffer); while (buffer[0] >= max);
            return buffer[0] % length;
        }
        return Math.floor(Math.random() * length);
    }

    weightedPick(pool, weightFor) {
        const weighted = pool.map((number) => ({
            number,
            weight: Math.max(0.01, Number(weightFor(number)) || 0.01)
        }));
        const total = weighted.reduce((sum, item) => sum + item.weight, 0);
        let target = (this.randomIndex(1_000_000) / 1_000_000) * total;
        for (const item of weighted) {
            target -= item.weight;
            if (target <= 0) return item.number;
        }
        return weighted.at(-1).number;
    }

    getWeight(number, mode, selected = []) {
        const totalMax = Math.max(...this.frequency.slice(1), 1);
        const recentMax = Math.max(...this.recentFrequency.slice(1), 1);
        const frequencyScore = this.frequency[number] / totalMax;
        const recentScore = this.recentFrequency[number] / recentMax;
        const overdueScore = Math.min(this.gaps[number] / 25, 1);

        if (mode === 'trend') return 0.25 + recentScore * 1.75;
        if (mode === 'overdue') return 0.25 + overdueScore * 1.75;
        if (mode === 'mix') return 0.35 + frequencyScore * 0.55 + recentScore * 0.55 + overdueScore * 0.55;
        if (mode === 'pair') {
            if (!selected.length) return 1;
            const pairMax = Math.max(...selected.map((item) => this.pairFrequency[number][item]), 1);
            const pairAverage = selected.reduce((sum, item) => sum + this.pairFrequency[number][item], 0) / selected.length;
            return 0.35 + pairAverage / pairMax * 1.65;
        }
        if (mode === 'spread') {
            const zone = Math.floor((number - 1) / 10);
            const ending = number % 10;
            const zoneUsed = selected.some((item) => Math.floor((item - 1) / 10) === zone);
            const endingUsed = selected.some((item) => item % 10 === ending);
            return 1.8 - (zoneUsed ? 0.55 : 0) - (endingUsed ? 0.35 : 0);
        }
        if (mode === 'balanced') {
            const distanceFromMiddle = Math.abs(frequencyScore - 0.72);
            return 1.5 - distanceFromMiddle;
        }
        return 1;
    }

    normalizeNumbers(numbers) {
        return [...new Set((numbers || []).map(Number))]
            .filter((number) => Number.isInteger(number) && number >= 1 && number <= 45)
            .sort((a, b) => a - b);
    }

    isValidCandidate(numbers, options) {
        if (numbers.length !== 6 || new Set(numbers).size !== 6) return false;
        const sum = numbers.reduce((total, number) => total + number, 0);
        if (sum < options.sumMin || sum > options.sumMax) return false;
        const odd = numbers.filter((number) => number % 2).length;
        if (options.oddCount !== null && odd !== options.oddCount) return false;
        const high = numbers.filter((number) => number >= 23).length;
        if (options.highCount !== null && high !== options.highCount) return false;
        if (this.countConsecutivePairs(numbers) > options.maxConsecutivePairs) return false;
        const maxEndingCount = Math.max(...Object.values(numbers.reduce((counts, number) => {
            counts[number % 10] = (counts[number % 10] || 0) + 1;
            return counts;
        }, {})));
        if (maxEndingCount > options.maxSameEnding) return false;
        const ac = this.calculateAC(numbers);
        if (ac < options.acMin || ac > options.acMax) return false;
        const zones = new Set(numbers.map((number) => Math.floor((number - 1) / 10))).size;
        if (zones < options.minZones) return false;
        const latestDraw = this.getDraw(this.latestRound);
        const lastOverlap = numbers.filter((number) => latestDraw.includes(number)).length;
        if (lastOverlap > options.maxLastOverlap) return false;
        return true;
    }

    generate(options = {}) {
        const normalized = {
            mode: options.mode || 'balanced',
            fixed: this.normalizeNumbers(options.fixed).slice(0, 5),
            excluded: this.normalizeNumbers(options.excluded),
            sumMin: Number.isFinite(Number(options.sumMin)) ? Number(options.sumMin) : 100,
            sumMax: Number.isFinite(Number(options.sumMax)) ? Number(options.sumMax) : 180,
            oddCount: options.oddCount === '' || options.oddCount === null || options.oddCount === undefined
                ? null
                : Number(options.oddCount),
            highCount: options.highCount === '' || options.highCount === null || options.highCount === undefined
                ? null
                : Number(options.highCount),
            maxConsecutivePairs: Number.isFinite(Number(options.maxConsecutivePairs))
                ? Number(options.maxConsecutivePairs)
                : 2,
            maxSameEnding: Number.isFinite(Number(options.maxSameEnding)) ? Number(options.maxSameEnding) : 3,
            acMin: Number.isFinite(Number(options.acMin)) ? Number(options.acMin) : 0,
            acMax: Number.isFinite(Number(options.acMax)) ? Number(options.acMax) : 10,
            minZones: Number.isFinite(Number(options.minZones)) ? Number(options.minZones) : 1,
            maxLastOverlap: Number.isFinite(Number(options.maxLastOverlap)) ? Number(options.maxLastOverlap) : 6
        };
        const excluded = new Set(normalized.excluded.filter((number) => !normalized.fixed.includes(number)));
        const basePool = Array.from({ length: 45 }, (_, index) => index + 1)
            .filter((number) => !excluded.has(number) && !normalized.fixed.includes(number));

        if (basePool.length + normalized.fixed.length < 6) {
            throw new Error('제외 번호가 너무 많아 6개 조합을 만들 수 없습니다.');
        }

        for (let attempt = 0; attempt < 2500; attempt += 1) {
            const candidate = [...normalized.fixed];
            const pool = [...basePool];
            while (candidate.length < 6 && pool.length) {
                const picked = this.weightedPick(pool, (number) => this.getWeight(number, normalized.mode, candidate));
                candidate.push(picked);
                pool.splice(pool.indexOf(picked), 1);
            }
            candidate.sort((a, b) => a - b);
            if (this.isValidCandidate(candidate, normalized)) return candidate;
        }

        throw new Error('현재 조건을 동시에 만족하는 조합을 찾지 못했습니다. 고급 조건을 한두 단계 넓혀주세요.');
    }

    generateMultiple(count, options = {}) {
        const games = [];
        const seen = new Set();
        const targetCount = Math.max(1, Math.min(10, Number(count) || 1));
        let attempts = 0;
        while (games.length < targetCount && attempts < targetCount * 40) {
            attempts += 1;
            const game = this.generate(options);
            const key = game.join('-');
            if (!seen.has(key)) {
                seen.add(key);
                games.push(game);
            }
        }
        return games;
    }

    calculateAC(numbers) {
        const sorted = this.normalizeNumbers(numbers);
        const differences = new Set();
        for (let i = 0; i < sorted.length; i += 1) {
            for (let j = i + 1; j < sorted.length; j += 1) differences.add(sorted[j] - sorted[i]);
        }
        return Math.max(0, differences.size - (sorted.length - 1));
    }

    countConsecutivePairs(numbers) {
        const sorted = this.normalizeNumbers(numbers);
        return sorted.slice(1).filter((number, index) => number - sorted[index] === 1).length;
    }

    percentile(value, values) {
        if (!values.length) return 0;
        return Math.round(values.filter((item) => item <= value).length / values.length * 100);
    }

    analyze(numbers) {
        const selected = this.normalizeNumbers(numbers);
        if (selected.length !== 6) throw new Error('분석할 번호 6개를 선택해주세요.');

        const sum = selected.reduce((total, number) => total + number, 0);
        const odd = selected.filter((number) => number % 2).length;
        const high = selected.filter((number) => number >= 23).length;
        const ac = this.calculateAC(selected);
        const consecutivePairs = this.countConsecutivePairs(selected);
        const zones = new Set(selected.map((number) => Math.floor((number - 1) / 10))).size;
        const latestDraw = this.getDraw(this.latestRound);
        const lastOverlap = selected.filter((number) => latestDraw.includes(number)).length;
        const endingCounts = selected.reduce((map, number) => {
            const ending = number % 10;
            map[ending] = (map[ending] || 0) + 1;
            return map;
        }, {});
        let maxMatch = 0;
        let maxMatchRound = null;
        this.rounds.forEach((round) => {
            const match = this.getDraw(round).filter((number) => selected.includes(number)).length;
            if (match > maxMatch) {
                maxMatch = match;
                maxMatchRound = round;
            }
        });

        const notes = [];
        if (sum < 100 || sum > 180) notes.push('역대 조합에서 비교적 바깥쪽 합계 구간입니다.');
        if (odd === 0 || odd === 6) notes.push('홀수 또는 짝수 한쪽으로만 구성됐습니다.');
        if (high === 0 || high === 6) notes.push('낮은 수와 높은 수가 한쪽으로 치우쳤습니다.');
        if (consecutivePairs >= 2) notes.push('연속 번호 쌍이 두 개 이상 포함됐습니다.');
        if (Math.max(...Object.values(endingCounts)) >= 3) notes.push('같은 끝수가 세 개 이상 겹칩니다.');
        if (!notes.length) notes.push('주요 형태 지표가 과도하게 한쪽으로 치우치지 않았습니다.');

        const balanceScore = Math.max(0, Math.min(100,
            100
            - Math.abs(140 - sum) * 0.7
            - Math.abs(3 - odd) * 8
            - Math.abs(3 - high) * 6
            - Math.max(0, consecutivePairs - 1) * 8
            - Math.max(0, 7 - ac) * 4
        ));

        return {
            numbers: selected,
            sum,
            odd,
            even: 6 - odd,
            high,
            low: 6 - high,
            ac,
            consecutivePairs,
            zones,
            lastOverlap,
            pairAffinity: this.calculatePairAffinity(selected),
            sumPercentile: this.percentile(sum, this.drawMetrics.map((item) => item.sum)),
            maxMatch,
            maxMatchRound,
            balanceScore: Math.round(balanceScore),
            notes,
            numberDetails: selected.map((number) => ({
                number,
                total: this.frequency[number],
                recent20: this.recentFrequency[number],
                gap: this.gaps[number]
            }))
        };
    }

    calculatePairAffinity(numbers) {
        const selected = this.normalizeNumbers(numbers);
        const values = [];
        for (let i = 0; i < selected.length; i += 1) {
            for (let j = i + 1; j < selected.length; j += 1) {
                values.push(this.pairFrequency[selected[i]][selected[j]]);
            }
        }
        return values.length
            ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
            : 0;
    }

    getRankedNumbers(kind = 'hot', limit = 6) {
        const numbers = Array.from({ length: 45 }, (_, index) => index + 1);
        if (kind === 'cold') numbers.sort((a, b) => this.frequency[a] - this.frequency[b] || a - b);
        else if (kind === 'overdue') numbers.sort((a, b) => this.gaps[b] - this.gaps[a] || a - b);
        else numbers.sort((a, b) => this.frequency[b] - this.frequency[a] || a - b);
        return numbers.slice(0, limit);
    }
}

if (typeof window !== 'undefined') window.LottoPredictor = LottoPredictor;
if (typeof module !== 'undefined' && module.exports) module.exports = LottoPredictor;
