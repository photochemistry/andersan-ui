import annotationPlugin from 'chartjs-plugin-annotation';
import { getPpbFaceEmoji } from './utils.js';

export const getChartConfig = (ox_array, ox_obs_array, p_array, now, formatTime, getGradientColor, sunriseTime, sunsetTime, pastForecasts = [], obsByClockHour = null, ox_q10_array = null, ox_q90_array = null, ox_q95_array = null, positiveQuantileBand = false, viewMode = 'general') => {
// export const getChartConfig = (ox_array, p_array, now, formatTime, getGradientColor, sunriseTime, sunsetTime) => {
    const safePArray = p_array ?? Array(24).fill(null);
    const gradientColors = safePArray.map(prob =>
        prob === null || prob === undefined || isNaN(prob) ? 'rgba(255, 255, 255, 0)' : getGradientColor(prob / 100)
    );

    // 現在時刻から24時までの時間数を計算
    const currentHour = now.getHours();
    const remainingHours = 24 - currentHour;
    
    // データを現在時刻以降のものだけに制限
    const filteredOxArray = ox_array.slice(0, remainingHours);
    const filteredGradientColors = gradientColors.slice(0, remainingHours);
    // 0時から現在時刻までのデータをnullで埋める
    const paddedOxArray = Array(currentHour+1).fill(null).concat(filteredOxArray);
    const paddedGradientColors = Array(currentHour+1).fill('rgba(255, 255, 255, 0)').concat(filteredGradientColors);
    const paddedY120 = Array(24 + 1).fill(120);
    const isPro = viewMode === 'pro';

    const padFutureQuantileSeries = (series) => {
        if (!series || series.length !== 24) return null;
        const filtered = series.slice(0, remainingHours);
        return Array(currentHour + 1).fill(null).concat(filtered);
    };
    const paddedOxQ90 = padFutureQuantileSeries(ox_q90_array);
    const paddedOxQ10 = padFutureQuantileSeries(ox_q10_array);
    const paddedOxQ95 = padFutureQuantileSeries(ox_q95_array);
    const quantileBandBase = {
        borderColor: 'transparent',
        tension: 0.1,
        borderWidth: 0,
        pointRadius: 0,
        xAxisID: 'x',
        yAxisID: 'y',
        spanGaps: false,
        order: 5
    };
    let quantileBandDatasets = [];
    if (positiveQuantileBand && paddedOxQ90) {
        quantileBandDatasets = [
            ...(paddedOxQ95
                ? [
                      {
                          label: '予測95%分位(ppb)',
                          data: paddedOxQ95,
                          backgroundColor: 'transparent',
                          fill: false,
                          ...quantileBandBase
                      },
                      {
                          label: '予測90-95%分位幅(ppb)',
                          data: paddedOxQ90,
                          backgroundColor: 'rgba(75, 192, 192, 0.15)',
                          fill: '-1',
                          ...quantileBandBase
                      },
                      {
                          label: '予測50-90%分位幅(ppb)',
                          data: paddedOxArray,
                          backgroundColor: 'rgba(75, 192, 192, 0.28)',
                          fill: '-1',
                          ...quantileBandBase
                      }
                  ]
                : [
                      {
                          label: '予測90%分位(ppb)',
                          data: paddedOxQ90,
                          backgroundColor: 'transparent',
                          fill: false,
                          ...quantileBandBase
                      },
                      {
                          label: '予測50-90%分位幅(ppb)',
                          data: paddedOxArray,
                          backgroundColor: 'rgba(75, 192, 192, 0.28)',
                          fill: '-1',
                          ...quantileBandBase
                      }
                  ])
        ];
    } else if (paddedOxQ90 && paddedOxQ10) {
        quantileBandDatasets = [
            {
                label: '予測90%分位(ppb)',
                data: paddedOxQ90,
                backgroundColor: 'transparent',
                fill: false,
                ...quantileBandBase
            },
            {
                label: '予測10-90%分位幅(ppb)',
                data: paddedOxQ10,
                backgroundColor: 'rgba(75, 192, 192, 0.28)',
                fill: '-1',
                ...quantileBandBase
            }
        ];
    }
    const showQuantileBand = quantileBandDatasets.length > 0;

    /** デモ時: 指定時刻以降の実測も当日 0〜24 時に沿って表示（予測との比較用） */
    const paddedOxObsArray =
        obsByClockHour && obsByClockHour.length === 25
            ? obsByClockHour.map((v) => (v === undefined || (typeof v === 'number' && isNaN(v)) ? null : v))
            : (() => {
                  const filteredOxObsArray = ox_obs_array.slice(23 - currentHour, 24);
                  return filteredOxObsArray.concat(Array(24 - filteredOxObsArray.length).fill(null));
              })();

    const pastPredictDatasets = (pastForecasts || []).map(({ anchorHour, padded }) => ({
        label: `OX予測(${anchorHour}時起点)`,
        data: padded,
        borderColor: 'rgba(75, 192, 192, 0.5)',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        tension: 0.1,
        fill: false,
        borderWidth: 2,
        pointRadius: 0,
        xAxisID: 'x',
        yAxisID: 'y',
        spanGaps: true,
        order: 0
    }));

    return {
        type: 'line',
        data: {
            labels: Array.from({length: 25}, (_, i) => i),
            datasets: [
                ...pastPredictDatasets,
                ...(isPro
                    ? [
                          {
                              type: 'line',
                              label: '注意報レベル(120ppb)',
                              data: paddedY120,
                              borderColor: 'red',
                              borderWidth: 2,
                              pointRadius: 0,
                              fill: false,
                              xAxisID: 'x',
                              yAxisID: 'y',
                              spanGaps: true,
                              order: 2
                          }
                      ]
                    : []),
                {
                    // type: 'line',
                    label: 'Ox実測値(ppb)',
                    data: paddedOxObsArray,
                    borderColor: 'blue',
                    tension: 0.1,
                    borderWidth: 2,
                    // pointRadius: 0,
                    fill: false,
                    xAxisID: 'x',
                    yAxisID: 'y',
                    spanGaps: true,
                    order: 3
                },
                ...quantileBandDatasets,
                {
                    label: 'OX予測(ppb)',
                    data: paddedOxArray,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: showQuantileBand
                        ? false
                        : isPro
                          ? {
                                target: 'origin',
                                above: ctx => {
                                    const { ctx: context, chartArea } = ctx.chart;
                                    const gradient = context.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
                                    paddedGradientColors.forEach((color, i) => gradient.addColorStop(i / (paddedGradientColors.length - 1), color));
                                    return gradient;
                                },
                            }
                          : false,
                    backgroundColor: showQuantileBand || !isPro ? 'rgba(0, 0, 0, 0)' : paddedGradientColors,
                    pointRadius: 0,
                    yAxisID: 'y',
                    spanGaps: true,
                    order: 4
                },
            ],
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    title: { display: false },
                    grid: { display: false },
                    ticks: {
                        display: true,
                        align: 'inner',
                        mirror: true,
                        callback: (value, index) => {
                            const hour = index;
                            if (hour === 6 || hour === 12 || hour === 18) {
                                const time = new Date(now);
                                time.setHours(hour);
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
                    title: { display: false },
                    min: 0,
                    max: 150,
                    grid: { display: false },
                    border: { display: false },
                    ticks: { display: false }
                },
                'y-right': { display: false },
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (value !== null && value !== undefined) {
                                return `${label}: ${value}`;
                            }
                            return null;
                        }
                    }
                },
                legend: {
                    display: false
                },
                annotation: {
                    annotations: {
                        ...(viewMode === 'general'
                            ? {
                                  asthmaAlertBand: {
                                      type: 'box',
                                      yMin: 60,
                                      yMax: 100,
                                      backgroundColor: 'rgba(255, 235, 59, 0.30)',
                                      borderWidth: 0,
                                      drawTime: 'beforeDatasetsDraw',
                                  },
                              }
                            : {}),
                        warningAlertBand: {
                            type: 'box',
                            yMin: 100,
                            yMax: isPro ? 120 : 150,
                            backgroundColor: 'rgba(255, 152, 0, 0.30)',
                            borderWidth: 0,
                            drawTime: 'beforeDatasetsDraw',
                        },
                        ...(isPro
                            ? {
                                  advisoryAlertBand: {
                                      type: 'box',
                                      yMin: 120,
                                      yMax: 150,
                                      backgroundColor: 'rgba(244, 67, 54, 0.25)',
                                      borderWidth: 0,
                                      drawTime: 'beforeDatasetsDraw',
                                  },
                                  redLineLabel: {
                                      type: 'label',
                                      xValue: 0,
                                      yValue: 120,
                                      content: '注意報レベル(120ppb)',
                                      color: 'red',
                                      font: {
                                          size: 12,
                                          weight: 'bold'
                                      },
                                      position: 'start',
                                      backgroundColor: 'white',
                                      borderColor: 'red',
                                      borderWidth: 1,
                                      padding: 4
                                  },
                              }
                            : {}),
                        // 青線（実測値）のラベル
                        blueLineLabel: {
                            type: 'label',
                            xValue: 0,
                            yValue: 50,
                            content: 'Ox実測値(ppb)',
                            color: 'blue',
                            font: {
                                size: 12,
                                weight: 'bold'
                            },
                            position: 'start',
                            backgroundColor: 'white',
                            borderColor: 'blue',
                            borderWidth: 1,
                            padding: 4
                        },
                        // 水色線（予測値）のラベル
                        cyanLineLabel: {
                            type: 'label',
                            xValue: 24,
                            yValue: 50,
                            content: 'OX予測(ppb)',
                            color: 'rgb(75, 192, 192)',
                            font: {
                                size: 12,
                                weight: 'bold'
                            },
                            position: 'end',
                            backgroundColor: 'white',
                            borderColor: 'rgb(75, 192, 192)',
                            borderWidth: 1,
                            padding: 4
                        }
                    }
                }
            },
        },
        plugins: [{
            id: 'nightShading',
            beforeDraw: (chart) => {
                const ctx = chart.canvas.getContext('2d');
                const { chartArea } = chart;
                
                // グラフの背景をクリア
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0)';
                ctx.fillRect(0, 0, chart.width, chart.height);
                
                // 夜間の時間帯を黒い長方形で表示
                if (chartArea && sunriseTime && sunsetTime) {
                    const sunriseHour = sunriseTime.getHours() + sunriseTime.getMinutes() / 60;
                    const sunsetHour = sunsetTime.getHours() + sunsetTime.getMinutes() / 60;
                    
                    // 日の出前の時間帯（0時から日の出まで）
                    const beforeSunriseWidth = (sunriseHour / 24) * chartArea.width;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
                    ctx.fillRect(chartArea.left, chartArea.top, beforeSunriseWidth, chartArea.height);
                    
                    // 日の入り後の時間帯（日の入りから24時まで）
                    const afterSunsetWidth = ((24 - sunsetHour) / 24) * chartArea.width;
                    const afterSunsetX = chartArea.left + (sunsetHour / 24) * chartArea.width;
                    ctx.fillRect(afterSunsetX, chartArea.top, afterSunsetWidth, chartArea.height);
                }
                
                ctx.restore();
            },
        }, {
            id: 'ppbFaceMarkers',
            afterDatasetsDraw(chart) {
                if (isPro) return;
                const datasetIndex = chart.data.datasets.findIndex((d) => d.label === 'OX予測(ppb)');
                if (datasetIndex < 0) return;
                const meta = chart.getDatasetMeta(datasetIndex);
                const ctx = chart.ctx;
                const fontSize = Math.max(12, Math.min(18, chart.chartArea.width / 28));
                ctx.save();
                ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                meta.data.forEach((point, index) => {
                    const ppb = paddedOxArray[index];
                    if (ppb === null || ppb === undefined || !Number.isFinite(ppb)) return;
                    const { x, y } = point.getProps(['x', 'y'], true);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                    ctx.fillText(getPpbFaceEmoji(ppb), x, y - 4);
                });
                ctx.restore();
            },
        }]
    };
}; 