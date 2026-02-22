import { useState } from 'react';
import type { DailySheet, BreadRecord, Weather, WeatherRecord } from '../types';
import { BREAD_LIST } from '../data/breads';

const STORAGE_KEY = 'bread_production_sheets';

const getInitialWeather = (baseDate: Date): WeatherRecord[] => {
    const labels = ['전전날', '전날', '당일', '다음날', '다다음날', '다다다음날'];
    const offsets = [-2, -1, 0, 1, 2, 3];

    return offsets.map((offset, i) => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + offset);
        return {
            date: d.toISOString().split('T')[0],
            label: labels[i],
            weather: null
        };
    });
};

const getEmptyBreads = (): Record<string, BreadRecord> => {
    const records: Record<string, BreadRecord> = {};
    BREAD_LIST.forEach(bread => {
        records[bread.id] = {
            breadId: bread.id,
            remain: '',
            disposal: 0,
            produce: true,
            produceQty: bread.defaultQty || '',
            soldOutTime: ''
        };
    });
    return records;
};

export const useSheet = (initialDate: string) => {
    const [sheet, setSheet] = useState<DailySheet>(() => {
        const saved = localStorage.getItem(`${STORAGE_KEY}_${initialDate}`);
        if (saved) return JSON.parse(saved);
        return {
            date: initialDate,
            weather: getInitialWeather(new Date(initialDate)),
            breads: getEmptyBreads(),
            memo: ''
        };
    });

    // isDirty = has unsaved changes; savedAt = last explicit save time
    const [savedAt, setSavedAt] = useState<Date | null>(() => {
        // If there is already saved data for this date, consider it already saved
        return localStorage.getItem(`${STORAGE_KEY}_${initialDate}`) ? new Date() : null;
    });
    const [isDirty, setIsDirty] = useState(false);

    const saveSheet = () => {
        localStorage.setItem(`${STORAGE_KEY}_${sheet.date}`, JSON.stringify(sheet));
        setSavedAt(new Date());
        setIsDirty(false);
    };

    const updateWeather = (index: number, weather: Weather) => {
        const newWeather = [...sheet.weather];
        newWeather[index].weather = weather;
        setSheet({ ...sheet, weather: newWeather });
        setIsDirty(true);
    };

    const updateBreadRecord = (breadId: string, updates: Partial<BreadRecord>) => {
        setSheet({
            ...sheet,
            breads: {
                ...sheet.breads,
                [breadId]: { ...sheet.breads[breadId], ...updates }
            }
        });
        setIsDirty(true);
    };

    const updateMemo = (memo: string) => {
        setSheet({ ...sheet, memo });
        setIsDirty(true);
    };

    const loadDate = (date: string) => {
        const saved = localStorage.getItem(`${STORAGE_KEY}_${date}`);
        if (saved) {
            setSheet(JSON.parse(saved));
        } else {
            // Auto-prefill from yesterday's data
            const yesterday = new Date(date);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = `${STORAGE_KEY}_${yesterday.toISOString().split('T')[0]}`;
            const yesterdaySaved = localStorage.getItem(yesterdayKey);
            const yesterdaySheet: DailySheet | null = yesterdaySaved ? JSON.parse(yesterdaySaved) : null;

            const prefillBreads = getEmptyBreads();
            if (yesterdaySheet) {
                BREAD_LIST.forEach(bread => {
                    const yRec = yesterdaySheet.breads[bread.id];
                    if (!yRec) return;
                    const yProd = Number(yRec.produceQty) || 0;
                    const yRemain = Number(yRec.remain) || 0;
                    const yDisp = Number(yRec.disposal) || 0;
                    const ySoldOut = yRec.soldOutTime;

                    let suggestedQty = yProd;
                    if (ySoldOut) {
                        // Sold out → produce more
                        suggestedQty = Math.ceil(yProd * 1.15);
                    } else if ((yRemain + yDisp) / Math.max(yProd, 1) > 0.15) {
                        // More than 15% unsold → reduce
                        suggestedQty = Math.max(1, Math.round(yProd * 0.85));
                    }
                    prefillBreads[bread.id] = {
                        ...prefillBreads[bread.id],
                        produce: yRec.produce,
                        produceQty: suggestedQty || bread.defaultQty || '',
                    };
                });
            }

            setSheet({
                date,
                weather: getInitialWeather(new Date(date)),
                breads: prefillBreads,
                memo: ''
            });
        }
    };

    const getAllHistory = (): DailySheet[] => {
        const history: DailySheet[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(STORAGE_KEY)) {
                try {
                    history.push(JSON.parse(localStorage.getItem(key)!));
                } catch (e) {
                    console.error('Error parsing sheet', key);
                }
            }
        }
        return history.sort((a, b) => b.date.localeCompare(a.date));
    };

    const generateDummyData = () => {
        const weathers: Weather[] = ['sunny', 'cloudy', 'rainy', 'snowy', 'partly-cloudy'];
        const today = new Date();

        for (let i = 1; i <= 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isRainy = Math.random() < 0.2;

            const dummySheet: DailySheet = {
                date: dateStr,
                isDemo: true,
                weather: getInitialWeather(d).map(w => ({
                    ...w,
                    weather: weathers[Math.floor(Math.random() * weathers.length)]
                })),
                breads: {},
                memo: `${dateStr} 가상 생성 데이터입니다.`
            };

            BREAD_LIST.forEach(bread => {
                const baseQty = bread.defaultQty || 5;

                // Item specific performance (Simulation bias)
                // High performers (soboro, croquembouche style) vs Low performers (expensive ones)
                let performanceMultiplier = 1.0;
                if (['soboro', 'milk_bread'].includes(bread.id)) performanceMultiplier = 1.2;
                if (['morning_bread', 'croissant'].includes(bread.id)) performanceMultiplier = 0.7;

                // 주말 증량 시뮬레이션
                const weekendBonus = isWeekend ? 1.5 : 1.0;
                const prodQty = Math.ceil(baseQty * weekendBonus * performanceMultiplier);

                // Disposal Logic: Vary based on weather and a "bad day" random factor
                const badDayFactor = Math.random() < 0.15 ? 0.5 : 0; // 15% chance of a really bad day
                const weatherFactor = isRainy ? 0.2 : 0;

                // Random disposal rate (0% ~ 20%) + factors
                const disposalRate = (Math.random() * 0.2) + badDayFactor + weatherFactor;
                const disposalQty = Math.floor(prodQty * disposalRate);

                dummySheet.breads[bread.id] = {
                    breadId: bread.id,
                    remain: Math.max(0, prodQty - disposalQty - Math.floor(Math.random() * 2)),
                    disposal: disposalQty,
                    produce: prodQty > 0,
                    produceQty: prodQty,
                    soldOutTime: ''
                };
            });

            localStorage.setItem(`${STORAGE_KEY}_${dateStr}`, JSON.stringify(dummySheet));
        }
        // Refresh current sheet if it matches any generated date
        loadDate(sheet.date);
    };

    const clearDemoData = () => {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(STORAGE_KEY)) {
                try {
                    const data: DailySheet = JSON.parse(localStorage.getItem(key)!);
                    if (data.isDemo) {
                        keysToRemove.push(key);
                    }
                } catch (e) {
                    // Skip invalid data
                }
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        loadDate(sheet.date);
    };

    return {
        sheet,
        savedAt,
        isDirty,
        saveSheet,
        updateWeather,
        updateBreadRecord,
        updateMemo,
        loadDate,
        getAllHistory,
        generateDummyData,
        clearDemoData
    };
};
