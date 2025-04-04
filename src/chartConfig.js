export const getChartConfig = (ox_array, p_array, now, formatTime, getGradientColor) => {
    const y120 = Array(24).fill(120);
    const gradientColors = p_array.map(prob => getGradientColor(prob / 100));

    return {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => i + 1),
            datasets: [
                {
                    label: 'OX Prediction (ppb)',
                    data: ox_array,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: {
                        target: 'origin',
                        above: ctx => {
                            const { ctx: context, chartArea } = ctx.chart;
                            const gradient = context.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
                            gradientColors.forEach((color, i) => gradient.addColorStop(i / (gradientColors.length - 1), color));
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
                    title: { display: true, text: 'Hours' },
                    grid: { display: false },
                    ticks: {
                        align: 'inner',
                        mirror: true,
                        callback: (value, index) => {
                            if ((index + 1) % 3 === 0 || index === 0) {
                                const futureTime = new Date(now);
                                futureTime.setHours(now.getHours() + index + 1);
                                return `${formatTime(futureTime)} (+${index + 1})`;
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