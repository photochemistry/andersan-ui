// const API_URL="http://172.23.78.71:8087"
const API_URL="/api"

/** 利用可能な予測アルゴリズム */
export const PREDICT_ALGORITHMS = {
    a1: 'andersan1 (a1)',
    a1p: 'andersan1_16 (a1p)',
    a1q: 'andersan1_17 (a1q)',
    a3_16: 'andersan3_16 (a3_16)',
    a4_1: 'andersan4_1 (a4_1)'
};

/** oxq API（分位点回帰）を使うモデル ID */
const QUANTILE_PREDICT_ALGORITHMS = new Set(['a3_16', 'a4_1']);

export function isQuantilePredictAlgorithm(algorithm) {
    return QUANTILE_PREDICT_ALGORITHMS.has(algorithm);
}

/** 中央値(q50)より上側の分位幅のみ表示するモデル（q50, q90, q95） */
export function isPositiveSideQuantileBand(algorithm) {
    return algorithm === 'a3_16';
}

/** 現在選択中の予測アルゴリズム ID */
let currentPredictAlgorithm = 'a3_16';

export function getPredictAlgorithm() {
    return currentPredictAlgorithm;
}

export function setPredictAlgorithm(nextAlgorithm) {
    if (!Object.prototype.hasOwnProperty.call(PREDICT_ALGORITHMS, nextAlgorithm)) {
        throw new Error(`Unknown algorithm: ${nextAlgorithm}`);
    }
    currentPredictAlgorithm = nextAlgorithm;
}
const API_BASE = API_URL.replace(/\/api$/, ''); // /api を削除

export function dateToJSTString(date) {
    // JSTの日時文字列に変換
    const jstString = date.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false, // 24時間制
    });

    return jstString;
}

export function dateToISOString(date) {
    // 時刻を正時に調整（分、秒、ミリ秒を0に）
    const adjustedDate = new Date(date);
    adjustedDate.setMinutes(0, 0, 0);
    
    // 日本時間のオフセットを考慮したISO文字列を生成
    const jstDate = new Date(adjustedDate.getTime() + (9 * 60 * 60 * 1000)); // UTC+9に調整
    return jstDate.toISOString().replace('.000Z', '+09:00'); // ミリ秒部分を削除
}

function formatJstIsoNoMs(date) {
    const jst = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const year = jst.getFullYear();
    const month = String(jst.getMonth() + 1).padStart(2, '0');
    const day = String(jst.getDate()).padStart(2, '0');
    const hour = String(jst.getHours()).padStart(2, '0');
    const minute = String(jst.getMinutes()).padStart(2, '0');
    const second = String(jst.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`;
}

function getLocalDayRangeUtc(now) {
    const start = new Date(now.getTime());
    start.setHours(0, 0, 0, 0);
    const end = new Date(now.getTime());
    end.setHours(23, 0, 0, 0);
    return { start, end };
}

export function unixTimeToJSTString(unixTime) {
    // Unixタイムをミリ秒に変換
    const milliseconds = unixTime * 1000;

    // Dateオブジェクトを作成
    const date = new Date(milliseconds);

    return dateToJSTString(date);
}

function getOneHourAgo(date) {
    const newDate = new Date(date); // 元のDateオブジェクトを複製
    newDate.setHours(newDate.getHours() - 1);
    return newDate;
}

export async function fetchPredict(now) {
    try {
        let isostring = dateToISOString(now);
        const isQuantileModel = isQuantilePredictAlgorithm(currentPredictAlgorithm);
        let url = isQuantileModel
            ? `${API_URL}/oxq/${currentPredictAlgorithm}/kanagawa/${isostring}`
            : `${API_URL}/ox/${currentPredictAlgorithm}/kanagawa/${isostring}`;
        const response = await fetch(url);
        if (response.status === 503) {
            throw new Error('503');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        throw error;
    }
}

export async function fetchObserve(now, bbox, method = 'idw') {
    try {
        const { start, end } = getLocalDayRangeUtc(now);
        const params = new URLSearchParams({
            z: '12',
            items: 'ox',
            from: formatJstIsoNoMs(start),
            to: formatJstIsoNoMs(end),
            bbox,
            method
        });
        const url = `${API_URL}/v1/grid/field/range?${params.toString()}`;
        const response = await fetch(url);
        if (response.status === 503) throw new Error('503');
        if (response.ok) {
            const raw = await response.json();
            const cleanData = JSON.parse(JSON.stringify(raw).replace(/"None"/g, 'null'));
            const root = cleanData?.data ?? cleanData;
            const grid = root?.grid ?? {};
            const values = root?.values ?? {};
            const timestamps = root?.timestamps ?? [];
            const ox = values?.ox ?? values?.OX ?? [];
            return {
                ...cleanData,
                grid,
                timestamps,
                values: {
                    ox
                }
            };
        }
        if (response.status !== 404) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // range API が未デプロイの環境では旧 API を使う
        const isostring = dateToISOString(now);
        const legacyUrl = `${API_URL}/obs/OX/kanagawa/${isostring}`;
        const legacyRes = await fetch(legacyUrl);
        if (legacyRes.status === 503) throw new Error('503');
        if (!legacyRes.ok) throw new Error(`HTTP error! status: ${legacyRes.status}`);
        const legacyRaw = await legacyRes.json();
        const legacy = JSON.parse(JSON.stringify(legacyRaw).replace(/"None"/g, 'null'));
        return {
            ...legacy,
            legacy: true
        };
    } catch (error) {
        throw error;
    }
}

export async function fetchAddress(lon, lat) {
    try {
        // 格子判定の境界と表示を一致させるため、丸めずにそのまま渡す。
        const url = `${API_URL}/loc/${lon}/${lat}`;
        const response = await fetch(url);
        if (response.status === 503) {
            throw new Error('503');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        throw error;
    }
}

export async function fetchPgt120(now){
    try {
        const isostring = dateToISOString(now);
        const isQuantileModel = isQuantilePredictAlgorithm(currentPredictAlgorithm);
        const url = isQuantileModel
            ? `${API_URL}/oxq/${currentPredictAlgorithm}/pgt120/kanagawa/${isostring}`
            : `${API_URL}/ox/${currentPredictAlgorithm}/pgt120/kanagawa/${isostring}`;
        const response = await fetch(url);
        if (response.status === 503) {
            throw new Error('503');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        throw error;
    }
}

