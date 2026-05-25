export const findMatchingRowIndex = (array, targetValue1, targetValue2) => {
    if (!array || !Array.isArray(array)) {
        return -1;
    }
    return array.findIndex(row => row[0] === targetValue1 && row[1] === targetValue2);
};

export const formatTime = (date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

export const formatStartTime = (date) => {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    return `${month}月${day}日 ${hour}時時点`;
};

export const getGradientColor = (probability) => {
    const r = Math.round(255 * probability);
    const g = Math.round(255 * (1 - probability));
    const b = Math.round(255 * (1 - probability));
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
};

/**
 * 観測 API の data を、チャート X 軸の当日 0〜24 時に対応する 25 点に並べる。
 * キーは基準時刻からの相対時間（"-1", "0", "+1" など）。
 * @param {object} data ox_obs.data
 * @param {number} row グリッド行
 * @param {Date} chartNow チャート基準日時（予測基準時刻など）
 * @param {Date | null} obsAnchorTime 観測の source_time（なければ chartNow）
 */
export function buildObsByClockHour(data, row, chartNow, obsAnchorTime) {
    if (!data || row < 0) return Array(25).fill(null);
    const anchor = obsAnchorTime ? new Date(obsAnchorTime.getTime()) : new Date(chartNow.getTime());
    anchor.setMinutes(0, 0, 0, 0);
    anchor.setSeconds(0, 0);
    anchor.setMilliseconds(0);
    const base = new Date(chartNow.getTime());
    base.setMinutes(0, 0, 0, 0);
    base.setSeconds(0, 0);
    base.setMilliseconds(0);
    const arr = Array(25).fill(null);
    for (let h = 0; h <= 24; h++) {
        const slot = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, 0, 0, 0);
        const deltaMs = slot.getTime() - anchor.getTime();
        const delta = Math.round(deltaMs / 3600000);
        const keyCandidates =
            delta === 0 ? ['0'] : delta > 0 ? [`+${delta}`, `${delta}`] : [`${delta}`];
        let dataArray = null;
        for (const k of keyCandidates) {
            if (data[k]) {
                dataArray = data[k];
                break;
            }
        }
        if (!dataArray || row >= dataArray.length) continue;
        const v = dataArray[row];
        arr[h] = v === null || v === undefined || isNaN(v) ? null : Math.max(0, Math.round(v));
    }
    return arr;
} 