import React from 'react';
import type { Weather } from '../types';

export interface SparkDataPoint {
    prod: number;
    disp: number;
    rem: number;
    date?: string;       // 'YYYY-MM-DD'
    label?: string;      // deprecated: 날짜 직접 표시로 대체
    weather?: Weather;
    temp?: number;
    wind?: number;
    hasRecord?: boolean; // false이면 폐기·잔량 미기록 (미래 날짜 등)
    hasProd?: boolean;   // false이면 생산량 데이터도 없음 (전날 기록 없음)
}

const WEATHER_ICONS: Record<string, string> = {
    sunny: '☀️',
    cloudy: '☁️',
    rainy: '🌧️',
    snowy: '❄️',
    'partly-cloudy': '⛅',
    unknown: '❓'
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
    data: SparkDataPoint[];
    showXLabels?: boolean;  // show day + weather on X axis
    width?: number;
    height?: number;
}

export const Sparkline: React.FC<Props> = ({
    data,
    showXLabels = false,
    width = 90,
    height = 36,
}) => {
    const BOTTOM_PAD = showXLabels ? 65 : 10;
    const PAD = { top: 6, right: 6, bottom: BOTTOM_PAD, left: 24 };
    const W = width;
    const H = height;

    const hasData = data.some(d => d.prod > 0 || d.disp > 0 || d.rem > 0);
    if (!hasData) return <div className="sparkline-empty">데이터 없음</div>;

    const allValues = data.flatMap(d => [d.prod || 0, d.disp || 0, d.rem || 0]);
    const maxY = Math.max(...allValues, 1);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW;

    const toY = (v: number) => PAD.top + innerH - (v / maxY) * innerH;

    // 생산선: hasProd가 명시적으로 false인 경우만 제외 (undefined = 기존 호환 → 포함)
    const lastProdIdx = data.reduce((last, d, i) =>
        d.hasProd !== false ? i : last, -1);

    // 폐기·잔량선: hasRecord가 명시적으로 false인 경우 제외
    const lastRecordedIdx = data.reduce((last, d, i) =>
        d.hasRecord !== false ? i : last, -1);

    const toPoints = (series: number[], maxIdx: number) =>
        series
            .slice(0, maxIdx + 1)
            .map((v, i) => `${PAD.left + i * xStep},${toY(v)}`)
            .join(' ');

    const prodPts = toPoints(data.map(d => d.prod), lastProdIdx);
    const dispPts = toPoints(data.map(d => d.disp), lastRecordedIdx);
    const remPts  = toPoints(data.map(d => d.rem),  lastRecordedIdx);

    // mid Y gridline
    const midY = toY(maxY / 2);
    const midVal = Math.round(maxY / 2);

    return (
        <svg width={W} height={H} className="sparkline-svg" style={{ overflow: 'visible' }}>
            {/* Grid */}
            <line x1={PAD.left} y1={midY} x2={W - PAD.right} y2={midY}
                stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} strokeDasharray="2,2" />

            {/* Y-axis */}
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} className="spark-axis" />
            <text x={PAD.left - 2} y={PAD.top + 3} className="spark-label-max">{maxY}</text>
            <text x={PAD.left - 2} y={midY} className="spark-label-max">{midVal}</text>
            <text x={PAD.left - 2} y={PAD.top + innerH} className="spark-label-zero">0</text>

            {/* X-axis */}
            <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} className="spark-axis" />

            {/* X labels: day + weather + details */}
            {showXLabels && data.map((d, i) => {
                const x = PAD.left + i * xStep;
                const isFuture = d.hasRecord === false;
                const dateObj = d.date ? new Date(d.date + 'T00:00:00') : null;
                const isWeekend = dateObj ? [0, 6].includes(dateObj.getDay()) : false;
                // 실제 날짜(M/D) 표시 — label(D, D+1 등) 대신
                const dateLabel = dateObj
                    ? `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                    : (d.label || `?`);
                const weatherIcon = d.weather ? (WEATHER_ICONS[d.weather] ?? '') : '';

                return (
                    <g key={i} opacity={isFuture ? 0.35 : 1}>
                        {/* 날짜 */}
                        <text x={x} y={PAD.top + innerH + 12} className="spark-xlabel" textAnchor="middle"
                            fill={isWeekend && !isFuture ? '#f39c12' : 'rgba(255,255,255,0.7)'} style={{ fontWeight: 600 }}>
                            {dateLabel}
                        </text>
                        {/* 날씨 아이콘 */}
                        <text x={x} y={PAD.top + innerH + 28} textAnchor="middle" style={{ fontSize: '14px' }}>
                            {weatherIcon}
                        </text>
                        {/* 기온·풍속: 기록된 날짜만 표시 */}
                        {!isFuture && d.temp !== undefined && (
                            <text x={x} y={PAD.top + innerH + 40} textAnchor="middle" fill="var(--primary)" style={{ fontSize: '7px', fontWeight: 600 }}>
                                {Math.round(d.temp)}°C
                            </text>
                        )}
                        {!isFuture && d.wind !== undefined && (
                            <text x={x} y={PAD.top + innerH + 48} textAnchor="middle" fill="var(--text-muted)" style={{ fontSize: '6px' }}>
                                {d.wind.toFixed(1)}m/s
                            </text>
                        )}
                    </g>
                );
            })}

            {/* Series lines */}
            <polyline points={prodPts} className="spark-line prod" />
            <polyline points={dispPts} className="spark-line disp" />
            <polyline points={remPts} className="spark-line rem" />

            {/* 끝점 도트: 생산은 lastProdIdx, 폐기·잔량은 lastRecordedIdx */}
            {lastProdIdx >= 0 && (
                <circle cx={PAD.left + lastProdIdx * xStep} cy={toY(data[lastProdIdx].prod)} r={1.5} fill="var(--secondary)" />
            )}
            {lastRecordedIdx >= 0 && <>
                <circle cx={PAD.left + lastRecordedIdx * xStep} cy={toY(data[lastRecordedIdx].disp)} r={1.5} fill="#e74c3c" />
                <circle cx={PAD.left + lastRecordedIdx * xStep} cy={toY(data[lastRecordedIdx].rem)}  r={1.5} fill="#3498db" />
            </>}

            {/* Legend */}
            <rect x={PAD.left} y={H - 8} width={5} height={2} className="spark-legend-prod" />
            <rect x={PAD.left + 22} y={H - 8} width={5} height={2} className="spark-legend-disp" />
            <rect x={PAD.left + 44} y={H - 8} width={5} height={2} className="spark-legend-rem" />
            <text x={PAD.left + 7} y={H - 6} className="spark-legend-text" style={{ fontSize: '7px' }}>생산</text>
            <text x={PAD.left + 29} y={H - 6} className="spark-legend-text" style={{ fontSize: '7px' }}>폐기</text>
            <text x={PAD.left + 51} y={H - 6} className="spark-legend-text" style={{ fontSize: '7px' }}>잔량</text>
        </svg>
    );
};

export default Sparkline;
