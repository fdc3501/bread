import React from 'react';
import type { Weather } from '../types';

export interface SparkDataPoint {
    prod: number;
    disp: number;
    rem: number;
    date?: string;       // 'YYYY-MM-DD'
    label?: string;      // '전전날', '전날', '당일' etc.
    weather?: Weather;
    temp?: number;
    wind?: number;
    hasRecord?: boolean; // false이면 아직 기록되지 않은 미래 날짜
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

    // hasRecord가 명시적으로 false인 경우 미기록 날짜 → 선 그리지 않음
    // hasRecord가 undefined(기존 데이터 호환)이거나 true면 기록된 날짜로 처리
    const lastRecordedIdx = data.reduce((last, d, i) =>
        d.hasRecord !== false ? i : last, -1);

    const toPoints = (series: number[]) =>
        series
            .slice(0, lastRecordedIdx + 1)
            .map((v, i) => `${PAD.left + i * xStep},${toY(v)}`)
            .join(' ');

    const prodPts = toPoints(data.map(d => d.prod));
    const dispPts = toPoints(data.map(d => d.disp));
    const remPts = toPoints(data.map(d => d.rem));

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
                const isWeekend = d.date ? [0, 6].includes(new Date(d.date + 'T00:00:00').getDay()) : false;
                const dayLabel = d.label || (d.date ? DAY_LABELS[new Date(d.date + 'T00:00:00').getDay()] : `D${i + 1}`);
                // 미기록 날짜는 날씨 아이콘을 흐리게, 날씨 정보가 없으면 '?' 표시 생략
                const weatherIcon = d.weather ? (WEATHER_ICONS[d.weather] ?? '') : (isFuture ? '' : (d.date ? '❓' : ''));

                return (
                    <g key={i} opacity={isFuture ? 0.35 : 1}>
                        <text x={x} y={PAD.top + innerH + 12} className="spark-xlabel" textAnchor="middle"
                            fill={isWeekend && !isFuture ? '#f39c12' : 'rgba(255,255,255,0.7)'} style={{ fontWeight: 600 }}>
                            {dayLabel}
                        </text>
                        <text x={x} y={PAD.top + innerH + 28} textAnchor="middle" style={{ fontSize: '14px' }}>
                            {weatherIcon}
                        </text>
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

            {/* Data dots on last RECORDED point */}
            {lastRecordedIdx >= 0 && (() => {
                const lx = PAD.left + lastRecordedIdx * xStep;
                return <>
                    <circle cx={lx} cy={toY(data[lastRecordedIdx].prod)} r={1.5} fill="var(--secondary)" />
                    <circle cx={lx} cy={toY(data[lastRecordedIdx].disp)} r={1.5} fill="#e74c3c" />
                    <circle cx={lx} cy={toY(data[lastRecordedIdx].rem)} r={1.5} fill="#3498db" />
                </>;
            })()}

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
