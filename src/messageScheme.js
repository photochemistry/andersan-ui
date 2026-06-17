/**
 * scheme.md に基づく一般向けメッセージ分岐
 */

import { getPpbFaceEmoji } from './utils.js';

/** @typedef {'normal'|'caution'|'alert'} AirState */
/** @typedef {'morning'|'afternoon'|'evening'} TimeSlot */
/** @typedef {'rising'|'stable'|'falling'|'afternoon_rise'|'peak_maintain'|'night_stagnation'} ForecastTrend */

const STATUS_META = {
    normal: { label: '良好', className: 'normal' },
    caution: { label: 'やや高め', className: 'caution' },
    alert: { label: '注意', className: 'alert' },
};

const TREND_LABELS = {
    rising: { morning: '午後にかけて ↗', afternoon: 'このまま ↗', evening: '夜にかけて ↗' },
    stable: { morning: 'このまま ➔', afternoon: 'このまま ➔', evening: 'このまま ➔' },
    falling: { morning: 'このまま ➔', afternoon: '夕方から ↘', evening: '夜にかけて ↘' },
    afternoon_rise: { morning: '午後にかけて ↗', afternoon: 'このまま ➔', evening: 'このまま ➔' },
    peak_maintain: { morning: 'このまま ➔', afternoon: 'このまま ➔', evening: 'このまま ➔' },
    night_stagnation: { morning: 'このまま ➔', afternoon: 'このまま ➔', evening: 'このまま ➔' },
};

const MESSAGES = {
    morning: {
        normal: {
            stable: '空気はきれいです。今日は一日を通して良好な状態が続く見込みです。',
            afternoon_rise: '現在は良好ですが、日射しが強まる午後に向けて濃度が上がりやすくなる予測です。',
        },
        caution: {
            rising: 'すでに濃度が高めです。午後にかけてさらに上がりやすくなるため、外での激しい運動にはご注意ください。',
            stable: 'すでに濃度が高めです。午後にかけてさらに上がりやすくなるため、外での激しい運動にはご注意ください。',
        },
        alert: {
            rising: 'すでに濃度が高めです。午後にかけてさらに上がりやすくなるため、外での激しい運動にはご注意ください。',
            stable: 'すでに濃度が高めです。午後にかけてさらに上がりやすくなるため、外での激しい運動にはご注意ください。',
        },
    },
    afternoon: {
        normal: {
            stable: '空気は良好な状態を保っています。このまま落ち着いた状態が続く見込みです。',
        },
        caution: {
            peak_maintain: '現在、少し空気がよどんでいます。夕方まではこの状態が続くため、敏感な方は長時間の屋外活動を控えましょう。',
            falling: '現在濃度が高めですが、日差しが弱まるとともに、これから徐々に改善していく見込みです。',
            stable: '現在、少し空気がよどんでいます。夕方まではこの状態が続くため、敏感な方は長時間の屋外活動を控えましょう。',
        },
        alert: {
            peak_maintain: '光化学スモッグが発生しやすい状態です。なるべく屋外での激しい運動を控え、屋内で涼しくお過ごしください。',
            stable: '光化学スモッグが発生しやすい状態です。なるべく屋外での激しい運動を控え、屋内で涼しくお過ごしください。',
        },
    },
    evening: {
        normal: {
            stable: '現在、大気の状態は落ち着いています。明日の予報も併せてご確認ください。',
        },
        caution: {
            falling: '日中の高い濃度が残っていますが、夜にかけて大気の状態は徐々に正常に戻っていきます。',
            night_stagnation: '風が弱く、空気がよどんだ状態が残っています。念のため、不要な窓の開放は控えましょう。',
            stable: '日中の高い濃度が残っていますが、夜にかけて大気の状態は徐々に正常に戻っていきます。',
        },
        alert: {
            falling: '日中の高い濃度が残っていますが、夜にかけて大気の状態は徐々に正常に戻っていきます。',
            night_stagnation: '風が弱く、空気がよどんだ状態が残っています。念のため、不要な窓の開放は控えましょう。',
            stable: '日中の高い濃度が残っていますが、夜にかけて大気の状態は徐々に正常に戻っていきます。',
        },
    },
};

const FALLBACK_MESSAGE = '大気の状態を確認しています。';

const RISE_DELTA = 8;
const FALL_DELTA = 8;
const STAGNATION_RANGE = 10;

/**
 * @param {number|null|undefined} ppb
 * @returns {AirState}
 */
export function getAirState(ppb) {
    if (!Number.isFinite(ppb)) return 'normal';
    if (ppb > 100) return 'alert';
    if (ppb > 60) return 'caution';
    return 'normal';
}

/**
 * @param {Date} baseTime
 * @param {Date|null|undefined} sunriseTime
 * @returns {TimeSlot}
 */
export function getTimeSlot(baseTime, sunriseTime) {
    const hour = baseTime.getHours();
    if (hour < 12) return 'morning';
    if (hour < 16) return 'afternoon';
    return 'evening';
}

