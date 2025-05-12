export const getChartConfig = (ox_array, p_array, now, formatTime, getGradientColor) => {
    const y120 = Array(24).fill(120);
    const gradientColors = p_array.map(prob => getGradientColor(prob / 100));

    // 現在時刻から24時までの時間数を計算
    const currentHour = now.getHours();
    const remainingHours = 24 - currentHour;
    
    // データを現在時刻以降のものだけに制限
    const filteredOxArray = ox_array.slice(0, remainingHours);
    const filteredGradientColors = gradientColors.slice(0, remainingHours);
    const filteredY120 = y120.slice(0, remainingHours);

    // 0時から現在時刻までのデータをnullで埋める
    const paddedOxArray = Array(currentHour).fill(null).concat(filteredOxArray);
    const paddedGradientColors = Array(currentHour).fill('rgba(255, 255, 255, 0)').concat(filteredGradientColors);
    const paddedY120 = Array(24).fill(120); // 注意報レベルは常に120で24時間分

    return {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => i + 1),
            datasets: [
                {
                    label: 'OX Prediction (ppb)',
                    data: paddedOxArray,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: {
                        target: 'origin',
                        above: ctx => {
                            const { ctx: context, chartArea } = ctx.chart;
                            const gradient = context.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
                            paddedGradientColors.forEach((color, i) => gradient.addColorStop(i / (paddedGradientColors.length - 1), color));
                            return gradient;
                        },
                    },
                    backgroundColor: paddedGradientColors,
                    yAxisID: 'y',
                    spanGaps: true
                },
                {
                    type: 'line',
                    label: '注意報レベル',
                    data: paddedY120,
                    borderColor: 'red',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    xAxisID: 'x',
                    yAxisID: 'y',
                    spanGaps: true
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Hours' },
                    grid: { display: false },
                    ticks: {
                        align: 'inner',
                        mirror: true,
                        callback: (value, index) => {
                            if ((index + 1) % 3 === 0 || index === 0) {
                                const time = new Date(now);
                                time.setHours(index);
                                time.setMinutes(0);
                                return `${formatTime(time)}`;
                            }
                            return null;
                        }
                    }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    title: { display: true, text: 'OX (ppb)' },
                    min: 0,
                    max: 150,
                    grid: { display: true },
                    border: { display: true },
                    ticks: { stepSize: 30 }
                },
                'y-right': { display: false },
            },
            plugins: {
                legend: {
                    labels: {
                        filter: item => item.text !== 'Probability of exceeding 120ppm (%)'
                    }
                }
            }
        },
        plugins: [{
            beforeDraw: (chart) => {
                const ctx = chart.canvas.getContext('2d');
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0)';
                ctx.fillRect(0, 0, chart.width, chart.height);
                ctx.restore();
            },
        }]
    };
}; 