/* 파일경로: app.js */

document.addEventListener('DOMContentLoaded', () => {
    let map = null;
    let clusterer = null;
    let currentOverlay = null;

    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    const statusBadge = document.getElementById('data-status-badge');
    
    // =======================================================================
    // 1. 상태 초기화 및 실시간 상단 배너
    // =======================================================================
    const isDataLoaded = (typeof LOTTO_HISTORY !== 'undefined') && (typeof lottoData !== 'undefined');
    
    if (isDataLoaded) {
        statusBadge.className = 'status-badge ready';
        statusBadge.innerHTML = '<i class="fa-solid fa-check-circle"></i> 데이터 로드 완료';
        initHistoryView();
        updateBannerInfo();
        renderNumberStats(); // 🌟 번호별 통계 렌더링 호출
    } else {
        statusBadge.className = 'status-badge loading';
        statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 일부 데이터 없음';
    }

    function updateBannerInfo() {
        if (!window.predictor || !LOTTO_HISTORY) return;
        const latestInfo = window.predictor.getLatestDrawInfo();
        if (latestInfo.drawNo !== '알 수 없음') {
            const latest = parseInt(latestInfo.drawNo);
            document.getElementById('banner-latest-round').textContent = latest;
            document.getElementById('banner-next-round').textContent = latest + 1;
            
            const balls = LOTTO_HISTORY[latest].slice(0, 6);
            const bonus = LOTTO_HISTORY[latest][6];
            let html = balls.map(n => `<div class="mini-ball ${getBallColorClass(n)}">${n}</div>`).join('');
            html += `<span style="color:#94A3B8; font-size:12px; margin:0 2px; line-height:22px;">+</span><div class="mini-ball ${getBallColorClass(bonus)}">${bonus}</div>`;
            document.getElementById('banner-latest-balls').innerHTML = html;

            // 🌟 1등 예상 당첨금 (API 연결 전 모의 데이터 노출, 실제론 파이썬 봇이 JSON에 주입해야 함)
            // 현재 누적액을 보여주는 효과
            document.getElementById('banner-prize').textContent = '약 43억 2,500만 원';
        }
    }

    // 카운트다운 타이머
    function updateCountdown() {
        const now = new Date();
        let nextDraw = new Date(now);
        nextDraw.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7)); 
        nextDraw.setHours(20, 45, 0, 0);
        
        if (now > nextDraw) nextDraw.setDate(nextDraw.getDate() + 7);
        
        const diff = nextDraw - now;
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        
        const pad = n => n.toString().padStart(2, '0');
        const bannerEl = document.getElementById('banner-countdown');
        if(bannerEl) bannerEl.textContent = `${d}일 ${pad(h)}:${pad(m)}:${pad(s)} 남음`;
    }
    setInterval(updateCountdown, 1000);
    updateCountdown();

    // =======================================================================
    // 🌟 2. 번호별 출현 횟수 통계 렌더링
    // =======================================================================
    function renderNumberStats() {
        if (!window.predictor) return;
        // 빈도수 데이터를 가져와서 정렬
        const sortedFreq = Array.from(window.predictor.frequencyMap.entries()).sort((a, b) => b[1] - a[1]);
        
        const hotNums = sortedFreq.slice(0, 5); // 가장 많이 나온 5개
        const coldNums = sortedFreq.slice(-5).reverse(); // 가장 적게 나온 5개

        const createHtml = (arr) => arr.map(([num, count]) => `
            <div style="text-align:center;">
                <div class="mini-ball ${getBallColorClass(num)}">${num}</div>
                <div style="font-size:0.65rem; color:#94A3B8; margin-top:3px;">${count}회</div>
            </div>
        `).join('');

        document.getElementById('stats-hot-balls').innerHTML = createHtml(hotNums);
        document.getElementById('stats-cold-balls').innerHTML = createHtml(coldNums);
    }

    // =======================================================================
    // 3. 카카오맵 렌더링 (운영 상태 및 방식 추가)
    // =======================================================================
    function getSvgMarker(tier, winCount) {
        const colors = { 1: '#42A5F5', 2: '#66BB6A', 3: '#F59E0B' };
        const color = colors[tier] || colors[1];
        const size = tier === 3 ? 40 : 32;
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="${size}" height="${size}"><path fill="${color}" stroke="#ffffff" stroke-width="15" d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/><text x="50%" y="45%" font-family="sans-serif" font-weight="bold" font-size="110" fill="#ffffff" text-anchor="middle" alignment-baseline="middle">${winCount}</text></svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    }

    function initMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer || typeof kakao === 'undefined' || !kakao.maps) return;

        const mapOption = { center: new kakao.maps.LatLng(37.566826, 126.978656), level: 7 };
        map = new kakao.maps.Map(mapContainer, mapOption);

        clusterer = new kakao.maps.MarkerClusterer({
            map: map, averageCenter: true, minLevel: 6,
            calculator: [10, 30, 50],
            styles: [{ width: '40px', height: '40px', background: 'rgba(245, 158, 11, 0.9)', color: '#fff', textAlign: 'center', fontWeight: 'bold', lineHeight: '40px', borderRadius: '50%', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', border: '2px solid #fff' }]
        });

        if (typeof lottoData !== 'undefined' && Array.isArray(lottoData)) {
            const markers = lottoData.map(store => {
                const winCount = store.totalWins || store.rounds?.length || 1;
                let tier = 1; if (winCount >= 5) tier = 2; if (winCount >= 10) tier = 3;

                const markerImage = new kakao.maps.MarkerImage(
                    getSvgMarker(tier, winCount),
                    new kakao.maps.Size(tier === 3 ? 40 : 32, tier === 3 ? 40 : 32),
                    { offset: new kakao.maps.Point(16, 32) }
                );

                const marker = new kakao.maps.Marker({
                    position: new kakao.maps.LatLng(store.lat, store.lng),
                    image: markerImage
                });

                // 🌟 당첨 회차 및 운영 상태 로직
                let historyHtml = '<div class="history-li">상세 내역 없음</div>';
                let autoCount = 0, manualCount = 0, semiCount = 0;

                if (store.rounds && store.rounds.length > 0) {
                    historyHtml = store.rounds.map(r => {
                        const method = r.m || '자동';
                        if(method.includes('자동') && !method.includes('반자동')) autoCount++;
                        else if(method.includes('수동')) manualCount++;
                        else if(method.includes('반자동')) semiCount++;
                        
                        return `<div class="history-li"><span>제 ${r.r}회</span><strong>${method}</strong></div>`;
                    }).join('');
                }

                // 🌟 상태 뱃지 및 방식 요약
                const isClosed = store.status === '폐업' || store.n.includes('(폐점)');
                const statusBadgeHtml = isClosed ? '<span class="popup-badge badge-closed">폐업</span>' : '<span class="popup-badge badge-open">운영중</span>';
                
                let methodSummary = [];
                if(autoCount > 0) methodSummary.push(`자동 ${autoCount}`);
                if(manualCount > 0) methodSummary.push(`수동 ${manualCount}`);
                if(semiCount > 0) methodSummary.push(`반자동 ${semiCount}`);
                const methodText = methodSummary.length > 0 ? methodSummary.join(' · ') : '정보 없음';

                const popupContent = document.createElement('div');
                popupContent.className = 'custom-popup-wrap';
                popupContent.innerHTML = `
                    <div class="custom-popup">
                        <div class="popup-header">
                            <span class="popup-title">${store.n || '복권명당'} ${statusBadgeHtml}</span>
                            <button class="popup-close"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        <div class="popup-body">
                            <div class="popup-win-info">1등 총 ${winCount}회 당첨</div>
                            <div style="font-size:0.75rem; color:#64748B; margin-bottom:8px;">🎲 방식: ${methodText}</div>
                            <div class="popup-addr">${store.a || '주소 정보 없음'}</div>
                            <div class="popup-actions">
                                <button class="popup-btn btn-copy"><i class="fa-regular fa-copy"></i> 복사</button>
                                <button class="popup-btn btn-route"><i class="fa-solid fa-route"></i> 길찾기</button>
                            </div>
                            <button class="history-toggle">당첨 회차 보기 <i class="fa-solid fa-chevron-down"></i></button>
                            <div class="popup-history-list">${historyHtml}</div>
                        </div>
                    </div>
                `;

                const customOverlay = new kakao.maps.CustomOverlay({
                    content: popupContent, position: marker.getPosition(),
                    yAnchor: 1.25, zIndex: 100
                });

                popupContent.querySelector('.popup-close').addEventListener('click', () => customOverlay.setMap(null));
                popupContent.querySelector('.btn-copy').addEventListener('click', () => {
                    navigator.clipboard.writeText(store.a).then(() => alert('주소가 복사되었습니다.'));
                });
                popupContent.querySelector('.btn-route').addEventListener('click', () => {
                    window.open(`https://map.kakao.com/link/to/${store.n},${store.lat},${store.lng}`);
                });
                
                const toggleBtn = popupContent.querySelector('.history-toggle');
                const historyList = popupContent.querySelector('.popup-history-list');
                toggleBtn.addEventListener('click', () => {
                    historyList.classList.toggle('show');
                    toggleBtn.classList.toggle('open');
                    toggleBtn.innerHTML = historyList.classList.contains('show') 
                        ? '회차 정보 닫기 <i class="fa-solid fa-chevron-up"></i>' 
                        : '당첨 회차 보기 <i class="fa-solid fa-chevron-down"></i>';
                });

                kakao.maps.event.addListener(marker, 'click', () => {
                    if (currentOverlay) currentOverlay.setMap(null);
                    customOverlay.setMap(map);
                    currentOverlay = customOverlay;
                    map.panTo(marker.getPosition());
                });

                return marker;
            });
            clusterer.addMarkers(markers);
        }

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    map.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
                    map.setLevel(5);
                },
                (err) => console.log('위치 권한 거부됨, 기본 중심 좌표 유지')
            );
        }
    }
    setTimeout(initMap, 300);

    // =======================================================================
    // 4. 내 위치 버튼 & 공통 헬퍼 & 탭 로직 (유지)
    // =======================================================================
    const btnMyLocation = document.getElementById('btn-my-location');
    if (btnMyLocation) {
        btnMyLocation.addEventListener('click', () => {
            if (navigator.geolocation && map) {
                const icon = btnMyLocation.querySelector('i');
                icon.classList.add('fa-beat-fade');
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        map.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
                        map.setLevel(4);
                        icon.classList.remove('fa-beat-fade');
                    },
                    () => { icon.classList.remove('fa-beat-fade'); alert('위치 권한을 허용해주세요.'); }
                );
            }
        });
    }

    function getBallColorClass(number) {
        if (number <= 10) return 'color-yellow';
        if (number <= 20) return 'color-blue';
        if (number <= 30) return 'color-red';
        if (number <= 40) return 'color-gray';
        return 'color-green';
    }

    function initHistoryView() {
        const contentArea = document.getElementById('history-list-content');
        if (!contentArea || typeof LOTTO_HISTORY === 'undefined') return;
        contentArea.innerHTML = '';
        const rounds = Object.keys(LOTTO_HISTORY).map(Number).sort((a, b) => b - a);
        const fragment = document.createDocumentFragment();
        const renderLimit = Math.min(rounds.length, 100);

        for (let i = 0; i < renderLimit; i++) {
            const drawNo = rounds[i];
            const data = LOTTO_HISTORY[drawNo];
            if (!Array.isArray(data) || data.length < 7) continue;

            const mainNums = data.slice(0, 6);
            const bonusNum = data[6];

            const row = document.createElement('div');
            row.className = 'history-item';
            row.innerHTML = `<div class="item-draw-no">${drawNo}</div><div class="item-numbers">${mainNums.map(n => `<div class="mini-ball ${getBallColorClass(n)}">${n}</div>`).join('')}</div><div class="item-bonus"><span class="bonus-plus">+</span><div class="mini-ball ${getBallColorClass(bonusNum)}">${bonusNum}</div></div>`;
            fragment.appendChild(row);
        }
        contentArea.appendChild(fragment);
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            viewSections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetId) section.classList.add('active');
            });
            if (targetId === 'view-map' && map) setTimeout(() => map.relayout(), 100);
        });
    });

    // =======================================================================
    // 5. 영수증 캡처 로직 (유지)
    // =======================================================================
    const btnGenerateAdv = document.getElementById('btn-generate-advanced');
    const gameCountSelect = document.getElementById('game-count');
    const algoBase = document.getElementById('algo-base');
    const ticketPaper = document.getElementById('ticket-paper');
    const ticketLines = document.getElementById('ticket-lines');
    const btnDownload = document.getElementById('btn-download');

    if (btnGenerateAdv) {
        btnGenerateAdv.addEventListener('click', () => {
            if (!window.predictor) return;
            const count = parseInt(gameCountSelect.value, 10) || 5;
            const algo = algoBase.value;
            
            btnGenerateAdv.disabled = true;
            btnGenerateAdv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 영수증 출력 중...';
            
            setTimeout(() => {
                const games = window.predictor.generateMultiple(count, algo);
                const now = new Date();
                const pad = n => n.toString().padStart(2, '0');
                document.getElementById('t-issue').textContent = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
                
                const latestDraw = window.predictor.getLatestDrawInfo().drawNo;
                document.getElementById('t-draw-no').textContent = latestDraw !== '알 수 없음' ? parseInt(latestDraw) + 1 : '????';
                document.getElementById('t-draw').textContent = '이번 주 토요일';
                document.getElementById('t-price').textContent = `₩${(count * 1000).toLocaleString()}`;

                const alphas = ['A', 'B', 'C', 'D', 'E'];
                ticketLines.innerHTML = '';
                games.forEach((game, idx) => {
                    const formattedNums = game.map(n => n.toString().padStart(2, '0')).join(' ');
                    const lineMode = algo === 'random' ? '자동' : '반자동';
                    const div = document.createElement('div');
                    div.className = 'ticket-line';
                    div.innerHTML = `<span class="alpha">${alphas[idx]}</span><span class="type">${lineMode}</span><span class="nums">${formattedNums}</span>`;
                    ticketLines.appendChild(div);
                });

                ticketPaper.style.display = 'block';
                btnDownload.style.display = 'block';
                btnGenerateAdv.disabled = false;
                btnGenerateAdv.innerHTML = '<i class="fa-solid fa-receipt"></i> 다시 발급받기';
            }, 800);
        });
    }

    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            btnDownload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 캡처 중...';
            html2canvas(ticketPaper, { scale: 3, backgroundColor: '#fdfdfd', useCORS: true }).then(canvas => {
                const link = document.createElement('a');
                link.download = `GotturiMap_Ticket_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> 영수증 이미지로 저장';
            }).catch(err => {
                alert('이미지 저장 중 오류가 발생했습니다.');
                btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> 영수증 이미지로 저장';
            });
        });
    }
});