/**
 * @param {number[]} oxArray
 * @param {Date} baseTime
 * @param {number} maxHorizon
 * @returns {number[]}
 */
function collectFutureValues(oxArray, baseTime, maxHorizon = 8) {
    if (!oxArray) return [];
    const currentHour = baseTime.getHours();
    const out = [];
    for (let i = 1; i <= maxHorizon; i++) {
        if (currentHour + i > 24) break;
        const v = oxArray[i - 1];
        if (Number.isFinite(v)) out.push(v);
    }
    return out;
}

/**
 * @param {number[]} oxArray
 * @param {Date} baseTime
 */
function willExceed60InAfternoon(oxArray, baseTime) {
    if (!oxArray) return false;
    const currentHour = baseTime.getHours();
    for (let h = 12; h <= 18; h++) {
        if (h <= currentHour) continue;
        const idx = h - currentHour - 1;
        if (idx >= 0 && idx < oxArray.length && oxArray[idx] > 60) return true;
    }
    return false;
}

/**
 * @param {AirState} airState
 * @param {number[]} futureValues
 * @param {number} current
 */
function isNightStagnation(airState, futureValues, current) {
    if (airState === 'normal' || !Number.isFinite(current) || current <= 60) return false;
    if (futureValues.length < 2) return true;
    const min = Math.min(...futureValues);
    const max = Math.max(...futureValues);
    return max - min < STAGNATION_RANGE && min > 55;
}

/**
 * @param {TimeSlot} timeSlot
 * @param {AirState} airState
 * @param {number[]} oxArray
 * @param {Date} baseTime
 * @param {number|null|undefined} currentPpb
 * @returns {ForecastTrend}
 */
export function getForecastTrend(timeSlot, airState, oxArray, baseTime, currentPpb) {
    const futureValues = collectFutureValues(oxArray, baseTime, 8);
    const forecastNow = futureValues[0];
    const current = Number.isFinite(currentPpb) ? currentPpb : forecastNow;
    const peak = futureValues.length ? Math.max(...futureValues) : current;
    const last = futureValues.length ? futureValues[futureValues.length - 1] : current;
    const rising = Number.isFinite(current) && Number.isFinite(peak) && peak > current + RISE_DELTA;
    const falling = Number.isFinite(current) && Number.isFinite(last) && last < current - FALL_DELTA;

    if (timeSlot === 'morning') {
        if (airState === 'normal') {
            return willExceed60InAfternoon(oxArray, baseTime) || rising ? 'afternoon_rise' : 'stable';
        }
        return rising ? 'rising' : 'stable';
    }

    if (timeSlot === 'afternoon') {
        if (airState === 'normal') return 'stable';
        if (airState === 'caution' && falling) return 'falling';
        return 'peak_maintain';
    }

    // evening
    if (airState === 'normal') return 'stable';
    if (isNightStagnation(airState, futureValues, current)) return 'night_stagnation';
    if (falling) return 'falling';
    return 'stable';
}

/**
 * @param {TimeSlot} timeSlot
 * @param {AirState} airState
 * @param {ForecastTrend} trend
 */
function resolveMessage(timeSlot, airState, trend) {
    const slotMessages = MESSAGES[timeSlot]?.[airState];
    if (!slotMessages) return FALLBACK_MESSAGE;
    return (
        slotMessages[trend] ??
        slotMessages.stable ??
        slotMessages.peak_maintain ??
        slotMessages.falling ??
        Object.values(slotMessages)[0] ??
        FALLBACK_MESSAGE
    );
}

/**
 * @param {TimeSlot} timeSlot
 * @param {ForecastTrend} trend
 */
function resolveTrendLabel(timeSlot, trend) {
    return TREND_LABELS[trend]?.[timeSlot] ?? TREND_LABELS.stable[timeSlot];
}

/**
 * @param {{ currentPpb?: number|null, oxArray?: number[], baseTime: Date, sunriseTime?: Date|null }} params
 */
export function buildGeneralAirMessage({ currentPpb, oxArray, baseTime, sunriseTime }) {
    const airState = getAirState(currentPpb);
    const timeSlot = getTimeSlot(baseTime, sunriseTime);
    const trend = getForecastTrend(timeSlot, airState, oxArray, baseTime, currentPpb);
    const status = STATUS_META[airState];

    return {
        statusIcon: getPpbFaceEmoji(currentPpb),
        statusLabel: status.label,
        statusClass: status.className,
        trendLabel: resolveTrendLabel(timeSlot, trend),
        message: resolveMessage(timeSlot, airState, trend),
        ppbText: Number.isFinite(currentPpb) ? `現在 ${Math.round(currentPpb)}ppb` : '',
    };
}

export const DEFAULT_GENERAL_AIR_MESSAGE = {
    statusIcon: '😊',
    statusLabel: '良好',
    statusClass: 'normal',
    trendLabel: 'このまま ➔',
    message: 'おでかけに適した、やさしい空気です',
    ppbText: '',
};
