<script>
    import { onMount, afterUpdate } from 'svelte';
    import 'leaflet/dist/leaflet.css';
    import L from 'leaflet';
    import { fetchData, fetchAddress, fetchPtable } from './retrieve.js';
    import Chart from 'chart.js/auto';

    // ... (rest of your existing code)

    let map;
    let ox_dict;
    let address = ""; // Initialize as an empty string
    let addr_dict = {};
    let ox_array;
    let p_array;
    let p_max = 0;
    let now = new Date("2015-07-27 06:00+09:00");
    let ptable;
    let myChart;
    let center = [35.331586, 139.349782]; // 地図の中心座標を保持する変数
    let debounceTimer; // デバウンスタイマー
    let updateFlag = false; // データ更新があったかどうかを示すフラグ

    function findMatchingRowIndex(array, targetValue1, targetValue2) {
        return array.findIndex(row => row[0] === targetValue1 && row[1] === targetValue2);
    }

    function formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function formatStartTime(date) {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hour = date.getHours().toString().padStart(2, '0');
        return `${month}月${day}日 ${hour}時時点`;
    }

    function getGradientColor(probability) {
        // 確率に応じて色を計算
        const r = Math.round(255 * probability); // 赤成分
        const g = Math.round(255 * (1 - probability));
        const b = Math.round(255 * (1 - probability));
        return `rgba(${r}, ${g}, ${b}, 0.5)`; // 透明度50%
    }

    //グラフ描画関数を定義
    function drawChart(ox_array, p_array, now) {
        if (myChart) {
            myChart.destroy();
            myChart = null;
        }
        if (ox_array === undefined || p_array === undefined) return;

        // p_array に NaN が含まれているかどうかをチェック
        if (p_array.some(isNaN)) {
            console.warn("p_array contains NaN. Skipping chart drawing.");
            // 以前に描画されたグラフをクリア
            const ctx = document.getElementById('myChart').getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return; // グラフ描画をスキップ
        }

        let x = []; // Changed to only include every 1 hours
        for (let hr = 1; hr <= 24; hr++) { // Increment by 1
            x.push(hr);
        }

        let xLabels = []; // Changed to only include every 3 hours
        for (let hr = 1; hr <= 24; hr += 3) { // Increment by 3
            const futureTime = new Date(now);
            futureTime.setHours(now.getHours() + hr);
            xLabels.push(`${formatTime(futureTime)} (+${hr})`);
        }

        let y1 = ox_array;
        let y2 = p_array;
        const y120 = [120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120,120];

        if (x.length > 0 && y1.length > 0 && y2.length > 0) {
            const ctx = document.getElementById('myChart').getContext('2d');
            const gradientColors = y2.map(prob => getGradientColor(prob / 100)); // 確率を0-1に正規化
            myChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: x, // Use x array as labels
                    datasets: [
                        {
                            label: 'OX Prediction (ppb)',
                            data: y1,
                            borderColor: 'rgb(75, 192, 192)',
                            tension: 0.1,
                            fill: {
                                target: 'origin',
                                above: ctx => {
                                    const chart = ctx.chart;
                                    const { ctx: context, chartArea } = chart;
                                    const data = chart.data.datasets[0].data;
                                    const colors = chart.data.datasets[0].backgroundColor;
                                    // データが複数ある場合、グラデーションを作成
                                    const gradient = context.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
                                    for (let i = 0; i < data.length; i++) {
                                        gradient.addColorStop(i / (data.length - 1), colors[i]);
                                    }
                                    return gradient;
                                },
                            },
                            backgroundColor: gradientColors,
                            yAxisID: 'y',
                        },
                        {
                            type: 'line',
                            label: '注意報レベル',
                            data: y120,
                            borderColor: 'red',
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: false,
                            xAxisID: 'x',
                            yAxisID: 'y'
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Hours',
                            },
                            grid:{
                                display:false // Remove grid lines
                            },
                            ticks: {
                                align: 'inner', // Move labels inside
                                mirror: true, // Mirror the ticks inside
                                callback: function(value, index, ticks) {
                                    // Display label only if it's in xLabels
                                    if ((index + 1) % 3 === 0 || index === 0) {
                                        const futureTime = new Date(now);
                                        futureTime.setHours(now.getHours() + index + 1);
                                        return `${formatTime(futureTime)} (+${index + 1})`;
                                    }
                                    return null; // Hide label otherwise
                                }
                            }
                        },
                        y: {
                            type: 'linear',
                            position: 'left',
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'OX (ppb)',
                            },
                            min: 0, // 最小値を0に設定
                            max: 150, // 最大値を150に設定,
                            grid:{
                                display:true
                            },
                            border:{
                                display:true
                            },
                            ticks:{
                                stepSize:30
                            }
                        },
                        'y-right': {
                            display: false,
                        },
                    },
                    plugins: {
                        legend: {
                            labels: {
                                filter: function(item, chart) {
                                    return item.text !== 'Probability of exceeding 120ppm (%)';
                                }
                            }
                        }
                    }
                },
                plugins: [{
                    beforeDraw: (chart) => {
                        const ctx = chart.canvas.getContext('2d');
                        ctx.save();
                        ctx.fillStyle = 'rgba(255, 255, 255, 0)'; // 背景を完全に透明にする
                        ctx.fillRect(0, 0, chart.width, chart.height);
                        ctx.restore();
                    },
                }]
            });
        }
    }


    async function updateCenter() {
        updateFlag = false;
        const c = map.getCenter();
        center = [c.lat, c.lng];
        console.log("center updated")
        // 非同期処理をまとめて実行
        await Promise.all([
            fetchData(now).then(result => { ox_dict = result }),
            ptable === undefined ? fetchPtable().then(result => { ptable = result }) : Promise.resolve()
        ]);
        updateFlag = true;
    }

    async function updateAddress() {
        const c = map.getCenter();
        const latitude = c.lat;
        const longitude = c.lng;
        await fetchAddress(longitude, latitude).then(a => {
            addr_dict = a;
            // Parse the address string
            const addressParts = a.address.split(',');
            if (addressParts.length >= 4) {
                const prefecture = addressParts[addressParts.length - 3].trim(); // Prefecture is the second-to-last part
                const city = addressParts[addressParts.length - 4].trim(); // City is the third-to-last part
                address = `${prefecture} ${city}`; // Format the address
            } else {
                address = a.address; // If not enough parts, use the original address
            }
        });
    }
    function debounceUpdateCenter() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateCenter, 1000);
    }

    onMount(() => {
        // 平塚市中心部を初期表示、ズームレベルを12に設定
        map = L.map('map', { zoomControl: false }).setView([35.331586, 139.349782], 12);

        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
        }).addTo(map);

        // moveend イベントのリスナーを追加
        map.on('moveend', updateAddress);
        // 初期表示時に updateCenter を実行
        updateCenter();
        updateAddress();
    });

    const moveToCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        const latitude = 35 + 20 / 60 + 8 / 3600;
        const longitude = 139 + 20 / 60 + 58 / 3600;
        map.setView([latitude, longitude], 12);
        updateCenter();
    };

    afterUpdate(() => {
        if (myChart) {
            myChart.resize();
        }
    });

    $: if (updateFlag) {
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        //ox_arrayの計算
        if (ox_dict !== undefined) {
            if (addr_dict !== undefined) {
                let row = findMatchingRowIndex(ox_dict.data.XY, addr_dict.X, addr_dict.Y);
                ox_array = [];
                for (let hr = 1; hr <= 24; hr++) {
                    ox_array.push(Math.round(ox_dict.data[`+${hr}`][row]));
                }
            }
        }
        //p_arrayの計算
        if (ptable !== undefined && ox_array !== undefined) {
            p_array = [];
            for (let hr = 1; hr <= 24; hr++) {
                let ox = Math.floor(ox_array[hr - 1] / 5) * 5;
                let b = `(${ox}, ${hr})`;
                let a = "120";
                let prob = ptable[a][b];
                if (prob === undefined || isNaN(prob)) {
                    p_array.push(NaN); // NaN の場合は NaN を代入する
                } else {
                    p_array.push(Math.round(prob * 100));
                }
            }
            p_max = Math.max(...p_array);
        }
        //グラフ描画処理
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
    <button class="current-location-button" on:click={moveToCurrentLocation}>
        <img src="/images/near_me.svg" alt="現在地に移動" />
    </button>
</div>

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
        min-height: 100vh; /* Use min-height instead of height */
        height: calc(100vh - env(safe-area-inset-bottom)); /* Use calc() for more accurate height */
        width: 100vw;
        padding-bottom: env(safe-area-inset-bottom); /* Add padding for safe area */
    }

    .crosshair-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        pointer-events: none; /* アイコンがクリックイベントを邪魔しないようにする */
        display: flex; /* 画像を中央に配置するためのFlexbox */
        justify-content: center; /* 水平方向の中央揃え */
        align-items: center; /* 垂直方向の中央揃え */
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
        top: 10px;
        right: 10px;
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

    .current-location-button {
        position: absolute;
        bottom: env(safe-area-inset-bottom); /* Adjust bottom position for safe area */
        right: 10px;
        background-color: #333;
        border: none;
        border-radius: 50%;
        padding: 6px;
        cursor: pointer;
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: transform 0.2s ease-in-out;
    }

    .current-location-button img {
        width: 32px;
        height: 32px;
    }

    .current-location-button:hover {
        transform: scale(1.1);
    }

</style>
