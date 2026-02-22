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

const mapWMOCodeToWeather = (code: number): Weather => {
    if (code === 0) return 'sunny';
    if (code >= 1 && code <= 2) return 'partly-cloudy';
    if (code === 3 || (code >= 45 && code <= 48)) return 'cloudy';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rainy';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snowy';
    return 'sunny';
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

export const useSheet = (initialDate: string, syncUrl?: string) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);

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

    const saveSheet = async () => {
        const trimmedUrl = syncUrl?.trim();

        // Local Save first
        localStorage.setItem(`${STORAGE_KEY}_${sheet.date}`, JSON.stringify(sheet));
        setSavedAt(new Date());
        setIsDirty(false);

        if (trimmedUrl) {
            setIsSyncing(true);
            setSyncMessage('구글 시트 업로드 중...');
            try {
                // Use no-cors for broadest compatibility with GAS POST redirects
                // Note: we won't know the exact response body, but the request will reach GAS.
                await fetch(trimmedUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: JSON.stringify(sheet)
                });

                setSyncMessage('구글 시트 동기화 완료');
                setTimeout(() => setSyncMessage(null), 3000);
            } catch (e) {
                console.error('Sync failed', e);
                setSyncMessage('동기화 실패 (네트워크 확인)');
                setTimeout(() => setSyncMessage(null), 5000);
            } finally {
                setIsSyncing(false);
            }
        }
    };

    const updateWeather = (index: number, weather: Weather) => {
        const newWeather = [...sheet.weather];
        newWeather[index].weather = weather;
        setSheet({ ...sheet, weather: newWeather });
        setIsDirty(true);
    };

    const updateBreadRecord = (breadId: string, updates: Partial<BreadRecord>) => {
        // Automatically treat empty strings for remain and disposal as 0 when updating
        const processedUpdates = { ...updates };
        if (processedUpdates.remain === '') processedUpdates.remain = '0';
        if (processedUpdates.disposal === '') processedUpdates.disposal = 0;

        setSheet({
            ...sheet,
            breads: {
                ...sheet.breads,
                [breadId]: { ...sheet.breads[breadId], ...processedUpdates }
            }
        });
        setIsDirty(true);
    };

    const updateMemo = (memo: string) => {
        setSheet({ ...sheet, memo });
        setIsDirty(true);
    };

    const loadDate = async (date: string) => {
        const localSaved = localStorage.getItem(`${STORAGE_KEY}_${date}`);
        let currentSheet: DailySheet | null = localSaved ? JSON.parse(localSaved) : null;
        const trimmedUrl = syncUrl?.trim();

        if (trimmedUrl) {
            setIsSyncing(true);
            setSyncMessage('데이터 동기화 중...');
            try {
                // Add timestamp as cache buster
                const response = await fetch(`${trimmedUrl}?date=${date}&t=${Date.now()}`);
                if (response.ok) {
                    const remoteData = await response.json();
                    if (remoteData && remoteData.date === date) {
                        currentSheet = {
                            ...remoteData,
                            status: remoteData.status || 'draft'
                        };
                        localStorage.setItem(`${STORAGE_KEY}_${date}`, JSON.stringify(currentSheet));
                        setSavedAt(new Date());
                        setSyncMessage('동기화 성공 ✅');
                    } else if (remoteData && remoteData.result === 'not_found') {
                        setSyncMessage('시트에 데이터 없음');
                    }
                } else {
                    setSyncMessage(`동기화 오류 (${response.status})`);
                }
            } catch (e) {
                console.error('Remote fetch failed', e);
                setSyncMessage('동기화 실패 (네트워크/CORS)');
            } finally {
                setIsSyncing(false);
                setTimeout(() => setSyncMessage(null), 3000);
            }
        }

        if (currentSheet) {
            setSheet(currentSheet);
            setSavedAt(new Date());
            setIsDirty(false);

            // AUTO-UPDATE WEATHER: if today's weather is missing
            const todayWeather = currentSheet.weather.find(w => w.label === '당일')?.weather;
            if (!todayWeather) {
                const lat = Number(localStorage.getItem('latitude')) || 37.526;
                const lng = Number(localStorage.getItem('longitude')) || 126.674;
                refreshWeather(lat, lng);
            }
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

            const newSheet: DailySheet = {
                date,
                weather: getInitialWeather(new Date(date)),
                breads: prefillBreads,
                memo: '',
                status: 'draft'
            };
            setSheet(newSheet);
            setSavedAt(null);
            setIsDirty(false);

            // AUTO-UPDATE WEATHER for new sheet
            const lat = Number(localStorage.getItem('latitude')) || 37.526;
            const lng = Number(localStorage.getItem('longitude')) || 126.674;
            // Delay slightly to ensure state is settled
            setTimeout(() => refreshWeather(lat, lng), 500);
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

    const testSync = async () => {
        if (!syncUrl) return alert('먼저 주소를 입력해 주세요.');
        setIsSyncing(true);
        setSyncMessage('연결 테스트 중...');
        try {
            // Use no-cors for GAS to avoid false failures on redirects
            await fetch(`${syncUrl.trim()}?test=1`, { mode: 'no-cors', cache: 'no-cache' });
            alert('연결 성공! 이제 구글 시트가 수신을 기다리고 있습니다.');
        } catch (e) {
            alert('연결 실패: 주소가 잘못되었거나 네트워크가 차단되었습니다.');
        } finally {
            setIsSyncing(false);
            setSyncMessage(null);
        }
    };

    const finalizeSheet = async () => {
        if (!confirm('현재 생산 계획을 최종 확정하시겠습니까? 확정 후에는 기사님이 확인하게 됩니다.')) return;

        const finalizedSheet: DailySheet = { ...sheet, status: 'finalized' };
        setSheet(finalizedSheet);

        // Immediate save & sync
        localStorage.setItem(`${STORAGE_KEY}_${sheet.date}`, JSON.stringify(finalizedSheet));
        setSavedAt(new Date());
        setIsDirty(false);

        if (syncUrl) {
            setIsSyncing(true);
            setSyncMessage('최종 확정 업로드 중...');
            try {
                await fetch(syncUrl.trim(), {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(finalizedSheet)
                });
                setSyncMessage('최종 확정 완료 🔒');
                setTimeout(() => setSyncMessage(null), 3000);
            } catch (e) {
                console.error('Finalize sync failed', e);
                setSyncMessage('확정 업로드 실패 (네트워크 확인)');
            } finally {
                setIsSyncing(false);
            }
        }
    };

    const refreshWeather = async (lat: number, lng: number) => {
        setIsSyncing(true);
        setSyncMessage('날씨 정보 가져오는 중...');
        try {
            const startDate = sheet.weather[0].date;
            const endDate = sheet.weather[5].date;

            // Use weather_code (modern) and explicit SEOUL timezone
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code&timezone=Asia%2FSeoul&start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (data.daily && data.daily.time && data.daily.weather_code) {
                    const apiDates = data.daily.time as string[];
                    const apiCodes = data.daily.weather_code as number[];

                    const newWeather = sheet.weather.map(w => {
                        const idx = apiDates.indexOf(w.date);
                        if (idx !== -1) {
                            return { ...w, weather: mapWMOCodeToWeather(apiCodes[idx]) };
                        }
                        return w;
                    });

                    setSheet({ ...sheet, weather: newWeather });
                    setIsDirty(true);
                    setSyncMessage('날씨 업데이트 완료 🌤️');
                } else {
                    throw new Error('Invalid API response');
                }
            } else {
                setSyncMessage('날씨 정보를 가져오지 못했습니다.');
            }
        } catch (e) {
            console.error('Weather fetch failed', e);
            setSyncMessage('날씨 API 연결 실패');
            alert('날씨를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setIsSyncing(false);
            setTimeout(() => setSyncMessage(null), 3000);
        }
    };

    return {
        sheet,
        savedAt,
        isDirty,
        isSyncing,
        syncMessage,
        saveSheet,
        updateWeather,
        updateBreadRecord,
        updateMemo,
        loadDate,
        getAllHistory,
        generateDummyData,
        clearDemoData,
        testSync,
        finalizeSheet,
        refreshWeather
    };
};
