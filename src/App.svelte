<script>
    import { onMount, afterUpdate, onDestroy } from 'svelte';
    import 'leaflet/dist/leaflet.css';
    import L from 'leaflet';
    import { fetchPredict, fetchAddress, fetchPtable, fetchObserve } from './retrieve.js';
    import Chart from 'chart.js/auto';
    import { getChartConfig } from './chartConfig.js';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import { findMatchingRowIndex, formatTime, formatStartTime, getGradientColor } from './utils.js';
    import InfoModal from './components/InfoModal.svelte';
    import SunCalc from 'suncalc';

    let map;
    let ox_dict;
    let ox_obs;
    let address = "";
    let addr_dict = {};
    let ox_array;
    let ox_obs_array;
    let p_array;
    let p_max = 0;
    let now = new Date("2015-07-27 06:00+09:00"); // undefinedは困る
    let ptable;
    let myChart;
    let center = [35.331586, 139.349782];
    let debounceTimer;
    let updateFlag = false;
    let isInfoModalOpen = false;
    let isDemoMode = false;
    let sunriseTime = null;
    let sunsetTime = null;
    let serverBusy = false;
    let errorStatus = null;
    let tileBoundaryLayer = null;

    // 地図の表示領域を定数として設定
    const MAP_TOP_PERCENT = 10; // 地図の上端位置（%）
    const MAP_HEIGHT_PERCENT = 100 - MAP_TOP_PERCENT; // 地図の高さ（%）
    const MAP_CENTER_PERCENT = MAP_TOP_PERCENT + (MAP_HEIGHT_PERCENT / 2); // 地図の中心位置（%）

    function checkDemoMode() {
        const url = new URL(window.location.href);
        isDemoMode = url.searchParams.has('demo') || url.pathname.endsWith('/demo');
    }

    function updateNow() {
        if (isDemoMode) {
            now = new Date("2015-07-27 06:00+09:00");
        } else {
            now = new Date();
            now.setMinutes(0);
            now.setSeconds(0);
            now.setMilliseconds(0);
        }
    }

    function drawChart(ox_array, ox_obs_array, p_array, now) {
            if (myChart) {
            myChart.destroy();
            myChart = null;
        }
        if (ox_array === undefined || ox_obs_array === undefined || p_array === undefined) return;
        // if (ox_array === undefined || p_array === undefined) return;

        const safeOxArray = ox_array.map(v => isNaN(v) ? null : v);
        const safeOxObsArray = ox_obs_array.map(v => isNaN(v) ? null : v);
        const safePArray = p_array.map(v => isNaN(v) ? null : v);
        console.log(safeOxObsArray)
        const ctx = document.getElementById('myChart')?.getContext('2d');
        if (ctx) {
            myChart = new Chart(ctx, getChartConfig(safeOxArray, safeOxObsArray, safePArray, now, formatTime, getGradientColor, sunriseTime, sunsetTime));
        }
    }

    async function updateCenter() {
        updateFlag = false;
        const c = map.getCenter();
        center = [c.lat, c.lng];
        console.log("center updated")
        serverBusy = false;
        
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
        
        try {
            await Promise.all([
                fetchPredict(now).then(result => { ox_dict = result }),
                fetchObserve(now).then(result => { ox_obs = result }),
                ptable === undefined ? fetchPtable().then(result => { ptable = result }) : Promise.resolve()
            ]);
            updateFlag = true;
            updateSunTimes();
        } catch (error) {
            if (error.message === '503' || error.message.includes('500')) {
                serverBusy = true;
                // エラー番号を抽出
                const match = error.message.match(/\d+/);
                errorStatus = match ? match[0] : null;
            }
            console.error(error);
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
                // エラー番号を抽出
                const match = error.message.match(/\d+/);
                errorStatus = match ? match[0] : null;
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

        // 地理院タイルの境界線を描画
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

        const fixedZoom = 12; // 固定のズームレベル
        const bounds = map.getBounds();
        
        tileBoundaryLayer = L.layerGroup();
        
        // 地図の表示範囲内のタイル座標を計算（Z=12固定）
        const tileBounds = getTileBounds(bounds, fixedZoom);
        

        
        // 境界線を描画
        for (let x = tileBounds.minX; x <= tileBounds.maxX; x++) {
            for (let y = tileBounds.minY; y <= tileBounds.maxY; y++) {
                const tileLatLngBounds = getTileLatLngBounds(x, y, fixedZoom);
                
                // 赤いタイル境界線を描画
                const redTile = L.polygon([
                    [tileLatLngBounds.south, tileLatLngBounds.west],
                    [tileLatLngBounds.south, tileLatLngBounds.east],
                    [tileLatLngBounds.north, tileLatLngBounds.east],
                    [tileLatLngBounds.north, tileLatLngBounds.west]
                ], {
                    color: 'gray',
                    weight: 1,
                    opacity: 0.2,
                    fillOpacity: 0
                });
                tileBoundaryLayer.addLayer(redTile);
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
        // 地理院タイルの座標系に合わせた変換
        const n = Math.pow(2, zoom);
        const west = (x / n) * 360 - 180;
        const east = ((x + 1) / n) * 360 - 180;
        const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
        const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
        
        return { north, south, east, west };
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

    $: if (updateFlag) {
        updateNow();
        if (ox_dict !== undefined && addr_dict !== undefined) {
            const row = findMatchingRowIndex(ox_dict.data.XY, addr_dict.X, addr_dict.Y);
            ox_array = Array.from({length: 24}, (_, i) => 
                Math.max(0, Math.round(ox_dict.data[`+${i + 1}`][row]))
            );
        }
        if (ox_obs !== undefined && addr_dict !== undefined) {
            console.log(ox_obs.data.XY);
            const row = findMatchingRowIndex(ox_obs.data.XY, addr_dict.X, addr_dict.Y);
            ox_obs_array = Array.from({length: 24}, (_, i) => {
                const dataKey = `${i - 23}`;
                const dataArray = ox_obs.data[dataKey];
                // console.log(dataArray)
                // console.log(row, dataArray.length)
                if (dataArray && row >= 0 && row < dataArray.length) {
                    const value = dataArray[row];
                    console.log(i-23, row, value)
                    return value === null || isNaN(value) ? 0 : Math.max(0, Math.round(value));
                }
                return 0;
            });
        }
        console.log(ox_obs.data)
        console.log(ox_obs_array)
        if (ptable !== undefined && ox_array !== undefined && ox_obs_array !== undefined) {
            p_array = ox_array.map(ox => {
                const roundedOx = Math.floor(ox / 5) * 5;
                const prob = ptable["120"][`(${roundedOx}, ${ox_array.indexOf(ox) + 1})`];
                return prob === undefined || isNaN(prob) ? NaN : Math.round(prob * 100);
            });
            p_max = Math.max(...p_array);
        }

        drawChart(ox_array, ox_obs_array, p_array, now);
        // drawChart(ox_array, p_array, now);
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

<div id="map">
    <div class="crosshair-container">
        <img class="crosshair" src="/images/crosshair.svg" alt="Target" />
    </div>
    <div class="info-box"
        on:touchstart|stopPropagation
        on:touchmove|stopPropagation
        on:touchend|stopPropagation
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
        on:click|stopPropagation
    >
        <div class="address-overlay">{address}</div>
        <div class="start-time-overlay">{formatStartTime(now)}</div>
        <div class="pmax-value">{p_max}%</div>
        <div class="pmax-label">
            (光化学オキシダント濃度が24時間以内に注意報発令レベルに達する確率)
        </div>
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
    {#if serverBusy}
        <div class="server-busy-banner">
            サーバが混み合っています。しばらくしてから再度お試しください。
            {#if errorStatus}
                <span style="margin-left:8px;">(エラー番号: {errorStatus})</span>
            {/if}
        </div>
    {/if}
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

    #map {
        position: absolute;
        top: 10vh;
        left: 0;
        height: 90vh;
        width: 100vw;
        z-index: 100;
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
</style>
