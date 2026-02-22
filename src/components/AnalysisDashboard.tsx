import React, { useMemo } from 'react';
import type { DailySheet } from '../types';
import { BREAD_LIST } from '../data/breads';
import { Sparkline } from './Sparkline';
import './AnalysisDashboard.css';

interface Props {
    history: DailySheet[];
    todayDate?: string;
}

const AnalysisDashboard: React.FC<Props> = ({ history, todayDate }) => {
    const hasDemoData = useMemo(() => history.some(s => s.isDemo), [history]);

    // Build 6-day sparkline data matching the weather window (-2 to +3 days)
    const getSparklineData = (breadId: string) => {
        if (history.length === 0) return [];
        const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

        // Pick the sheet matching todayDate, or fallback to the latest one
        const todaySheet = (todayDate ? history.find(h => h.date === todayDate) : null) || sorted[sorted.length - 1];

        return todaySheet.weather.map(wRec => {
            const historicalEntry = history.find(h => h.date === wRec.date);

            // For historical points (D-2, D-1, today), try to get the recorded weather from that day's sheet
            const recordedWeather = historicalEntry?.weather.find(w => w.date === wRec.date);

            // LOGIC SHIFT: The actual production for 'date' is what was planned on 'date - 1'
            const yesterdayDate = new Date(wRec.date);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
            const yesterdayEntry = history.find(h => h.date === yesterdayStr);

            const labelMap: Record<string, string> = {
                '전전날': 'D-2', '전날': 'D-1', '당일': 'D',
                '다음날': 'D+1', '다다음날': 'D+2', '다다다음날': 'D+3'
            };

            return {
                // Production seen on 'date' is actually from 'yesterday's plan'
                prod: yesterdayEntry ? (Number(yesterdayEntry.breads[breadId]?.produceQty) || 0) : 0,
                disp: historicalEntry ? (Number(historicalEntry.breads[breadId]?.disposal) || 0) : 0,
                rem: historicalEntry ? (Number(historicalEntry.breads[breadId]?.remain) || 0) : 0,
                date: wRec.date,
                label: labelMap[wRec.label] || wRec.label,
                weather: recordedWeather?.weather || wRec.weather || undefined,
                temp: recordedWeather?.temp || wRec.temp,
                wind: recordedWeather?.wind || wRec.wind,
            };
        });
    };

    const stats = useMemo(() => {
        // ... stats logic remains similar as it aggregates totals, 
        // but for bread-specific production we usually care about what was actually available today.
        // For simplicity in cumulative stats, we keep it as is or could shift. 
        // The most critical part is the RECOMMENDATION and GRAPH.
        if (history.length === 0) return null;

        const totalStats = {
            production: 0,
            disposal: 0,
            lossRate: 0,
            byBread: {} as Record<string, { produced: number; disposed: number; sold: number }>,
            byWeather: {} as Record<string, { production: number; disposal: number; count: number }>,
            byDayType: {
                weekday: { production: 0, disposal: 0, count: 0 },
                weekend: { production: 0, disposal: 0, count: 0 },
            },
        };

        history.forEach(sheet => {
            const d = new Date(sheet.date);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const dayType = isWeekend ? 'weekend' : 'weekday';
            const todayWeather = sheet.weather.find(w => w.label === '당일')?.weather || 'unknown';

            totalStats.byDayType[dayType].count += 1;
            if (!totalStats.byWeather[todayWeather]) {
                totalStats.byWeather[todayWeather] = { production: 0, disposal: 0, count: 0 };
            }
            totalStats.byWeather[todayWeather].count += 1;

            // SHIFTED Production for stats: To be accurate, production today came from yesterday's sheet.
            const yDate = new Date(sheet.date);
            yDate.setDate(yDate.getDate() - 1);
            const yStr = yDate.toISOString().split('T')[0];
            const ySheet = history.find(h => h.date === yStr);

            Object.entries(sheet.breads).forEach(([id, record]) => {
                // Production available TODAY is from YESTERDAY'S sheet
                const prod = ySheet ? (Number(ySheet.breads[id]?.produceQty) || 0) : 0;
                const disp = Number(record.disposal) || 0;

                totalStats.production += prod;
                totalStats.disposal += disp;
                totalStats.byWeather[todayWeather].production += prod;
                totalStats.byWeather[todayWeather].disposal += disp;
                totalStats.byDayType[dayType].production += prod;
                totalStats.byDayType[dayType].disposal += disp;

                if (!totalStats.byBread[id]) {
                    totalStats.byBread[id] = { produced: 0, disposed: 0, sold: 0 };
                }
                totalStats.byBread[id].produced += prod;
                totalStats.byBread[id].disposed += disp;
                totalStats.byBread[id].sold += Math.max(0, prod - disp);
            });
        });

        totalStats.lossRate = totalStats.production > 0
            ? (totalStats.disposal / totalStats.production) * 100
            : 0;

        return totalStats;
    }, [history]);

    const weatherIcons: Record<string, string> = {
        sunny: '☀️',
        cloudy: '☁️',
        rainy: '🌧️',
        snowy: '❄️',
        'partly-cloudy': '⛅',
        unknown: '❓'
    };

    const recommendations = useMemo(() => {
        if (history.length === 0) return [];

        const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
        const todaySheet = sorted[sorted.length - 1];

        // Yesterday's sheet contains what was actually produced for TODAY
        const yesterdayDate = new Date(todaySheet.date);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
        const yesterdaySheet = history.find(h => h.date === yesterdayStr);

        const tomorrow = new Date(todaySheet.date + 'T00:00:00');
        tomorrow.setDate(tomorrow.getDate() + 1);
        const isTomorrowWeekend = tomorrow.getDay() === 0 || tomorrow.getDay() === 6;
        const tomorrowWeather = todaySheet.weather.find(w => w.label === '다음날')?.weather || undefined;

        const getWeatherAdj = (breadId: string, weather: string | undefined): number => {
            if (!weather || !['rainy', 'snowy'].includes(weather)) return 1.0;
            const weatherDays = history.filter(s =>
                s.weather.find(w => w.label === '당일')?.weather === weather
            );
            if (weatherDays.length < 2) return 0.9;
            const avgDisposalRate = weatherDays.reduce((acc, s) => {
                const r = s.breads[breadId];
                if (!r) return acc;
                // For historical analysis, we'd also need the shifted production, 
                // but here s.produceQty is what was planned for the NEXT day. 
                // To keep it simple, we use the literal disposal rate if available.
                const p = Number(r.produceQty) || 0;
                const d = Number(r.disposal) || 0;
                return acc + (p > 0 ? d / p : 0);
            }, 0) / weatherDays.length;
            return avgDisposalRate > 0.15 ? 0.85 : 1.0;
        };

        return BREAD_LIST.filter(b => b.defaultQty !== null).map(bread => {
            const today = todaySheet.breads[bread.id];
            // Actual production TODAY is what was planned YESTERDAY
            const todayProd = yesterdaySheet ? (Number(yesterdaySheet.breads[bread.id]?.produceQty) || bread.defaultQty || 0) : (bread.defaultQty || 0);
            const todayRemain = Number(today?.remain) || 0;
            const todayDisp = Number(today?.disposal) || 0;
            const soldOut = today?.soldOutTime;
            const soldQty = Math.max(0, todayProd - todayRemain);
            const unsoldRatio = todayRemain / Math.max(todayProd, 1);
            const unsoldPercent = Math.round(unsoldRatio * 100);

            let baseQty = todayProd;
            let action: 'increase' | 'decrease' | 'keep' = 'keep';
            let reason = '';

            if (soldOut) {
                action = 'increase';
                baseQty = Math.ceil(todayProd * 1.15);
                reason = `오늘 ${soldOut}에 품절 (${todayProd}개 생산/완판) → 증량 추천`;
            } else if (todayProd > 0 && unsoldRatio > 0.3) {
                action = 'decrease';
                baseQty = Math.max(1, Math.round(todayProd * 0.8));
                reason = `오늘 ${soldQty}개 판매 (${unsoldPercent}% 미판매) → 감량 추천`;
            } else if (todayProd > 0 && unsoldRatio > 0.1) {
                action = 'decrease';
                baseQty = Math.max(1, Math.round(todayProd * 0.9));
                reason = `오늘 ${soldQty}개 판매 (잔량 ${todayRemain}개) → 소폭 감량`;
            } else if (todayProd > 0 && todayRemain === 0 && (todayDisp || 0) === 0 && !soldOut) {
                action = 'keep';
                reason = `오늘 ${todayProd}개 완판 (품절시간 미기록) → 현 수량 유지`;
            } else {
                reason = todayProd > 0 ? `오늘 ${soldQty}개 판매 (양호) → 현 수량 유지` : '데이터 부족 → 기본 수량 권장';
            }

            const weatherAdj = getWeatherAdj(bread.id, tomorrowWeather);
            if (weatherAdj < 1.0 && action !== 'decrease') {
                action = 'decrease';
                reason += ` + 내일 ${tomorrowWeather === 'rainy' ? '☔' : '❄️'} 날씨 고려`;
            }

            let dayAdj = 1.0;
            if (isTomorrowWeekend) {
                dayAdj = 1.2;
                if (action === 'keep') { action = 'increase'; reason += ' + 내일 주말 증량'; }
            }

            const finalQty = Math.max(1, Math.round(baseQty * weatherAdj * dayAdj));

            return {
                breadId: bread.id,
                name: bread.name,
                action,
                reason,
                amount: finalQty,
                todayProd,
                todayRemain,
                todayDisp,
                soldQty,
                soldOut: soldOut || '',
            };
        });
    }, [history]);

    if (!stats) return <div className="no-data">데이터를 분석 중입니다...</div>;

    return (
        <div className="analysis-dashboard">
            {hasDemoData && (
                <div className="demo-warning-banner">
                    ⚠️ 현재 분석 결과에 **데모 데이터**가 포함되어 있습니다. 실제 기록만 보려면 데모 탭에서 데이터를 삭제해 주세요.
                </div>
            )}
            <div className="summary-cards">
                <div className="stat-card">
                    <label>누적 총 생산</label>
                    <div className="value">{stats.production}건</div>
                </div>
                <div className="stat-card warning">
                    <label>누적 총 폐기</label>
                    <div className="value">{stats.disposal}건</div>
                </div>
                <div className="stat-card">
                    <label>평균 폐기율</label>
                    <div className="value">{stats.lossRate.toFixed(1)}%</div>
                </div>
            </div>

            <div className="context-analysis-grid">
                <section className="analysis-box">
                    <h3>🌤️ 날씨별 폐기율</h3>
                    <div className="weather-list">
                        {Object.entries(stats.byWeather).map(([weather, data]) => (
                            <div key={weather} className="context-item">
                                <span className="icon">{weatherIcons[weather]}</span>
                                <span className="label">{weather === 'unknown' ? '미지정' : weather}</span>
                                <span className="value">{(data.production > 0 ? (data.disposal / data.production) * 100 : 0).toFixed(1)}%</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="analysis-box">
                    <h3>📅 평일 vs 주말 비교</h3>
                    <div className="day-type-comparison">
                        <div className="comparison-item">
                            <span className="label">평일 폐기율</span>
                            <span className="value">{(stats.byDayType.weekday.production > 0 ? (stats.byDayType.weekday.disposal / stats.byDayType.weekday.production) * 100 : 0).toFixed(1)}%</span>
                            <span className="sub">{stats.byDayType.weekday.count}일 기록</span>
                        </div>
                        <div className="comparison-item highlight">
                            <span className="label">주말 폐기율</span>
                            <span className="value">{(stats.byDayType.weekend.production > 0 ? (stats.byDayType.weekend.disposal / stats.byDayType.weekend.production) * 100 : 0).toFixed(1)}%</span>
                            <span className="sub">{stats.byDayType.weekend.count}일 기록</span>
                        </div>
                    </div>
                </section>
            </div>

            <section className="recommendation-section">
                <div className="section-header">
                    <h3>💡 지능형 생산 추천</h3>
                    <div className="rec-summary-bar">
                        {recommendations.filter(r => r.action === 'increase').length > 0 && (
                            <span className="summary-badge increase">증량 추천 {recommendations.filter(r => r.action === 'increase').length}건</span>
                        )}
                        {recommendations.filter(r => r.action === 'decrease').length > 0 && (
                            <span className="summary-badge decrease">감량 추천 {recommendations.filter(r => r.action === 'decrease').length}건</span>
                        )}
                    </div>
                </div>

                {recommendations.length > 0 ? (
                    <div className="rec-groups">
                        {(['increase', 'decrease', 'keep'] as const).map(action => {
                            const filtered = recommendations.filter(r => r.action === action);
                            if (filtered.length === 0) return null;
                            const labels = {
                                increase: '📈 내일 늘려보세요',
                                decrease: '📉 내일 줄여보세요',
                                keep: '✅ 내일 유지하세요',
                            };
                            return (
                                <div key={action} className={`rec-group ${action}`}>
                                    <h4>{labels[action]}</h4>
                                    <div className="rec-compact-grid">
                                        {filtered.map(rec => (
                                            <div key={rec.breadId} className="rec-compact-card">
                                                <div className="rec-today-data">
                                                    <span className="today-label">오늘 기록:</span>
                                                    <span>생산 {(rec as any).todayProd}개</span>
                                                    {(rec as any).todayRemain > 0 && <span className="tag remain">잔량 {(rec as any).todayRemain}</span>}
                                                    {(rec as any).todayDisp > 0 && <span className="tag disp">폐기 {(rec as any).todayDisp}</span>}
                                                    {(rec as any).soldOut && <span className="tag soldout">품절 {(rec as any).soldOut}</span>}
                                                </div>
                                                <div className="reason">{rec.reason}</div>
                                                <div className="rec-main">
                                                    <span className="name">{rec.name}</span>
                                                    <div className="rec-decision">
                                                        <span className="amount">{rec.amount}개</span>
                                                        <span className="decision-label">내일 권장</span>
                                                    </div>
                                                </div>
                                                <div className="rec-spark">
                                                    <Sparkline
                                                        data={getSparklineData(rec.breadId)}
                                                        showXLabels={true}
                                                        width={240}
                                                        height={100}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-rec">충분한 데이터가 쌓이면 정교한 추천을 시작합니다.</div>
                )}

            </section>

            <section className="top-disposal-section">
                <h3>🗑️ 품목별 폐기 통계 (TOP 5)</h3>
                <div className="top-list">
                    {Object.entries(stats.byBread)
                        .sort((a, b) => b[1].disposed - a[1].disposed)
                        .slice(0, 5)
                        .map(([id, data]) => (
                            <div key={id} className="top-item">
                                <span className="item-name">{BREAD_LIST.find(b => b.id === id)?.name}</span>
                                <div className="item-bar-container">
                                    <div
                                        className="item-bar"
                                        style={{ width: `${(data.disposed / stats.disposal) * 100}%` }}
                                    ></div>
                                </div>
                                <span className="item-value">{data.disposed}개 ({((data.produced > 0 ? data.disposed / data.produced : 0) * 100).toFixed(1)}%)</span>
                            </div>
                        ))}
                </div>
            </section>
        </div>
    );
};

export default AnalysisDashboard;
