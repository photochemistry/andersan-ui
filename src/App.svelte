<script>
    import { onMount, afterUpdate, onDestroy } from 'svelte';
    import 'leaflet/dist/leaflet.css';
    import L from 'leaflet';
    import {
        fetchPredict,
        fetchAddress,
        fetchPgt120,
        fetchObserve,
        PREDICT_ALGORITHMS,
        getPredictAlgorithm,
        setPredictAlgorithm,
        isQuantilePredictAlgorithm,
        isPositiveSideQuantileBand
    } from './retrieve.js';
    import Chart from 'chart.js/auto';
    import { getChartConfig } from './chartConfig.js';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import { findMatchingRowIndex, formatTime, formatStartTime, getGradientColor, computeFutureExceedancePeriods, formatExceedancePeriods, getCurrentAlertLevel, ALERT_BAND_STYLES } from './utils.js';
    import { buildGeneralAirMessage, DEFAULT_GENERAL_AIR_MESSAGE } from './messageScheme.js';
    import InfoModal from './components/InfoModal.svelte';
    import SunCalc from 'suncalc';

    // 外部ライブラリの読み込み状況を通知
    let loadedLibraries = [];
    if (typeof L !== 'undefined') loadedLibraries.push('Leaflet');
    if (typeof Chart !== 'undefined') loadedLibraries.push('Chart.js');
    if (typeof SunCalc !== 'undefined') loadedLibraries.push('SunCalc');
    
    if (window.markLibsLoaded && loadedLibraries.length > 0) {
        window.markLibsLoaded(loadedLibraries);
    }

    let map;
    let ox_dict;
    let ox_obs;
    let address = "";
    let addr_dict = {};
    let ox_array;
    /** @type {number[]|undefined} */
    let ox_q10_array;
    /** @type {number[]|undefined} */
    let ox_q90_array;
    /** @type {number[]|undefined} */
    let ox_q95_array;
    let ox_obs_array;
    let p_array;
    let p_max = 0;
    let now = new Date("2015-07-27 06:00+09:00"); // undefinedは困る
    let pgt120_dict;
    let myChart;
    let center = [35.331586, 139.349782];
    let debounceTimer;
    /** 地図移動などで新しい取得が始まったらインクリメントし、古い結果を無視する */
    let centerFetchId = 0;
    let isInfoModalOpen = false;
    let isLoadingData = false;
    let loadingStatusText = '';
    let isDemoMode = false;
    /** 'general' | 'pro' — 一般利用者向け / 事業者向け */
    let viewMode = 'general';
    let alertPeriodsText = '該当なし';
    let generalAirMessage = { ...DEFAULT_GENERAL_AIR_MESSAGE };
    /** @type {'asthma'|'warning'|null} */
    let infoBoxAlertLevel = null;
    /** デモ時に API リクエストへ渡す固定時刻（null は通常モード） */
    let demoFrozenNow = null;
    let sunriseTime = null;
    let sunsetTime = null;
    let serverBusy = false;
    let errorStatus = null;
    let tileBoundaryLayer = null;
    let predictSourceTime = null;
    let predictCachedAt = null;
    let observeSourceTime = null;
    let observeCachedAt = null;
    /** @type {{ anchorHour: number, anchorDate: Date, data: object }[]} */
    let pastPredictDicts = [];
    let selectedAlgorithm = getPredictAlgorithm();
    let algorithmOptions = Object.entries(PREDICT_ALGORITHMS).map(([value, label]) => ({ value, label }));

    // 地図の表示領域を定数として設定
    const MAP_TOP_PERCENT = 10; // 地図の上端位置（%）
    const MAP_HEIGHT_PERCENT = 100 - MAP_TOP_PERCENT; // 地図の高さ（%）
    const MAP_CENTER_PERCENT = MAP_TOP_PERCENT + (MAP_HEIGHT_PERCENT / 2); // 地図の中心位置（%）

    function checkViewMode() {
        const path = new URL(window.location.href).pathname;
        viewMode = /\/pro(\/|$)/.test(path) ? 'pro' : 'general';
    }

    function getDemoDateForPreset(preset) {
        switch (preset) {
            case '1':
                return new Date('2015-07-27T06:00:00+09:00');
            case '2':
                return new Date('2026-04-29T09:00:00+09:00');
            case '3': {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                d.setHours(9, 0, 0, 0);
                return d;
            }
            default:
                return null;
        }
    }

    function checkDemoMode() {
        const url = new URL(window.location.href);
        const demoParam = url.searchParams.get('demo');
        const demoDate = demoParam ? getDemoDateForPreset(demoParam) : null;
        if (demoDate) {
            demoFrozenNow = demoDate;
            isDemoMode = true;
        } else {
            demoFrozenNow = null;
            isDemoMode = false;
        }
    }

    function updateNow() {
        if (demoFrozenNow) {
            now = new Date(demoFrozenNow.getTime());
        } else {
            now = new Date();
            now.setMinutes(0);
            now.setSeconds(0);
            now.setMilliseconds(0);
        }
    }

    function parseApiTime(value) {
        if (!value || typeof value !== 'string') return null;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function extractTimeFields(payload) {
        const sourceRaw = payload?.source_time ?? payload?.meta?.source_time ?? null;
        const cachedRaw = payload?.cached_at ?? payload?.meta?.cached_at ?? null;
        return {
            sourceTime: parseApiTime(sourceRaw),
            cachedAt: parseApiTime(cachedRaw)
        };
    }

    function extractErrorStatus(error) {
        if (!error) return null;
        const message = error.message ?? String(error);
        if (message === '503' || message === '500') return message;
        const httpMatch = message.match(/status:\s*(\d{3})/i);
        if (httpMatch) return httpMatch[1];
        return null;
    }

    /** ローカル暦で a と b が同一日か */
    function sameLocalCalendarDay(a, b) {
        return (
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate()
        );
    }

    /** 当日の正時ベースで、現在時刻より前の 0,3,6,... 時を起点とする日時一覧 */
    function pastForecastAnchorDates(nowRef) {
        const base = new Date(nowRef.getTime());
        base.setMinutes(0, 0, 0);
        const H = base.getHours();
        const out = [];
        for (let h = 0; h < H; h += 3) {
            const d = new Date(base.getTime());
            d.setHours(h, 0, 0, 0);
            out.push(d);
        }
        return out;
    }

    function drawChart(ox_array, ox_obs_array, p_array, now, pastForecasts, ox_q10_array, ox_q90_array, ox_q95_array, positiveQuantileBand) {
            if (myChart) {
            myChart.destroy();
            myChart = null;
        }
        if (ox_obs_array === undefined) return;

        const safeOxArray = (ox_array ?? Array(24).fill(null)).map(v => isNaN(v) ? null : v);
        const safeOxObsArray = ox_obs_array.map(v => isNaN(v) ? null : v);
        const safePArray = (p_array ?? Array(24).fill(NaN)).map(v => isNaN(v) ? null : v);
        const safeOxQ10Array = ox_q10_array?.map(v => isNaN(v) ? null : v);
        const safeOxQ90Array = ox_q90_array?.map(v => isNaN(v) ? null : v);
        const safeOxQ95Array = ox_q95_array?.map(v => isNaN(v) ? null : v);
        let obsByClockHour = null;
        if (demoFrozenNow && addr_dict?.X !== undefined && addr_dict?.Y !== undefined) {
            obsByClockHour = buildObsByClockHourFromGrid(addr_dict.X, addr_dict.Y, now, observeSourceTime ?? now);
        }
        console.log(safeOxObsArray)
        const ctx = document.getElementById('myChart')?.getContext('2d');
        if (ctx) {
            myChart = new Chart(ctx, getChartConfig(safeOxArray, safeOxObsArray, safePArray, now, formatTime, getGradientColor, sunriseTime, sunsetTime, pastForecasts, obsByClockHour, safeOxQ10Array, safeOxQ90Array, safeOxQ95Array, positiveQuantileBand, viewMode));
        }
    }

    function addHours(base, hours) {
        const next = new Date(base.getTime());
        next.setHours(next.getHours() + hours);
        return next;
    }

    function withTimeout(promise, timeoutMs, errorMessage = 'timeout') {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId);
        });
    }

    function getObserveGridIndexRange() {
        const grid = ox_obs?.grid;
        if (!grid) return null;
        const minX = Number.isFinite(grid.xMin) ? grid.xMin : grid.minX;
        const maxX = Number.isFinite(grid.xMax) ? grid.xMax : grid.maxX;
        const minY = Number.isFinite(grid.yMin) ? grid.yMin : grid.minY;
        const maxY = Number.isFinite(grid.yMax) ? grid.yMax : grid.maxY;
        if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
        return { minX, maxX, minY, maxY };
    }

    function getObserveValueByGridAtDate(x, y, targetDate) {
        if (ox_obs?.legacy && ox_obs?.data?.XY) {
            const row = findMatchingRowIndex(ox_obs.data.XY, x, y);
            if (row < 0) return null;
            const anchor = new Date((observeSourceTime ?? now).getTime());
            anchor.setMinutes(0, 0, 0);
            const target = new Date(targetDate.getTime());
            target.setMinutes(0, 0, 0);
            const keyHour = Math.round((target.getTime() - anchor.getTime()) / 3600000);
            const dataKey = keyHour > 0 ? `+${keyHour}` : `${keyHour}`;
            const arr = ox_obs.data?.[dataKey];
            if (!Array.isArray(arr) || row >= arr.length) return null;
            const v = arr[row];
            return v === null || v === undefined || isNaN(v) ? null : Math.max(0, Math.round(v));
        }

        const range = getObserveGridIndexRange();
        const timestamps = ox_obs?.timestamps;
        const cube = ox_obs?.values?.ox;
        if (!range || !Array.isArray(timestamps) || !Array.isArray(cube)) return null;
        if (x < range.minX || x > range.maxX || y < range.minY || y > range.maxY) return null;

        const ix = x - range.minX;
        const iy = y - range.minY;
        const targetIso = targetDate.toISOString();
        const t = timestamps.findIndex((ts) => new Date(ts).toISOString() === targetIso);
        if (t < 0 || t >= cube.length) return null;
        const yz = cube[t];
        if (!Array.isArray(yz) || !Array.isArray(yz[iy])) return null;
        const v = yz[iy]?.[ix];
        return v === null || v === undefined || isNaN(v) ? null : Math.max(0, Math.round(v));
    }

    function buildObsByClockHourFromGrid(x, y, chartNow, obsAnchorTime) {
        const anchor = new Date(obsAnchorTime.getTime());
        anchor.setMinutes(0, 0, 0);
        const base = new Date(chartNow.getTime());
        base.setMinutes(0, 0, 0);
        const arr = Array(25).fill(null);
        for (let h = 0; h <= 24; h++) {
            const slot = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, 0, 0, 0);
            const v = getObserveValueByGridAtDate(x, y, slot);
            arr[h] = v;
        }
        return arr;
    }

    function refreshChart() {
        if (addr_dict?.X === undefined || addr_dict?.Y === undefined) return;
        if (ox_obs === undefined) return;

        try {
        const chartBaseTime = predictSourceTime ?? now;
        const currentAlgorithm = getPredictAlgorithm();

        ox_obs_array = Array.from({ length: 24 }, (_, i) => {
            const targetDate = new Date(chartBaseTime.getTime());
            targetDate.setMinutes(0, 0, 0);
            targetDate.setHours(chartBaseTime.getHours() - 23 + i);
            const value = getObserveValueByGridAtDate(addr_dict.X, addr_dict.Y, targetDate);
            return value ?? 0;
        });

        if (ox_dict !== undefined && ox_dict?.data?.XY) {
            const row = findMatchingRowIndex(ox_dict.data.XY, addr_dict.X, addr_dict.Y);
            ox_array = Array.from({length: 24}, (_, i) =>
                getPredictSeriesValue(ox_dict.data, i + 1, row, currentAlgorithm)
            );
            if (isQuantilePredictAlgorithm(currentAlgorithm)) {
                ox_q90_array = Array.from({length: 24}, (_, i) =>
                    getPredictSeriesValue(ox_dict.data, i + 1, row, currentAlgorithm, 'q90')
                );
                if (isPositiveSideQuantileBand(currentAlgorithm)) {
                    ox_q10_array = undefined;
                    ox_q95_array = Array.from({length: 24}, (_, i) =>
                        getPredictSeriesValue(ox_dict.data, i + 1, row, currentAlgorithm, 'q95')
                    );
                } else {
                    ox_q10_array = Array.from({length: 24}, (_, i) =>
                        getPredictSeriesValue(ox_dict.data, i + 1, row, currentAlgorithm, 'q10')
                    );
                    ox_q95_array = undefined;
                }
            } else {
                ox_q10_array = undefined;
                ox_q90_array = undefined;
                ox_q95_array = undefined;
            }
        } else {
            ox_array = undefined;
            ox_q10_array = undefined;
            ox_q90_array = undefined;
            ox_q95_array = undefined;
        }

        if (pgt120_dict?.data?.XY && ox_dict?.data?.XY) {
            const pgtRow = findMatchingRowIndex(pgt120_dict.data.XY, addr_dict.X, addr_dict.Y);
            p_array = Array.from({ length: 24 }, (_, i) => {
                const prob = pgt120_dict?.data?.[`+${i + 1}_p_gt_120`]?.[pgtRow];
                return prob === undefined || prob === null || isNaN(prob) ? NaN : Math.round(prob * 100);
            });
            const validProbabilities = p_array.filter(v => Number.isFinite(v));
            p_max = validProbabilities.length ? Math.max(...validProbabilities) : 0;
        } else {
            p_array = Array.from({ length: 24 }, () => NaN);
            p_max = 0;
        }

        const currentSlot = new Date(chartBaseTime.getTime());
        currentSlot.setMinutes(0, 0, 0);
        const currentPpb = getObserveValueByGridAtDate(addr_dict.X, addr_dict.Y, currentSlot);
        infoBoxAlertLevel = getCurrentAlertLevel(currentPpb);

        if (ox_array) {
            const periods100 = computeFutureExceedancePeriods(ox_array, chartBaseTime, 100, false);
            alertPeriodsText = formatExceedancePeriods(periods100, chartBaseTime);
            generalAirMessage = buildGeneralAirMessage({
                currentPpb,
                oxArray: ox_array,
                baseTime: chartBaseTime,
                sunriseTime,
            });
        } else {
            generalAirMessage = buildGeneralAirMessage({
                currentPpb,
                oxArray: undefined,
                baseTime: chartBaseTime,
                sunriseTime,
            });
            alertPeriodsText = '該当なし';
        }

        /** @type {{ anchorHour: number, padded: (number|null)[] }[]} */
        const pastForecasts = [];
        const sortedPast = [...pastPredictDicts].sort((a, b) => a.anchorHour - b.anchorHour);
        for (const { anchorHour, anchorDate, data } of sortedPast) {
            if (!data?.data?.XY || !sameLocalCalendarDay(anchorDate, now)) continue;
            const row = findMatchingRowIndex(data.data.XY, addr_dict.X, addr_dict.Y);
            if (row < 0) continue;
            const ox = Array.from({ length: 24 }, (_, i) =>
                getPredictSeriesValue(data.data, i + 1, row, currentAlgorithm)
            );
            const padded = Array(25).fill(null);
            for (let t = anchorHour + 1; t <= 24; t++) {
                const k = t - anchorHour;
                if (k >= 1 && k <= 24) padded[t] = ox[k - 1];
            }
            pastForecasts.push({ anchorHour, padded });
        }

        drawChart(
            ox_array ?? Array(24).fill(null),
            ox_obs_array,
            p_array,
            chartBaseTime,
            pastForecasts,
            ox_q10_array,
            ox_q90_array,
            ox_q95_array,
            isPositiveSideQuantileBand(currentAlgorithm)
        );
        } catch (error) {
            console.error('refreshChart failed', error);
        }
    }

    async function loadCenterDataStaged(baseNow, fetchId) {
        const isStale = () => fetchId !== centerFetchId;

        let effectiveNow = new Date(baseNow.getTime());
        now = new Date(effectiveNow.getTime());
        pastPredictDicts = [];
        ox_dict = undefined;
        ox_obs = undefined;
        ox_array = undefined;
        ox_q10_array = undefined;
        ox_q90_array = undefined;
        ox_q95_array = undefined;
        pgt120_dict = undefined;
        predictSourceTime = null;
        predictCachedAt = null;
        observeSourceTime = null;
        observeCachedAt = null;

        loadingStatusText = '実測値を取得中...';
        let obsRes;
        try {
            const viewBounds = map.getBounds();
            const bbox = [
                viewBounds.getWest(),
                viewBounds.getSouth(),
                viewBounds.getEast(),
                viewBounds.getNorth()
            ].join(',');
            obsRes = await fetchObserve(effectiveNow, bbox, 'idw');
        } catch (obsError) {
            if (isStale()) return;
            console.warn('Observe fetch failed; retrying 1 hour earlier.', obsError);
            effectiveNow = addHours(baseNow, -1);
            now = new Date(effectiveNow.getTime());
            updateSunTimes();
            loadingStatusText = '再取得中です...（時刻を1時間戻して試行）';
            const viewBounds = map.getBounds();
            const bbox = [
                viewBounds.getWest(),
                viewBounds.getSouth(),
                viewBounds.getEast(),
                viewBounds.getNorth()
            ].join(',');
            obsRes = await fetchObserve(effectiveNow, bbox, 'idw');
        }
        if (isStale()) return;
        ox_obs = obsRes;
        const obsTimes = extractTimeFields(obsRes);
        observeSourceTime = obsTimes.sourceTime;
        observeCachedAt = obsTimes.cachedAt;
        refreshChart();

        loadingStatusText = '予測値を取得中...';
        const [predRes, pgtRes] = await Promise.all([
            fetchPredict(effectiveNow),
            fetchPgt120(effectiveNow).catch((error) => {
                console.warn('pgt120 fetch failed', error);
                return null;
            })
        ]);
        if (isStale()) return;
        ox_dict = predRes;
        pgt120_dict = pgtRes;
        const predTimes = extractTimeFields(predRes);
        predictSourceTime = predTimes.sourceTime;
        predictCachedAt = predTimes.cachedAt;
        console.log('[debug][timing] fetch timestamps', {
            requestedAt: baseNow.toISOString(),
            effectiveNow: effectiveNow.toISOString(),
            predictSourceTime: predictSourceTime?.toISOString() ?? null,
            predictCachedAt: predictCachedAt?.toISOString() ?? null,
            observeSourceTime: observeSourceTime?.toISOString() ?? null,
            observeCachedAt: observeCachedAt?.toISOString() ?? null
        });
        updateSunTimes();
        refreshChart();

        const anchorDates = pastForecastAnchorDates(effectiveNow).slice().reverse();
        for (let i = 0; i < anchorDates.length; i++) {
            const anchorDate = anchorDates[i];
            loadingStatusText = `過去予測を取得中... (${i + 1}/${anchorDates.length})`;
            try {
                const data = await fetchPredict(anchorDate);
                if (isStale()) return;
                pastPredictDicts = [
                    ...pastPredictDicts,
                    {
                        anchorHour: anchorDate.getHours(),
                        anchorDate: new Date(anchorDate.getTime()),
                        data
                    }
                ];
                refreshChart();
            } catch (error) {
                console.warn('Past predict fetch failed', anchorDate, error);
            }
        }
    }

    async function updateCenter() {
        updateNow();
        centerFetchId++;
        const fetchId = centerFetchId;
        const c = map.getCenter();
        center = [c.lat, c.lng];
        console.log("center updated")
        serverBusy = false;
        errorStatus = null;
        isLoadingData = true;
        loadingStatusText = 'データを取得中です...';

        // 地図移動時にも照星の位置を調整
        const bounds = map.getBounds();
        const latRange = bounds.getNorth() - bounds.getSouth();
        const offsetRatio = 0; // 位置確認のため0に設定
        const adjustedLat = center[0] - (offsetRatio * latRange);

        // 調整された位置に地図を移動（ただし無限ループを避けるため条件付き）
        const currentCenter = map.getCenter();
        if (Math.abs(currentCenter.lat - adjustedLat) > 0.001) {
            map.setView([adjustedLat, center[1]], map.getZoom());
        }

        ox_dict = undefined;
        ox_obs = undefined;
        ox_array = undefined;
        ox_obs_array = undefined;
        ox_q10_array = undefined;
        ox_q90_array = undefined;
        ox_q95_array = undefined;
        pgt120_dict = undefined;
        pastPredictDicts = [];
        predictSourceTime = null;
        predictCachedAt = null;
        observeSourceTime = null;
        observeCachedAt = null;
        if (myChart) {
            myChart.destroy();
            myChart = null;
        }

        try {
            const firstNow = new Date(now.getTime());
            await withTimeout(loadCenterDataStaged(firstNow, fetchId), 120000, 'timeout');
        } catch (error) {
            if (fetchId !== centerFetchId) return;
            serverBusy = true;
            errorStatus = extractErrorStatus(error);
            console.error(error);
            predictSourceTime = null;
            predictCachedAt = null;
            observeSourceTime = null;
            observeCachedAt = null;
            pastPredictDicts = [];
        } finally {
            if (fetchId === centerFetchId) {
                isLoadingData = false;
                loadingStatusText = '';
            }
        }
    }

    function updateSunTimes() {
        const times = SunCalc.getTimes(now, center[0], center[1]);
        sunriseTime = times.sunrise;
        sunsetTime = times.sunset;
    }

    async function updateAddress() {
        const c = map.getCenter();
        const { lat: latitude, lng: longitude } = c;
        serverBusy = false;
        try {
            const a = await fetchAddress(longitude, latitude);
            addr_dict = a;
            if (ox_obs !== undefined) {
                refreshChart();
            }
            const addressParts = a.address.split(',');
            if (addressParts.length >= 4) {
                const prefecture = addressParts[addressParts.length - 3].trim();
                const city = addressParts[addressParts.length - 4].trim();
                address = `${prefecture} ${city}`;
            } else {
                address = a.address;
            }
        } catch (error) {
            if (error.message === '503' || error.message.includes('500')) {
                serverBusy = true;
                errorStatus = extractErrorStatus(error);
            }
            console.error(error);
        }
    }

    function debounceUpdateCenter() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateCenter, 1000);
    }

    onMount(() => {
        // Chart.jsにannotationプラグインを登録
        Chart.register(annotationPlugin);
        
        checkViewMode();
        checkDemoMode();
        updateNow();
        // 地図の中心位置を上にずらして、照星が指す位置が正しいターゲット位置になるようにする
        // 地図の上から20/70の位置が画面中央になるよう調整
        const mapCenterLat = 35.331586;
        const mapCenterLng = 139.349782;
        
        map = L.map('map', { zoomControl: false }).setView([mapCenterLat, mapCenterLng], 12);

        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
        }).addTo(map);

        // 予測格子点の最近傍領域境界を描画
        drawTileBoundaries();

        map.on('moveend', updateAddress);
        map.on('moveend', drawTileBoundaries); // 地図移動時に境界線を再描画
        updateCenter();
        updateAddress();
        updateSunTimes();
    });

    function drawTileBoundaries() {
        // 既存の境界線レイヤーを削除
        if (tileBoundaryLayer) {
            map.removeLayer(tileBoundaryLayer);
        }

        const fixedZoom = 12; // 予測格子の固定ズームレベル
        const bounds = map.getBounds();
        
        tileBoundaryLayer = L.layerGroup();
        
        // 表示範囲にあるタイル番号を取得
        const tileBounds = getTileBounds(bounds, fixedZoom);

        // 格子点最近傍領域の境界は、通常タイル境界から半タイルずれた位置
        // に並ぶので、各タイルを x/y とも 0.5 だけ平行移動した輪郭を描く。
        for (let x = tileBounds.minX - 1; x <= tileBounds.maxX + 1; x++) {
            for (let y = tileBounds.minY - 1; y <= tileBounds.maxY + 1; y++) {
                const shiftedBounds = getShiftedTileLatLngBounds(x, y, fixedZoom);
                const shiftedCell = L.polygon([
                    [shiftedBounds.south, shiftedBounds.west],
                    [shiftedBounds.south, shiftedBounds.east],
                    [shiftedBounds.north, shiftedBounds.east],
                    [shiftedBounds.north, shiftedBounds.west]
                ], {
                    color: 'gray',
                    weight: 1,
                    opacity: 0.2,
                    fillOpacity: 0
                });
                tileBoundaryLayer.addLayer(shiftedCell);
            }
        }
        
        map.addLayer(tileBoundaryLayer);
    }

    function getTileBounds(bounds, zoom) {
        const minTile = latLngToTile(bounds.getSouthWest(), zoom);
        const maxTile = latLngToTile(bounds.getNorthEast(), zoom);
        
        return {
            minX: Math.floor(minTile.x),
            minY: Math.floor(Math.min(minTile.y, maxTile.y)),
            maxX: Math.ceil(maxTile.x),
            maxY: Math.ceil(Math.max(minTile.y, maxTile.y))
        };
    }

    function latLngToTile(latLng, zoom) {
        // 地理院タイルの座標系に合わせた変換
        const n = Math.pow(2, zoom);
        const lat_rad = latLng.lat * Math.PI / 180;
        const x = ((latLng.lng + 180) / 360) * n;
        const y = (1 - Math.asinh(Math.tan(lat_rad)) / Math.PI) * n / 2;
        return { x, y };
    }

    function getTileLatLngBounds(x, y, zoom) {
        const westNorth = tileXYToLatLng(x, y, zoom);
        const eastSouth = tileXYToLatLng(x + 1, y + 1, zoom);
        return {
            north: westNorth.lat,
            south: eastSouth.lat,
            east: eastSouth.lng,
            west: westNorth.lng
        };
    }

    function getShiftedTileLatLngBounds(x, y, zoom) {
        const westNorth = tileXYToLatLng(x - 0.5, y - 0.5, zoom);
        const eastSouth = tileXYToLatLng(x + 0.5, y + 0.5, zoom);
        return {
            north: westNorth.lat,
            south: eastSouth.lat,
            east: eastSouth.lng,
            west: westNorth.lng
        };
    }

    function tileXYToLatLng(x, y, zoom) {
        const n = Math.pow(2, zoom);
        const lng = (x / n) * 360 - 180;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180 / Math.PI;
        return { lat, lng };
    }

    const moveToCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 12);
                updateCenter();
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('位置情報の取得に失敗しました。ブラウザの設定を確認してください。');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    };

    afterUpdate(() => {
        if (myChart) {
            myChart.resize();
        }
    });

    function toggleInfoModal() {
        isInfoModalOpen = !isInfoModalOpen;
    }

    function getInfoBoxStyle(alertLevel) {
        if (!alertLevel) return '';
        const style = ALERT_BAND_STYLES[alertLevel];
        return `background-color: ${style.backgroundColor}; border-color: ${style.borderColor}; border-width: 2px;`;
    }

    function getPredictSeriesValue(data, horizon, row, algorithm, quantile = 'q50') {
        const isQuantile = isQuantilePredictAlgorithm(algorithm);
        const primaryKey = isQuantile ? `+${horizon}_${quantile}` : `+${horizon}`;
        const fallbackKey = `+${horizon}`;
        const values = isQuantile && quantile !== 'q50'
            ? data?.[primaryKey]
            : (data?.[primaryKey] ?? data?.[fallbackKey]);
        if (!values || row < 0 || row >= values.length) return 0;
        const value = values[row];
        return value === null || isNaN(value) ? 0 : Math.max(0, Math.round(value));
    }

    async function handleAlgorithmChange(event) {
        const nextAlgorithm = event.target.value;
        setPredictAlgorithm(nextAlgorithm);
        selectedAlgorithm = nextAlgorithm;
        ox_array = undefined;
        ox_q10_array = undefined;
        ox_q90_array = undefined;
        ox_q95_array = undefined;
        p_array = undefined;
        if (myChart) {
            myChart.destroy();
            myChart = null;
        }
        await updateCenter();
    }

    onDestroy(() => {
        if (map) {
            map.remove();
            map = null;
        }
        if (myChart) {
            myChart.destroy();
            myChart = null;
        }
        clearTimeout(debounceTimer);
    });
