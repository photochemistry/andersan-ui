// const API_URL="http://172.23.78.71:8087"
const API_URL="/api"
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

export async function fetchData(now) {
    try {
        let isostring = dateToISOString(now);
        let url = `${API_URL}/ox/v0a/kanagawa/${isostring}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('データの取得中にエラーが発生しました:', error);
    }
}

export async function fetchAddress(lon, lat) {
    try {
        const url = `${API_URL}/loc/${lon}/${lat}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('データの取得中にエラーが発生しました:', error);
    }
}

export async function fetchPtable(){
    try {
        const url = `${API_URL}/ptable/v0a`;
        console.log(url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('データの取得中にエラーが発生しました:', error);
        // エラーハンドリングを行う
    }
}

