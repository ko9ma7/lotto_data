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
    assert.ok(result.balanceScore >= 0 && result.balanceScore <= 100);
});

test('impossible conditions fail with a useful error', () => {
    const predictor = new LottoPredictor(history);
    assert.throws(() => predictor.generate({
        fixed: [1, 2, 3, 4, 5],
        excluded: Array.from({ length: 40 }, (_, index) => index + 6)
    }), /제외 번호가 너무 많아/);
});