</script>

<div class="map-viewport">
    <div id="map">
    <div class="info-box"
        style={getInfoBoxStyle(infoBoxAlertLevel)}
        on:touchstart|stopPropagation
        on:touchmove|stopPropagation
        on:touchend|stopPropagation
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
        on:click|stopPropagation
    >
        <div class="address-overlay">{address}</div>
        <div class="start-time-overlay">{formatStartTime(now)}</div>
        {#if viewMode === 'pro'}
            <div class="pmax-value">{p_max}%</div>
            <div class="pmax-label">
                (光化学オキシダント濃度が24時間以内に注意報発令レベルに達する確率)
            </div>
            <div class="exceedance-periods">
                <div class="exceedance-periods-label">警戒濃度(100ppb)到達予想</div>
                <div class="exceedance-periods-value">{alertPeriodsText}</div>
            </div>
        {:else}
            <div class="air-status-face" aria-label={generalAirMessage.statusLabel}>
                {generalAirMessage.statusIcon}
            </div>
            <span class="air-trend-label">{generalAirMessage.trendLabel}</span>
            {#if generalAirMessage.ppbText}
                <div class="air-ppb-hint">{generalAirMessage.ppbText}</div>
            {/if}
            <div class="air-message-body">{generalAirMessage.message}</div>
        {/if}
        <!-- {#if sunriseTime && sunsetTime}
            <div class="sun-times">
                <div>日の出: {formatTime(sunriseTime)}</div>
                <div>日の入り: {formatTime(sunsetTime)}</div>
            </div>
        {/if} -->
    </div>
    <div class="tile-info-overlay">{addr_dict.X} {addr_dict.Y}</div>
    <div class="chart-container">
        <canvas id="myChart" class="chart-overlay"></canvas>
    </div>
    <div class="info-button-container">
        <button class="info-button" on:click={toggleInfoModal}>
            <span class="info-icon">i</span>
        </button>
    </div>
    <div class="location-button-container">
        <button class="current-location-button" on:click={moveToCurrentLocation}>
            <img src="/images/near_me.svg" alt="現在地に移動" />
        </button>
    </div>
    {#if isDemoMode}
        <div class="demo-banner">
            デモモード
        </div>
    {/if}
    {#if isLoadingData}
        <div class="loading-overlay">
            {loadingStatusText}
        </div>
    {/if}
    {#if serverBusy}
        <div class="server-busy-banner">
            サーバが混み合っています。しばらくしてから再度お試しください。
            {#if errorStatus}
                <span style="margin-left:8px;">(エラー番号: {errorStatus})</span>
            {/if}
        </div>
    {/if}
    <div class="algorithm-switcher">
        <label for="algorithm-select">予測アルゴリズム</label>
        <select
            id="algorithm-select"
            bind:value={selectedAlgorithm}
            on:mousedown|stopPropagation
            on:touchstart|stopPropagation
            on:click|stopPropagation
            on:change={handleAlgorithmChange}
        >
            {#each algorithmOptions as option}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>
    </div>
    </div>
    <div class="crosshair-container" aria-hidden="true">
        <svg class="crosshair" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle
                cx="16"
                cy="16"
                r="13.1"
                fill="none"
                stroke="#e91f00"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-miterlimit="10"
            />
            <line
                x1="1"
                y1="16"
                x2="12.2"
                y2="16"
                stroke="#e91f00"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-miterlimit="10"
            />
            <line
                x1="19.8"
                y1="16"
                x2="31"
                y2="16"
                stroke="#e91f00"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-miterlimit="10"
            />
            <line
                x1="16"
                y1="1"
                x2="16"
                y2="12.2"
                stroke="#e91f00"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-miterlimit="10"
            />
            <line
                x1="16"
                y1="19.8"
                x2="16"
                y2="31"
                stroke="#e91f00"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-miterlimit="10"
            />
            <circle cx="16" cy="16" r="0.9" fill="#e91f00" />
        </svg>
    </div>
</div>

<InfoModal isOpen={isInfoModalOpen} onClose={toggleInfoModal} />

<style>
    /* Resetting default margins and paddings */
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    button {
        z-index: 10000;
    }

    .map-viewport {
        position: absolute;
        top: 10vh;
        left: 0;
        height: 90vh;
        width: 100vw;
        z-index: 100;
    }

    #map {
        position: relative;
        width: 100%;
        height: 100%;
    }

    .crosshair-container {
        position: fixed;
        top: 55vh;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        pointer-events: none;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .crosshair {
        display: block;
        width: 32px;
        height: 32px;
    }

    .info-box {
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(255, 255, 255, 0.7);
        padding: 10px;
        border-radius: 4px;
        border: 1px solid black;
        text-align: center;
        z-index: 10000;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .chart-container {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 50%;
        z-index: 900;
    }

    .chart-overlay {
        width: 100%;
        height: 100%;
        z-index: 900;
    }

    .address-overlay {
        font-size: 16px;
        white-space: nowrap;
        margin-bottom: 5px;
    }

    .start-time-overlay {
        font-size: 10pt;
        color: black;
        margin-bottom: 5px;
    }

    .pmax-value {
        font-size: 36pt;
        font-weight: bold;
        color: black;
        margin-bottom:5px;
    }

    .tile-info-overlay {
        position: absolute;
        bottom: 10px;
        left: 10px;
        background-color: rgba(255, 255, 255, 0.5);
        padding: 4px;
        border-radius: 4px;
        border: 1px solid black;
        font-size: 12px;
        z-index: 1000;
    }

    .pmax-label {
        font-size: 9pt;
        color: black;
    }

    .exceedance-periods {
        margin-top: 4px;
        margin-bottom: 4px;
    }

    .exceedance-periods-label {
        font-size: 9pt;
        color: #333;
    }

    .exceedance-periods-value {
        font-size: 14pt;
        font-weight: bold;
        color: black;
    }

    .air-status-face {
        font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
        font-size: calc(10pt * 2.5);
        line-height: 1;
        margin: 4px 0 6px;
    }

    .air-trend-label {
        font-size: 10pt;
        font-weight: bold;
        color: #444;
        white-space: nowrap;
    }

    .air-ppb-hint {
        font-size: 8pt;
        color: #999;
        margin-bottom: 4px;
    }

    .air-message-body {
        font-size: 10pt;
        line-height: 1.45;
        color: #222;
        max-width: 320px;
        text-align: center;
    }

    .info-button-container {
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 1000;
        width: 40px;
        height: 40px;
    }

    .location-button-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        width: 40px;
        height: 40px;
    }

    .info-button {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: white;
        border: 2px solid #4a4a4a;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
    }

    .info-button:hover {
        background-color: #f0f0f0;
        transform: scale(1.05);
    }

    .info-icon {
        font-family: Arial, sans-serif;
        font-weight: bold;
        font-size: 20px;
        color: #4a4a4a;
    }

    .current-location-button {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: white;
        border: 2px solid #4a4a4a;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
        padding: 0;
    }

    .current-location-button:hover {
        background-color: #f0f0f0;
        transform: scale(1.05);
    }

    .current-location-button img {
        width: 24px;
        height: 24px;
    }

    .demo-banner {
        position: fixed;
        top: 10px;
        right: 10px;
        background-color: rgba(255, 255, 255, 0.7);
        padding: 5px 10px;
        border-radius: 4px;
        border: 1px solid black;
        font-size: 12px;
        z-index: 10000;
    }

    .sun-times {
        font-size: 10pt;
        color: black;
        margin-top: 5px;
        text-align: center;
    }

    .loading-overlay {
        position: fixed;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.75);
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 20000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .server-busy-banner {
        position: fixed;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(255, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 16px;
        z-index: 20000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-weight: bold;
    }

    .algorithm-switcher {
        position: fixed;
        bottom: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        line-height: 1.2;
        color: #333;
        background-color: rgba(255, 255, 255, 0.55);
        padding: 4px 6px;
        border-radius: 3px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        z-index: 1100;
        pointer-events: auto;
    }

    .algorithm-switcher select {
        font-size: 11px;
        border: 1px solid rgba(0, 0, 0, 0.25);
        border-radius: 3px;
        background-color: rgba(255, 255, 255, 0.95);
        padding: 2px 4px;
    }

</style>
