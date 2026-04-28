// const API_URL="http://172.23.78.71:8087"
const API_URL="/api"

/** 利用可能な予測アルゴリズム */
export const PREDICT_ALGORITHMS = {
    a1: 'andersan1 (a1)',
    a4_1: 'andersan4_1 (a4_1)'
};

/** 現在選択中の予測アルゴリズム ID */
let currentPredictAlgorithm = 'a1';

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
        const isQuantileModel = currentPredictAlgorithm === 'a4_1';
        let url = isQuantileModel
            ? `${API_URL}/oxq/a4_1/kanagawa/${isostring}`
            : `${API_URL}/ox/${currentPredictAlgorithm}/kanagawa/${isostring}`;
        const response = await fetch(url);
        if (response.status === 503) {
            throw new Error('503');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(data.data.XY.slice(0, 5));
        return data;
    } catch (error) {
        throw error;
    }
}

export async function fetchObserve(now) {
    try {
        let isostring = dateToISOString(now);
        let url = `${API_URL}/obs/OX/kanagawa/${isostring}`;
        const response = await fetch(url);
        if (response.status === 503) {
            throw new Error('503');
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        //consoleに、data.XYのはじめの5つを出力
        console.log(data.data.XY.slice(0, 5));

        // None値をnullに変換して処理
        const cleanData = JSON.parse(JSON.stringify(data).replace(/"None"/g, 'null'));
        return cleanData;
    } catch (error) {
        throw error;
    }
}

export async function fetchAddress(lon, lat) {
    try {
        // lon, latは小数点3桁で丸める。
        const roundedLon = Math.round(lon * 1000) / 1000;
        const roundedLat = Math.round(lat * 1000) / 1000;

        const url = `${API_URL}/loc/${roundedLon}/${roundedLat}`;
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
        const isQuantileModel = currentPredictAlgorithm === 'a4_1';
        const url = isQuantileModel
            ? `${API_URL}/oxq/a4_1/pgt120/kanagawa/${isostring}`
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

