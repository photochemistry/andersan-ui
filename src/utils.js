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

/** 濃度 (ppb) に応じた顔文字（一般向けUI） */
export function getPpbFaceEmoji(ppb) {
    if (!Number.isFinite(ppb)) return '😊';
    if (ppb > 100) return '😷';
    if (ppb > 60) return '☹️';
    return '😊';
}

/** チャートの警戒帯と同系色（背景は半透明、枠線は不透明） */
export const ALERT_BAND_STYLES = {
    asthma: {
        backgroundColor: 'rgba(255, 235, 59, 0.30)',
        borderColor: 'rgb(255, 235, 59)',
    },
    warning: {
        backgroundColor: 'rgba(255, 152, 0, 0.30)',
        borderColor: 'rgb(255, 152, 0)',
    },
};

/** @returns {'warning'|'asthma'|null} */
export function getCurrentAlertLevel(ppb) {
    if (!Number.isFinite(ppb)) return null;
    if (ppb > 100) return 'warning';
    if (ppb > 60) return 'asthma';
    return null;
}

export function formatClockHour(hour, baseDate) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, 0, 0, 0);
    return formatTime(d);
}

/**
 * 予測系列から、基準時刻より未来で閾値を超える連続時間帯を返す。
 * @param {number[]} oxArray +1h..+24h の予測 (ppb)
 * @param {Date} baseTime 予測基準時刻
 * @param {number} thresholdPpb 閾値 (ppb)
 * @param {boolean} strict true なら > threshold、false なら >= threshold
 * @returns {{ startHour: number, endHour: number }[]}
 */
export function computeFutureExceedancePeriods(oxArray, baseTime, thresholdPpb, strict = false) {
    if (!oxArray || !baseTime) return [];
    const currentHour = baseTime.getHours();
    const periods = [];
    let startHour = null;

    const exceeds = (val) => {
        if (!Number.isFinite(val)) return false;
        return strict ? val > thresholdPpb : val >= thresholdPpb;
    };

    for (let h = currentHour + 1; h <= 24; h++) {
        const idx = h - currentHour - 1;
        const val = oxArray[idx];
        const over = exceeds(val);
        if (over && startHour === null) {
            startHour = h;
        } else if (!over && startHour !== null) {
            periods.push({ startHour, endHour: h });
            startHour = null;
        }
    }
    if (startHour !== null) {
        periods.push({ startHour, endHour: 24 });
    }
    return periods;
}

/**
 * @param {{ startHour: number, endHour: number }[]} periods
 * @param {Date} baseDate 当日の暦日
 */
export function formatExceedancePeriods(periods, baseDate) {
    if (!periods || periods.length === 0) return '該当なし';
    const base = baseDate ? new Date(baseDate.getTime()) : new Date();
    return periods
        .map(({ startHour, endHour }) => {
            const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), startHour, 0, 0, 0);
            const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), endHour, 0, 0, 0);
            return `${formatTime(start)}–${formatTime(end)}`;
        })
        .join('、');
}

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
    if (typeof data !== 'object') return Array(25).fill(null);
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
            const candidate = data?.[k];
            if (candidate) {
                dataArray = candidate;
                break;
            }
        }
        if (!dataArray || row >= dataArray.length) continue;
        const v = dataArray[row];
        arr[h] = v === null || v === undefined || isNaN(v) ? null : Math.max(0, Math.round(v));
    }
    return arr;
} 