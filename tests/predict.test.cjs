const test = require('node:test');
const assert = require('node:assert/strict');
const LottoPredictor = require('../predict.js');

const history = {};
for (let round = 1; round <= 120; round += 1) {
    const numbers = [];
    let cursor = (round * 7) % 45;
    while (numbers.length < 6) {
        const number = (cursor % 45) + 1;
        if (!numbers.includes(number)) numbers.push(number);
        cursor += 8;
    }
    history[round] = [...numbers.sort((a, b) => a - b), ((cursor + 3) % 45) + 1];
}

test('generated combinations preserve fixed and excluded boundaries', () => {
    const predictor = new LottoPredictor(history);
    const games = predictor.generateMultiple(5, {
        mode: 'mix',
        fixed: [3, 11],
        excluded: [1, 2, 4, 5, 6],
        sumMin: 80,
        sumMax: 200,
        oddCount: null,
        maxConsecutivePairs: 2
    });

    assert.equal(games.length, 5);
    games.forEach((game) => {
        assert.equal(game.length, 6);
        assert.equal(new Set(game).size, 6);
        assert.ok(game.includes(3));
        assert.ok(game.includes(11));
        assert.equal(game.some((number) => [1, 2, 4, 5, 6].includes(number)), false);
        assert.ok(game.every((number) => number >= 1 && number <= 45));
    });
});

test('analysis returns stable structural metrics', () => {
    const predictor = new LottoPredictor(history);
    const result = predictor.analyze([1, 7, 14, 23, 32, 45]);

    assert.equal(result.sum, 122);
    assert.equal(result.odd + result.even, 6);
    assert.equal(result.low + result.high, 6);
    assert.equal(result.numberDetails.length, 6);
    assert.equal(result.zones, 5);
    assert.ok(result.pairAffinity >= 0);
    assert.ok(result.balanceScore >= 0 && result.balanceScore <= 100);
});

test('advanced constraints reject overlapping or crowded shapes', () => {
    const predictor = new LottoPredictor(history);
    const options = {
        sumMin: 21,
        sumMax: 255,
        oddCount: null,
        highCount: null,
        maxConsecutivePairs: 1,
        maxSameEnding: 2,
        acMin: 4,
        acMax: 10,
        minZones: 3,
        maxLastOverlap: 1
    };

    assert.equal(predictor.isValidCandidate([1, 2, 3, 14, 25, 36], options), false);
    assert.equal(predictor.isValidCandidate([1, 11, 21, 31, 40, 45], options), false);
    assert.equal(predictor.isValidCandidate([1, 8, 16, 24, 33, 45], options), true);
});

test('pair and spread modes generate complete combinations', () => {
    const predictor = new LottoPredictor(history);
    ['pair', 'spread'].forEach((mode) => {
        const game = predictor.generate({
            mode,
            sumMin: 21,
            sumMax: 255,
            maxConsecutivePairs: 5,
            maxSameEnding: 6,
            acMin: 0,
            acMax: 10,
            minZones: 1,
            maxLastOverlap: 6
        });
        assert.equal(game.length, 6);
        assert.equal(new Set(game).size, 6);
    });
});

test('impossible conditions fail with a useful error', () => {
    const predictor = new LottoPredictor(history);
    assert.throws(() => predictor.generate({
        fixed: [1, 2, 3, 4, 5],
        excluded: Array.from({ length: 40 }, (_, index) => index + 6)
    }), /제외 번호가 너무 많아/);
});
