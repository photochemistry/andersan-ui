<script>
    import { onMount, afterUpdate } from 'svelte';
    import 'leaflet/dist/leaflet.css';
    import L from 'leaflet';
    import { fetchData, fetchAddress, fetchPtable } from './retrieve.js';
    import Chart from 'chart.js/auto';
    import { getChartConfig } from './chartConfig.js';
    import { findMatchingRowIndex, formatTime, formatStartTime, getGradientColor } from './utils.js';
    import InfoModal from './components/InfoModal.svelte';

    let map;
    let ox_dict;
    let address = "";
    let addr_dict = {};
    let ox_array;
    let p_array;
    let p_max = 0;
    let now = new Date("2015-07-27 06:00+09:00");
    let ptable;
    let myChart;
    let center = [35.331586, 139.349782];
    let debounceTimer;
    let updateFlag = false;
    let isInfoModalOpen = false;

    function drawChart(ox_array, p_array, now) {
        if (myChart) {
            myChart.destroy();
            myChart = null;
        }
        if (ox_array === undefined || p_array === undefined) return;

        if (p_array.some(isNaN)) {
            console.warn("p_array contains NaN. Skipping chart drawing.");
            const ctx = document.getElementById('myChart').getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        const ctx = document.getElementById('myChart').getContext('2d');
        myChart = new Chart(ctx, getChartConfig(ox_array, p_array, now, formatTime, getGradientColor));
    }

    async function updateCenter() {
        updateFlag = false;
        const c = map.getCenter();
        center = [c.lat, c.lng];
        console.log("center updated")
        await Promise.all([
            fetchData(now).then(result => { ox_dict = result }),
            ptable === undefined ? fetchPtable().then(result => { ptable = result }) : Promise.resolve()
        ]);
        updateFlag = true;
    }

    async function updateAddress() {
        const c = map.getCenter();
        const { lat: latitude, lng: longitude } = c;
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
    }

    function debounceUpdateCenter() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateCenter, 1000);
    }

    onMount(() => {
        map = L.map('map', { zoomControl: false }).setView([35.331586, 139.349782], 12);

        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
        }).addTo(map);

        map.on('moveend', updateAddress);
        updateCenter();
        updateAddress();
    });

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
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);

        if (ox_dict !== undefined && addr_dict !== undefined) {
            const row = findMatchingRowIndex(ox_dict.data.XY, addr_dict.X, addr_dict.Y);
            ox_array = Array.from({length: 24}, (_, i) => 
                Math.round(ox_dict.data[`+${i + 1}`][row])
            );
        }

        if (ptable !== undefined && ox_array !== undefined) {
            p_array = ox_array.map(ox => {
                const roundedOx = Math.floor(ox / 5) * 5;
                const prob = ptable["120"][`(${roundedOx}, ${ox_array.indexOf(ox) + 1})`];
                return prob === undefined || isNaN(prob) ? NaN : Math.round(prob * 100);
            });
            p_max = Math.max(...p_array);
        }

        drawChart(ox_array, p_array, now);
    }
</script>

<div id="map">
    <div class="crosshair-container">
        <img class="crosshair" src="/images/crosshair.svg" alt="Target" />
    </div>
    <div class="info-box">
        <div class="address-overlay">{address}</div>
        <div class="start-time-overlay">{formatStartTime(now)}</div>
        <div class="pmax-value">{p_max}%</div>
        <div class="pmax-label">(光化学オキシダント濃度が24時間以内に注意報発令レベルに達する確率)</div>
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
        position: relative;
        min-height: 100vh;
        height: calc(100vh - env(safe-area-inset-bottom));
        width: 100vw;
        padding-bottom: env(safe-area-inset-bottom);
    }

    .crosshair-container {
        position: fixed;
        top: 50%;
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
        position: absolute;
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
        position: absolute;
        top: 20px;
        left: 20px;
        z-index: 1000;
        width: 40px;
        height: 40px;
    }

    .location-button-container {
        position: absolute;
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
</style>
