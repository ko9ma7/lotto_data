(() => {
    'use strict';

    const STORAGE_KEY = 'lotto-compass-45-records-v1';
    const THEME_KEY = 'lotto-compass-45-theme';
    const VIEW_NAMES = new Set(['home', 'generator', 'analyzer', 'map', 'records']);
    const MODE_LABELS = {
        random: '완전 무작위',
        balanced: '누적 균형',
        trend: '최근 흐름',
        overdue: '장기 미출현',
        pair: '함께 나온 수',
        spread: '구간 분산',
        mix: '데이터 혼합'
    };

    const historyData = typeof LOTTO_HISTORY !== 'undefined' ? LOTTO_HISTORY : {};
    const storeData = typeof lottoData !== 'undefined' && Array.isArray(lottoData) ? lottoData : [];
    const predictor = new LottoPredictor(historyData);
    const state = {
        pickerMode: 'fixed',
        fixed: new Set(),
        excluded: new Set(),
        analysis: new Set(),
        generatedGames: [],
        records: loadRecords(),
        stores: aggregateStores(storeData),
        map: null,
        clusterer: null,
        markers: new Map(),
        userLocation: null,
        userMarker: null,
        userAccuracy: null,
        mapPane: 'map'
    };

    const elements = {};
    let toastTimer = null;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        cacheElements();
        applyInitialTheme();
        bindNavigation();
        bindTheme();
        bindGenerator();
        bindAnalyzer();
        bindRecords();
        bindHistorySearch();
        buildNumberGrid(elements.generatorNumberGrid, 'generator');
        buildNumberGrid(elements.analysisNumberGrid, 'analysis');
        renderDashboard();
        renderHistoryRows(predictor.rounds.slice(0, 10));
        renderRecords();
        startCountdown();
        routeTo(location.hash.slice(1) || 'home', false);

        if (predictor.rounds.length) {
            elements.dataStatus.textContent = `${predictor.latestRound}회까지`;
            elements.dataStatus.classList.add('ready');
        } else {
            elements.dataStatus.textContent = '데이터 없음';
            elements.dataStatus.classList.add('error');
        }
    }

    function cacheElements() {
        [
            'data-status', 'theme-toggle', 'latest-round', 'data-date-label', 'latest-balls',
            'countdown', 'metric-rounds', 'metric-stores', 'metric-records', 'metric-saved',
            'hot-numbers', 'cold-numbers', 'overdue-numbers', 'generator-form', 'game-count',
            'odd-count', 'sum-min', 'sum-max', 'high-count', 'max-last-overlap',
            'max-same-ending', 'max-consecutive-pairs', 'ac-min', 'ac-max', 'min-zones',
            'generator-number-grid', 'fixed-count',
            'excluded-count', 'picker-help', 'generator-error', 'generator-empty',
            'generated-games', 'result-mode-label', 'result-actions', 'copy-all',
            'download-ticket', 'analysis-number-grid', 'analysis-selected-count',
            'analysis-clear', 'analyze-button', 'analysis-result', 'my-location', 'store-search',
            'store-tier-filter', 'store-method-filter', 'store-sort', 'location-status',
            'unique-store-count', 'store-list', 'map-canvas', 'map-message', 'export-records',
            'import-records', 'clear-history', 'saved-list', 'history-record-list',
            'saved-count-label', 'toast', 'capture-ticket', 'round-search',
            'round-search-button', 'draw-history-list'
        ].forEach((id) => {
            const key = id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            elements[key] = document.getElementById(id);
        });
    }

    function applyInitialTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        const theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = theme;
    }

    function bindTheme() {
        elements.themeToggle.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            localStorage.setItem(THEME_KEY, next);
            elements.themeToggle.setAttribute('aria-label', next === 'dark' ? '밝은 화면으로 변경' : '어두운 화면으로 변경');
        });
    }

    function bindNavigation() {
        document.querySelectorAll('[data-view-link]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                routeTo(link.dataset.viewLink);
            });
        });
        document.querySelectorAll('[data-go]').forEach((button) => {
            button.addEventListener('click', () => routeTo(button.dataset.go));
        });
        window.addEventListener('hashchange', () => routeTo(location.hash.slice(1) || 'home', false));
    }

    function routeTo(requested, updateHash = true) {
        const viewName = VIEW_NAMES.has(requested) ? requested : 'home';
        document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${viewName}`));
        document.querySelectorAll('[data-view-link]').forEach((link) => {
            const active = link.dataset.viewLink === viewName;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        if (updateHash && location.hash !== `#${viewName}`) history.pushState(null, '', `#${viewName}`);
        if (viewName === 'map') initMap();
        window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        document.getElementById(`view-${viewName}`).querySelector('h1')?.focus({ preventScroll: true });
    }

    function renderDashboard() {
        elements.metricRounds.textContent = `${predictor.rounds.length.toLocaleString()}회`;
        elements.metricStores.textContent = `${storeData.length.toLocaleString()}건`;
        elements.metricRecords.textContent = state.records.history.length.toLocaleString();
        elements.metricSaved.textContent = state.records.saved.length.toLocaleString();
        elements.latestRound.textContent = predictor.latestRound || '-';
        elements.dataDateLabel.textContent = predictor.latestRound ? `${predictor.latestRound}회 기준` : '데이터 없음';

        const latest = predictor.getDraw(predictor.latestRound);
        const bonus = historyData[predictor.latestRound]?.[6] ?? historyData[String(predictor.latestRound)]?.[6];
        elements.latestBalls.innerHTML = ballRowHtml(latest, true)
            + (Number.isInteger(Number(bonus)) ? `<span class="plus">+</span>${ballHtml(Number(bonus), true)}` : '');
        renderRank(elements.hotNumbers, predictor.getRankedNumbers('hot'), (number) => `${predictor.frequency[number]}회`);
        renderRank(elements.coldNumbers, predictor.getRankedNumbers('cold'), (number) => `${predictor.frequency[number]}회`);
        renderRank(elements.overdueNumbers, predictor.getRankedNumbers('overdue'), (number) => `${predictor.gaps[number]}회 전`);
    }

    function renderRank(container, numbers, detailFor) {
        container.innerHTML = numbers.map((number) =>
            `<span class="rank-ball">${ballHtml(number)}<small>${detailFor(number)}</small></span>`
        ).join('');
    }

    function bindHistorySearch() {
        const find = () => {
            const round = Number(elements.roundSearch.value);
            if (!Number.isInteger(round) || !predictor.getDraw(round).length) {
                showToast('해당 회차 데이터를 찾지 못했습니다.');
                return;
            }
            renderHistoryRows([round]);
        };
        elements.roundSearchButton.addEventListener('click', find);
        elements.roundSearch.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                find();
            }
        });
    }

    function renderHistoryRows(rounds) {
        elements.drawHistoryList.innerHTML = rounds.map((round) => {
            const draw = historyData[round] || historyData[String(round)] || [];
            const mainNumbers = draw.slice(0, 6).map(Number).sort((a, b) => a - b);
            return `<div class="draw-row"><strong>${round}회</strong><div class="ball-row">${ballRowHtml(mainNumbers)}</div><span class="plus">+ ${Number(draw[6]) || '-'}</span></div>`;
        }).join('');
    }

    function bindGenerator() {
        document.querySelectorAll('[data-picker-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                state.pickerMode = button.dataset.pickerMode;
                document.querySelectorAll('[data-picker-mode]').forEach((tab) => {
                    const active = tab === button;
                    tab.classList.toggle('active', active);
                    tab.setAttribute('aria-selected', String(active));
                });
                elements.pickerHelp.textContent = state.pickerMode === 'fixed'
                    ? '반드시 넣을 번호를 최대 5개 선택하세요.'
                    : '조합에서 뺄 번호를 선택하세요.';
                renderGeneratorPicker();
            });
        });

        elements.generatorForm.addEventListener('submit', (event) => {
            event.preventDefault();
            generateGames();
        });
        elements.copyAll.addEventListener('click', copyAllGames);
        elements.downloadTicket.addEventListener('click', downloadTicket);
        document.querySelectorAll('[data-preset]').forEach((button) => {
            button.addEventListener('click', () => applyGeneratorPreset(button.dataset.preset));
        });
    }

    function applyGeneratorPreset(preset) {
        const values = {
            balanced: { sumMin: 100, sumMax: 180, odd: '', high: '', overlap: 1, ending: 2, consecutive: 1, acMin: 4, acMax: 10, zones: 3 },
            free: { sumMin: 21, sumMax: 255, odd: '', high: '', overlap: 6, ending: 6, consecutive: 5, acMin: 0, acMax: 10, zones: 1 },
            strict: { sumMin: 110, sumMax: 170, odd: 3, high: 3, overlap: 1, ending: 2, consecutive: 1, acMin: 7, acMax: 10, zones: 4 }
        }[preset];
        if (!values) return;
        elements.sumMin.value = values.sumMin;
        elements.sumMax.value = values.sumMax;
        elements.oddCount.value = values.odd;
        elements.highCount.value = values.high;
        elements.maxLastOverlap.value = values.overlap;
        elements.maxSameEnding.value = values.ending;
        elements.maxConsecutivePairs.value = values.consecutive;
        elements.acMin.value = values.acMin;
        elements.acMax.value = values.acMax;
        elements.minZones.value = values.zones;
        document.querySelectorAll('[data-preset]').forEach((button) => {
            button.classList.toggle('active', button.dataset.preset === preset);
        });
        elements.generatorError.hidden = true;
    }

    function buildNumberGrid(container, type) {
        const fragment = document.createDocumentFragment();
        for (let number = 1; number <= 45; number += 1) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'number-choice';
            button.textContent = number;
            button.dataset.number = String(number);
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', `${number}번 선택`);
            button.addEventListener('click', () => {
                if (type === 'generator') toggleGeneratorNumber(number);
                else toggleAnalysisNumber(number);
            });
            fragment.appendChild(button);
        }
        container.appendChild(fragment);
    }

    function toggleGeneratorNumber(number) {
        const current = state.pickerMode === 'fixed' ? state.fixed : state.excluded;
        const other = state.pickerMode === 'fixed' ? state.excluded : state.fixed;
        if (current.has(number)) current.delete(number);
        else {
            if (state.pickerMode === 'fixed' && state.fixed.size >= 5) {
                showToast('포함 번호는 최대 5개까지 선택할 수 있습니다.');
                return;
            }
            other.delete(number);
            current.add(number);
        }
        renderGeneratorPicker();
    }

    function renderGeneratorPicker() {
        elements.generatorNumberGrid.querySelectorAll('.number-choice').forEach((button) => {
            const number = Number(button.dataset.number);
            button.classList.toggle('fixed', state.fixed.has(number));
            button.classList.toggle('excluded', state.excluded.has(number));
            button.setAttribute('aria-pressed', String(state.fixed.has(number) || state.excluded.has(number)));
        });
        elements.fixedCount.textContent = state.fixed.size;
        elements.excludedCount.textContent = state.excluded.size;
    }

    function generateGames() {
        const submit = elements.generatorForm.querySelector('[type="submit"]');
        const mode = new FormData(elements.generatorForm).get('mode') || 'balanced';
        const sumMin = Number(elements.sumMin.value);
        const sumMax = Number(elements.sumMax.value);
        elements.generatorError.hidden = true;

        if (sumMin > sumMax) {
            showGeneratorError('최소 합계는 최대 합계보다 클 수 없습니다.');
            return;
        }
        if (Number(elements.acMin.value) > Number(elements.acMax.value)) {
            showGeneratorError('최소 AC는 최대 AC보다 클 수 없습니다.');
            return;
        }

        submit.disabled = true;
        submit.classList.add('loading');
        window.setTimeout(() => {
            try {
                const options = {
                    mode,
                    fixed: [...state.fixed],
                    excluded: [...state.excluded],
                    sumMin,
                    sumMax,
                    oddCount: elements.oddCount.value === '' ? null : Number(elements.oddCount.value),
                    highCount: elements.highCount.value === '' ? null : Number(elements.highCount.value),
                    maxLastOverlap: Number(elements.maxLastOverlap.value),
                    maxSameEnding: Number(elements.maxSameEnding.value),
                    maxConsecutivePairs: Number(elements.maxConsecutivePairs.value),
                    acMin: Number(elements.acMin.value),
                    acMax: Number(elements.acMax.value),
                    minZones: Number(elements.minZones.value)
                };
                state.generatedGames = predictor.generateMultiple(Number(elements.gameCount.value), options);
                renderGeneratedGames(mode);
                saveHistoryEntry(mode, options, state.generatedGames);
                renderRecords();
                renderDashboard();
            } catch (error) {
                showGeneratorError(error.message);
            } finally {
                submit.disabled = false;
                submit.classList.remove('loading');
            }
        }, 220);
    }

    function showGeneratorError(message) {
        elements.generatorError.textContent = message;
        elements.generatorError.hidden = false;
    }

    function renderGeneratedGames(mode) {
        elements.generatorEmpty.hidden = true;
        elements.resultActions.hidden = false;
        elements.resultModeLabel.textContent = MODE_LABELS[mode] || '번호 조합';
        elements.generatedGames.innerHTML = '';
        state.generatedGames.forEach((game, index) => {
            const analysis = predictor.analyze(game);
            const card = document.createElement('article');
            card.className = 'game-card';
            card.innerHTML = `
                <span class="game-index">${String.fromCharCode(65 + index)}</span>
                <div class="game-content">
                    <div class="ball-row">${ballRowHtml(game)}</div>
                    <div class="game-meta"><span>합 ${analysis.sum}</span><span>홀짝 ${analysis.odd}:${analysis.even}</span><span>AC ${analysis.ac}</span></div>
                </div>
                <div class="game-actions">
                    <button class="game-action save-game" type="button" aria-label="${index + 1}번 조합 저장"><svg><use href="#icon-bookmark"></use></svg></button>
                    <button class="game-action analyze-game" type="button" aria-label="${index + 1}번 조합 분석"><svg><use href="#icon-chart"></use></svg></button>
                </div>`;
            card.querySelector('.save-game').addEventListener('click', (event) => {
                const saved = toggleSavedGame(game, MODE_LABELS[mode]);
                event.currentTarget.classList.toggle('saved', saved);
            });
            card.querySelector('.analyze-game').addEventListener('click', () => useGameForAnalysis(game));
            elements.generatedGames.appendChild(card);
        });
    }

    function saveHistoryEntry(mode, options, games) {
        state.records.history.unshift({
            id: createId(),
            at: new Date().toISOString(),
            mode,
            options: {
                sumMin: options.sumMin,
                sumMax: options.sumMax,
                oddCount: options.oddCount,
                highCount: options.highCount,
                maxLastOverlap: options.maxLastOverlap,
                maxSameEnding: options.maxSameEnding,
                maxConsecutivePairs: options.maxConsecutivePairs,
                acMin: options.acMin,
                acMax: options.acMax,
                minZones: options.minZones,
                fixed: options.fixed,
                excluded: options.excluded
            },
            games: games.map((game) => [...game])
        });
        state.records.history = state.records.history.slice(0, 100);
        persistRecords();
    }

    function copyAllGames() {
        if (!state.generatedGames.length) return;
        const text = state.generatedGames.map((game, index) => `${String.fromCharCode(65 + index)}. ${game.join(', ')}`).join('\n');
        copyText(text, '생성 번호 전체를 복사했습니다.');
    }

    async function downloadTicket() {
        if (!state.generatedGames.length) return;
        if (typeof html2canvas !== 'function') {
            showToast('이미지 도구를 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.');
            return;
        }
        elements.captureTicket.innerHTML = `
            <h2>로또 나침반 45</h2>
            <p>${escapeHtml(elements.resultModeLabel.textContent)} · ${formatDate(new Date())}</p>
            ${state.generatedGames.map((game, index) => `<div class="ticket-game"><span>${String.fromCharCode(65 + index)}</span><div class="ball-row">${ballRowHtml(game, true)}</div></div>`).join('')}
            <footer>데이터 탐색·오락용 조합입니다. 당첨을 예측하거나 보장하지 않습니다.</footer>`;
        try {
            const canvas = await html2canvas(elements.captureTicket, { scale: 2, backgroundColor: '#F7F0DF' });
            const link = document.createElement('a');
            link.download = `lotto-compass-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('번호 이미지를 저장했습니다.');
        } catch {
            showToast('이미지 저장 중 문제가 생겼습니다.');
        }
    }

    function bindAnalyzer() {
        elements.analysisClear.addEventListener('click', () => {
            state.analysis.clear();
            renderAnalysisPicker();
            renderAnalysisEmpty();
        });
        elements.analyzeButton.addEventListener('click', analyzeSelection);
    }

    function toggleAnalysisNumber(number) {
        if (state.analysis.has(number)) state.analysis.delete(number);
        else {
            if (state.analysis.size >= 6) {
                showToast('분석 번호는 6개만 선택할 수 있습니다.');
                return;
            }
            state.analysis.add(number);
        }
        renderAnalysisPicker();
    }

    function renderAnalysisPicker() {
        elements.analysisNumberGrid.querySelectorAll('.number-choice').forEach((button) => {
            const selected = state.analysis.has(Number(button.dataset.number));
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        elements.analysisSelectedCount.textContent = state.analysis.size;
        elements.analyzeButton.disabled = state.analysis.size !== 6;
    }

    function useGameForAnalysis(game) {
        state.analysis = new Set(game);
        renderAnalysisPicker();
        routeTo('analyzer');
        analyzeSelection();
    }

    function analyzeSelection() {
        try {
            const analysis = predictor.analyze([...state.analysis]);
            elements.analysisResult.innerHTML = `
                <div class="score-hero">
                    <div class="score-ring" style="--score:${analysis.balanceScore}"><span>${analysis.balanceScore}</span></div>
                    <div class="score-copy"><span class="card-kicker">형태 균형 점수</span><h2>과거 조합의 일반적인 형태와 비교</h2><p>점수가 높아도 당첨 확률이 올라가는 것은 아닙니다.</p></div>
                </div>
                <div class="ball-row large">${ballRowHtml(analysis.numbers, true)}</div>
                <div class="analysis-metrics">
                    <div class="analysis-metric"><span>번호 합계</span><strong>${analysis.sum}</strong></div>
                    <div class="analysis-metric"><span>합계 백분위</span><strong>${analysis.sumPercentile}%</strong></div>
                    <div class="analysis-metric"><span>홀수 : 짝수</span><strong>${analysis.odd} : ${analysis.even}</strong></div>
                    <div class="analysis-metric"><span>낮은 수 : 높은 수</span><strong>${analysis.low} : ${analysis.high}</strong></div>
                    <div class="analysis-metric"><span>연속 번호 쌍</span><strong>${analysis.consecutivePairs}</strong></div>
                    <div class="analysis-metric"><span>사용 번호 구간</span><strong>${analysis.zones}개</strong></div>
                    <div class="analysis-metric"><span>직전 회차 겹침</span><strong>${analysis.lastOverlap}개</strong></div>
                    <div class="analysis-metric"><span>번호쌍 평균 동시 출현</span><strong>${analysis.pairAffinity}회</strong></div>
                    <div class="analysis-metric"><span>과거 최대 일치</span><strong>${analysis.maxMatch}개${analysis.maxMatchRound ? ` · ${analysis.maxMatchRound}회` : ''}</strong></div>
                </div>
                <ul class="analysis-notes">${analysis.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
                <table class="detail-table">
                    <thead><tr><th>번호</th><th>누적 출현</th><th>최근 20회</th><th>마지막 출현</th></tr></thead>
                    <tbody>${analysis.numberDetails.map((detail) => `<tr><td>${detail.number}</td><td>${detail.total}회</td><td>${detail.recent20}회</td><td>${detail.gap === 0 ? '최근 회차' : `${detail.gap}회 전`}</td></tr>`).join('')}</tbody>
                </table>`;
        } catch (error) {
            showToast(error.message);
        }
    }

    function renderAnalysisEmpty() {
        elements.analysisResult.innerHTML = '<div class="empty-state"><svg><use href="#icon-chart"></use></svg><strong>번호를 선택하면 비교 결과가 나옵니다</strong><p>당첨 가능성이 아닌 과거 데이터 안에서의 형태를 설명합니다.</p></div>';
    }

    function bindRecords() {
        elements.exportRecords.addEventListener('click', exportRecords);
        elements.importRecords.addEventListener('change', importRecords);
        elements.clearHistory.addEventListener('click', () => {
            if (!state.records.history.length) return;
            if (!confirm('최근 생성 기록을 모두 지울까요? 저장한 조합은 유지됩니다.')) return;
            state.records.history = [];
            persistRecords();
            renderRecords();
            renderDashboard();
            showToast('생성 기록을 비웠습니다.');
        });
    }

    function loadRecords() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                history: Array.isArray(parsed.history) ? parsed.history.filter(isValidHistoryEntry).slice(0, 100) : [],
                saved: Array.isArray(parsed.saved) ? parsed.saved.filter((item) => isValidNumbers(item.numbers)).slice(0, 100) : []
            };
        } catch {
            return { history: [], saved: [] };
        }
    }

    function persistRecords() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
    }

    function isValidNumbers(numbers) {
        return Array.isArray(numbers)
            && numbers.length === 6
            && new Set(numbers.map(Number)).size === 6
            && numbers.every((number) => Number.isInteger(Number(number)) && Number(number) >= 1 && Number(number) <= 45);
    }

    function isValidHistoryEntry(entry) {
        return entry && Array.isArray(entry.games) && entry.games.length <= 10 && entry.games.every(isValidNumbers);
    }

    function toggleSavedGame(numbers, source = '직접 저장') {
        const key = numbers.join('-');
        const index = state.records.saved.findIndex((item) => item.numbers.join('-') === key);
        if (index >= 0) {
            state.records.saved.splice(index, 1);
            showToast('저장 조합에서 뺐습니다.');
        } else {
            state.records.saved.unshift({ id: createId(), at: new Date().toISOString(), source, numbers: [...numbers] });
            state.records.saved = state.records.saved.slice(0, 100);
            showToast('내 기록에 저장했습니다.');
        }
        persistRecords();
        renderRecords();
        renderDashboard();
        return index < 0;
    }

    function renderRecords() {
        elements.savedCountLabel.textContent = `${state.records.saved.length}개`;
        elements.savedList.innerHTML = state.records.saved.length
            ? state.records.saved.map((item) => `
                <div class="record-item" data-saved-id="${escapeHtml(item.id)}">
                    <div class="record-item-head"><time>${formatDate(new Date(item.at))} · ${escapeHtml(item.source || '저장 조합')}</time><button class="icon-text-button danger remove-saved" type="button"><svg><use href="#icon-trash"></use></svg>삭제</button></div>
                    <div class="ball-row">${ballRowHtml(item.numbers.map(Number))}</div>
                </div>`).join('')
            : '<div class="empty-list">아직 저장한 조합이 없습니다.</div>';

        elements.savedList.querySelectorAll('.remove-saved').forEach((button) => {
            button.addEventListener('click', () => {
                const id = button.closest('[data-saved-id]').dataset.savedId;
                state.records.saved = state.records.saved.filter((item) => item.id !== id);
                persistRecords();
                renderRecords();
                renderDashboard();
            });
        });

        elements.historyRecordList.innerHTML = state.records.history.length
            ? state.records.history.slice(0, 20).map((item) => `
                <div class="record-item">
                    <div class="record-item-head"><time>${formatDate(new Date(item.at))} · ${escapeHtml(MODE_LABELS[item.mode] || '번호 조합')}</time></div>
                    <div class="record-groups">${item.games.map((game, index) => `<div class="record-group"><span>${String.fromCharCode(65 + index)}</span><div class="ball-row">${ballRowHtml(game.map(Number))}</div></div>`).join('')}</div>
                </div>`).join('')
            : '<div class="empty-list">아직 생성 기록이 없습니다.</div>';
    }

    function exportRecords() {
        const payload = {
            app: 'lotto-compass-45',
            version: 1,
            exportedAt: new Date().toISOString(),
            records: state.records
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.download = `lotto-compass-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('내 기록 백업 파일을 저장했습니다.');
    }

    async function importRecords(event) {
        const [file] = event.target.files;
        event.target.value = '';
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const incoming = parsed.records || parsed;
            if (!Array.isArray(incoming.history) || !Array.isArray(incoming.saved)) throw new Error();
            const history = incoming.history.filter(isValidHistoryEntry).slice(0, 100);
            const saved = incoming.saved.filter((item) => isValidNumbers(item.numbers)).slice(0, 100);
            if (!confirm(`생성 기록 ${history.length}건과 저장 조합 ${saved.length}개로 현재 기록을 바꿀까요?`)) return;
            state.records = { history, saved };
            persistRecords();
            renderRecords();
            renderDashboard();
            showToast('백업 기록을 불러왔습니다.');
        } catch {
            showToast('이 앱에서 만든 올바른 백업 파일이 아닙니다.');
        }
    }

    function aggregateStores(rows) {
        const grouped = new Map();
        rows.forEach((row) => {
            if (!row || typeof row !== 'object') return;
            const name = String(row.n || row.name || '이름 미상').trim();
            const address = String(row.a || row.address || '주소 정보 없음').trim();
            const key = `${name.toLowerCase()}|${address.toLowerCase()}`;
            const current = grouped.get(key) || {
                key,
                name,
                address,
                lat: 0,
                lng: 0,
                history: new Map(),
                wins: 0,
                closed: false,
                verified: false,
                distance: null
            };
            const lat = Number(row.lat);
            const lng = Number(row.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
                current.lat = lat;
                current.lng = lng;
            }
            const addHistory = (roundValue, methodValue) => {
                const round = Number(roundValue);
                if (!Number.isInteger(round) || round < 1) return;
                const method = normalizeMethod(methodValue);
                const historyKey = `${round}|${method}`;
                if (!current.history.has(historyKey)) current.history.set(historyKey, { round, method });
            };
            addHistory(row.r, row.m);
            if (Array.isArray(row.rounds)) row.rounds.forEach((item) => {
                addHistory(typeof item === 'object' ? item.r : item, typeof item === 'object' ? item.m : row.m);
            });
            current.wins = Math.max(current.wins, Number(row.totalWins) || 0, Number(row.w) || 0, current.history.size);
            current.closed = current.closed || Boolean(row.closed || row.status === '폐업');
            current.verified = current.verified || Boolean(row.verified);
            grouped.set(key, current);
        });
        return [...grouped.values()].map((store) => {
            const history = [...store.history.values()].sort((a, b) => b.round - a.round || a.method.localeCompare(b.method, 'ko'));
            const methodCounts = history.reduce((counts, item) => {
                counts[item.method] = (counts[item.method] || 0) + 1;
                return counts;
            }, {});
            return {
                ...store,
                history,
                methodCounts,
                methods: new Set(history.map((item) => item.method)),
                latestRound: history[0]?.round || 0,
                wins: Math.max(store.wins, history.length),
                tier: store.wins >= 10 ? 'gold' : store.wins >= 5 ? 'green' : 'blue'
            };
        }).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, 'ko'));
    }

    function normalizeMethod(value) {
        const method = String(value || '정보 없음').trim();
        if (method.includes('반자동')) return '반자동';
        if (method.includes('자동')) return '자동';
        if (method.includes('수동')) return '수동';
        if (method.includes('사이트') || method.includes('온라인')) return '사이트';
        return method || '정보 없음';
    }

    function initMap() {
        if (state.map) {
            requestAnimationFrame(() => state.map.invalidateSize());
            return;
        }
        bindMapControls();
        applyStoreFilters();
        if (window.L?.map && window.L?.markerClusterGroup) {
            createMap();
            return;
        }
        elements.mapMessage.textContent = '지도를 불러오지 못했습니다. 왼쪽 판매점 목록은 계속 사용할 수 있습니다.';
    }

    function createMap() {
        state.map = window.L.map(elements.mapCanvas, { zoomControl: true }).setView([36.5, 127.8], 7);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(state.map);
        state.clusterer = window.L.markerClusterGroup({
            chunkedLoading: true,
            showCoverageOnHover: false,
            maxClusterRadius: 46,
            iconCreateFunction: (cluster) => window.L.divIcon({
                html: `<span>${cluster.getChildCount()}</span>`,
                className: 'store-cluster',
                iconSize: [42, 42]
            })
        });
        const located = state.stores.filter((store) => store.lat && store.lng);
        located.forEach((store) => {
            const icon = window.L.divIcon({
                html: `<span><b>${store.wins}</b></span>`,
                className: `store-marker tier-${store.tier}`,
                iconSize: store.tier === 'gold' ? [42, 48] : [36, 42],
                iconAnchor: store.tier === 'gold' ? [21, 46] : [18, 40],
                popupAnchor: [0, -38]
            });
            const marker = window.L.marker([store.lat, store.lng], { title: `${store.name}, 1등 기록 ${store.wins}회`, icon });
            marker.bindPopup(buildStorePopup(store), { minWidth: 270, maxWidth: 340, maxHeight: 430 });
            state.markers.set(store.key, { marker, store });
        });
        state.map.addLayer(state.clusterer);
        elements.mapMessage.hidden = true;
        applyStoreFilters();
        moveToMyLocation(true);
    }

    function bindMapControls() {
        [elements.storeSearch, elements.storeTierFilter, elements.storeMethodFilter, elements.storeSort].forEach((control) => {
            control.addEventListener(control === elements.storeSearch ? 'input' : 'change', applyStoreFilters);
        });
        elements.myLocation.addEventListener('click', () => moveToMyLocation(false));
        document.querySelectorAll('[data-map-pane]').forEach((button) => {
            button.addEventListener('click', () => setMapPane(button.dataset.mapPane));
        });
        setMapPane('map');
    }

    function applyStoreFilters() {
        const query = elements.storeSearch.value.trim().toLowerCase();
        const tier = elements.storeTierFilter.value;
        const method = elements.storeMethodFilter.value;
        const sort = elements.storeSort.value;
        let filtered = state.stores.filter((store) => {
            const matchesQuery = !query || `${store.name} ${store.address}`.toLowerCase().includes(query);
            const matchesTier = tier === 'all'
                || (tier === '10' && store.wins >= 10)
                || (tier === '5' && store.wins >= 5 && store.wins < 10)
                || (tier === '1' && store.wins < 5);
            const matchesMethod = method === 'all' || store.methods.has(method);
            return matchesQuery && matchesTier && matchesMethod;
        });
        filtered = [...filtered].sort((a, b) => {
            if (sort === 'distance' && state.userLocation) return (a.distance ?? Infinity) - (b.distance ?? Infinity) || b.wins - a.wins;
            if (sort === 'latest') return b.latestRound - a.latestRound || b.wins - a.wins;
            return b.wins - a.wins || b.latestRound - a.latestRound;
        });
        renderStoreList(filtered);
        elements.uniqueStoreCount.textContent = filtered.length.toLocaleString();
        if (state.clusterer) {
            state.clusterer.clearLayers();
            state.clusterer.addLayers(filtered.map((store) => state.markers.get(store.key)?.marker).filter(Boolean));
        }
    }

    function renderStoreList(stores) {
        elements.storeList.innerHTML = '';
        const fragment = document.createDocumentFragment();
        stores.slice(0, 200).forEach((store) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `store-item tier-${store.tier}`;
            const name = document.createElement('strong');
            const address = document.createElement('span');
            const wins = document.createElement('small');
            name.textContent = store.name;
            address.textContent = store.address;
            const distance = Number.isFinite(store.distance) ? ` · ${formatDistance(store.distance)}` : '';
            wins.textContent = `1등 ${store.wins}회 · 최근 ${store.latestRound || '-'}회${distance}${store.closed ? ' · 폐업 기록' : ''}`;
            button.append(name, address, wins);
            button.disabled = !store.lat || !store.lng;
            button.addEventListener('click', () => focusStore(store.key));
            fragment.appendChild(button);
        });
        elements.storeList.appendChild(fragment);
        if (!stores.length) elements.storeList.innerHTML = '<div class="empty-list">검색 결과가 없습니다.</div>';
    }

    function buildStorePopup(store) {
        const popup = document.createElement('div');
        popup.className = 'custom-overlay';
        const status = store.closed ? '폐업 기록' : '영업 여부 확인 필요';
        const methodSummary = ['자동', '수동', '반자동', '사이트']
            .filter((method) => store.methodCounts[method])
            .map((method) => `${method === '사이트' ? '온라인' : method} ${store.methodCounts[method]}`)
            .join(' · ') || '방식 정보 없음';
        const history = store.history.length
            ? store.history.map((item) => `<li><span>제 ${item.round}회</span><strong>${escapeHtml(item.method === '사이트' ? '온라인' : item.method)}</strong></li>`).join('')
            : '<li><span>상세 회차 정보 없음</span></li>';
        popup.innerHTML = `
            <div class="popup-title-row">
                <strong>${escapeHtml(store.name)}</strong>
                <span class="status-badge${store.closed ? ' closed' : ''}">${status}</span>
            </div>
            <div class="popup-win tier-${store.tier}">1등 총 ${store.wins}회 기록</div>
            <p class="popup-method">당첨 방식: ${escapeHtml(methodSummary)}</p>
            <p class="popup-address">${escapeHtml(store.address)}</p>
            <div class="popup-actions">
                <button class="popup-copy" type="button">주소 복사</button>
                <a href="https://map.kakao.com/link/to/${encodeURIComponent(store.name)},${store.lat},${store.lng}" target="_blank" rel="noopener">길찾기</a>
            </div>
            <details class="popup-history">
                <summary>당첨 회차 ${store.history.length}건 보기</summary>
                <ul>${history}</ul>
            </details>`;
        popup.querySelector('.popup-copy').addEventListener('click', () => copyText(store.address, '판매점 주소를 복사했습니다.'));
        return popup;
    }

    function focusStore(key) {
        const entry = state.markers.get(key);
        if (!entry || !state.map) {
            showToast('이 판매점은 지도 좌표가 없습니다.');
            return;
        }
        state.clusterer.zoomToShowLayer(entry.marker, () => {
            state.map.setView(entry.marker.getLatLng(), 15);
            entry.marker.openPopup();
        });
        if (matchMedia('(max-width: 760px)').matches) setMapPane('map');
    }

    function moveToMyLocation(automatic = false) {
        if (!navigator.geolocation || !state.map) {
            elements.locationStatus.textContent = '이 브라우저에서는 위치 기능을 사용할 수 없습니다.';
            return;
        }
        elements.myLocation.disabled = true;
        elements.locationStatus.textContent = automatic ? '현재 위치를 확인하고 있습니다…' : '현재 위치를 다시 확인하고 있습니다…';
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude, accuracy } = position.coords;
            state.userLocation = { lat: latitude, lng: longitude };
            state.stores.forEach((store) => {
                store.distance = store.lat && store.lng ? distanceKm(latitude, longitude, store.lat, store.lng) : null;
            });
            state.map.setView([latitude, longitude], 14);
            if (state.userMarker) state.userMarker.remove();
            state.userMarker = window.L.circleMarker([latitude, longitude], {
                radius: 9,
                color: '#FFFFFF',
                weight: 3,
                fillColor: '#123B75',
                fillOpacity: 1
            }).addTo(state.map).bindTooltip('내 위치');
            if (state.userAccuracy) state.userAccuracy.remove();
            state.userAccuracy = window.L.circle([latitude, longitude], {
                radius: Math.min(Math.max(accuracy || 50, 30), 500),
                color: '#123B75',
                weight: 1,
                fillOpacity: 0.08
            }).addTo(state.map);
            elements.locationStatus.textContent = '현재 위치를 기준으로 가까운 판매점부터 정렬했습니다.';
            elements.storeSort.value = 'distance';
            applyStoreFilters();
            elements.myLocation.disabled = false;
        }, () => {
            elements.myLocation.disabled = false;
            elements.locationStatus.textContent = '위치를 확인하지 못해 전국 지도를 표시합니다. 위치 권한을 허용한 뒤 다시 시도할 수 있습니다.';
            if (!automatic) showToast('위치 권한이 없거나 현재 위치를 확인하지 못했습니다.');
        }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    }

    function setMapPane(pane) {
        state.mapPane = pane === 'list' ? 'list' : 'map';
        document.querySelector('.map-layout').dataset.mobilePane = state.mapPane;
        document.querySelectorAll('[data-map-pane]').forEach((button) => {
            const active = button.dataset.mapPane === state.mapPane;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        if (state.mapPane === 'map' && state.map) requestAnimationFrame(() => state.map.invalidateSize());
    }

    function distanceKm(lat1, lng1, lat2, lng2) {
        const radius = 6371;
        const toRadians = (value) => value * Math.PI / 180;
        const dLat = toRadians(lat2 - lat1);
        const dLng = toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
        return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatDistance(distance) {
        return distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(distance < 10 ? 1 : 0)}km`;
    }

    function startCountdown() {
        const update = () => {
            const now = new Date();
            const next = new Date(now);
            const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
            next.setDate(now.getDate() + daysUntilSaturday);
            next.setHours(20, 45, 0, 0);
            if (next <= now) next.setDate(next.getDate() + 7);
            const seconds = Math.max(0, Math.floor((next - now) / 1000));
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            elements.countdown.textContent = `${days}일 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        };
        update();
        window.setInterval(update, 30_000);
    }

    function ballClass(number) {
        if (number <= 10) return 'b1';
        if (number <= 20) return 'b2';
        if (number <= 30) return 'b3';
        if (number <= 40) return 'b4';
        return 'b5';
    }

    function ballHtml(number, large = false) {
        const safeNumber = Math.max(1, Math.min(45, Number(number) || 1));
        return `<span class="ball ${ballClass(safeNumber)}${large ? ' large' : ''}">${safeNumber}</span>`;
    }

    function ballRowHtml(numbers, large = false) {
        return numbers.map((number) => ballHtml(number, large)).join('');
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function createId() {
        return typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function formatDate(date) {
        if (Number.isNaN(date.getTime())) return '날짜 없음';
        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    async function copyText(text, successMessage) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }
        showToast(successMessage);
    }

    function showToast(message) {
        elements.toast.textContent = message;
        elements.toast.classList.add('show');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
    }
})();
