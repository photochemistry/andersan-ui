export const findMatchingRowIndex = (array, targetValue1, targetValue2) => {
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