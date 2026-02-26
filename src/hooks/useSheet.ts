import { useState } from 'react';
import type { DailySheet, BreadRecord, Weather, WeatherRecord, BreadItem, BreadGroup } from '../types';
import { BREAD_LIST } from '../data/breads';

const STORAGE_KEY = 'bread_production_sheets';
const BREAD_LIST_KEY = 'bread_production_master_list';

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

const getEmptyBreads = (breadList: BreadItem[]): Record<string, BreadRecord> => {
    const records: Record<string, BreadRecord> = {};
    breadList.forEach(bread => {
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

    const [masterBreadList, setMasterBreadList] = useState<BreadItem[]>(() => {
        const saved = localStorage.getItem(BREAD_LIST_KEY);
        if (saved) return JSON.parse(saved);
        return BREAD_LIST;
    });

    const [sheet, setSheet] = useState<DailySheet>(() => {
        const saved = localStorage.getItem(`${STORAGE_KEY}_${initialDate}`);
        if (saved) return JSON.parse(saved);

        // Get bread list from localStorage if available, else use default
        const currentBreadList = localStorage.getItem(BREAD_LIST_KEY)
            ? JSON.parse(localStorage.getItem(BREAD_LIST_KEY)!)
            : BREAD_LIST;

        return {
            date: initialDate,
            weather: getInitialWeather(new Date(initialDate)),
            breads: getEmptyBreads(currentBreadList),
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

        // Sanitize data: convert empty strings to 0 for remain and disposal before saving
        const sanitizedBreads = { ...sheet.breads };
        Object.keys(sanitizedBreads).forEach(id => {
            const rec = sanitizedBreads[id];
            sanitizedBreads[id] = {
                ...rec,
                remain: rec.remain === '' ? 0 : Number(rec.remain),
                disposal: rec.disposal === '' ? 0 : Number(rec.disposal),
                produceQty: rec.produceQty === '' ? 0 : Number(rec.produceQty),
            };
        });

        // 커스텀 빵 목록을 시트에 포함 → 다른 기기에서 로드 시 복원됨
        const customItems = masterBreadList.filter(b => b.id.startsWith('custom_'));
        const sheetToSave: DailySheet = {
            ...sheet,
            breads: sanitizedBreads,
            ...(customItems.length ? { customBreads: customItems } : {}),
        };

        // Local Save first
        localStorage.setItem(`${STORAGE_KEY}_${sheet.date}`, JSON.stringify(sheetToSave));
        setSavedAt(new Date());
        setIsDirty(false);

        if (trimmedUrl) {
            setIsSyncing(true);
            setSyncMessage('구글 시트 업로드 중...');
            try {
                const response = await fetch(trimmedUrl, {
                    method: 'POST',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(sheetToSave)
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.result === 'success') {
                        setSyncMessage('구글 시트 동기화 완료 ✅');
                    } else {
                        setSyncMessage(`⚠️ 동기화 오류: ${result.message || '알 수 없는 오류'}`);
                    }
                } else {
                    setSyncMessage(`⚠️ 구글 시트 오류 (${response.status})`);
                }
                setTimeout(() => setSyncMessage(null), 3000);
            } catch (e) {
                console.error('Sync failed', e);
                setSyncMessage('⚠️ 동기화 실패 (네트워크 확인)');
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
        setSheet(prev => {
            const currentRecord = prev.breads[breadId] || {
                breadId,
                remain: '',
                disposal: 0,
                produce: true,
                produceQty: '',
                soldOutTime: ''
            };

            const newRecord = { ...currentRecord, ...updates };

            // If the user cleared the input, we keep it as empty string so placeholder shows
            // But when saving, it should be treated as 0 (handled in saveSheet or component)

            return {
                ...prev,
                breads: {
                    ...prev.breads,
                    [breadId]: newRecord
                }
            };
        });
        setIsDirty(true);
    };

    const updateMemo = (memo: string) => {
        setSheet({ ...sheet, memo });
        setIsDirty(true);
    };

    const loadDate = async (date: string) => {
        const localSavedRaw = localStorage.getItem(`${STORAGE_KEY}_${date}`);
        const localSheet: DailySheet | null = localSavedRaw ? JSON.parse(localSavedRaw) : null;
        let currentSheet: DailySheet | null = localSheet;
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
                        const remoteSheet: DailySheet = {
                            ...remoteData,
                            status: remoteData.status || 'draft'
                        };

                        // 우선순위: 로컬 최종확정 > 원격 미확정
                        // 사장이 확정한 데이터를 아르바이트의 재저장이나 새로고침으로 덮어쓰지 않도록 보호
                        if (localSheet?.status === 'finalized' && remoteSheet.status !== 'finalized') {
                            setSyncMessage('로컬 최종확정 데이터 유지 (원격: 미확정)');
                            // currentSheet는 localSheet 유지 (덮어쓰지 않음)
                        } else {
                            // 원격이 최종확정이거나, 둘 다 미확정이면 원격 우선
                            currentSheet = remoteSheet;
                            localStorage.setItem(`${STORAGE_KEY}_${date}`, JSON.stringify(currentSheet));
                            setSavedAt(new Date());
                            setSyncMessage('동기화 성공 ✅');
                        }
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
            // 커스텀 빵 목록 복원 (다른 기기에서 저장한 경우 반영)
            let resolvedBreadList = masterBreadList;
            if (currentSheet.customBreads?.length) {
                const prevIds = new Set(masterBreadList.map(b => b.id));
                const newItems = currentSheet.customBreads.filter(b => !prevIds.has(b.id));
                if (newItems.length) {
                    resolvedBreadList = [...masterBreadList, ...newItems];
                    setMasterBreadList(resolvedBreadList);
                    localStorage.setItem(BREAD_LIST_KEY, JSON.stringify(resolvedBreadList));
                }
            }

            // masterBreadList에 있지만 sheet에 없는 빵에 기본 레코드 추가 → 렌더 크래시 방지
            const missingRecords: Record<string, BreadRecord> = {};
            resolvedBreadList.forEach(bread => {
                if (!currentSheet.breads[bread.id]) {
                    missingRecords[bread.id] = {
                        breadId: bread.id,
                        remain: '',
                        disposal: 0,
                        produce: true,
                        produceQty: bread.defaultQty ?? '',
                        soldOutTime: ''
                    };
                }
            });
            const patchedSheet = Object.keys(missingRecords).length > 0
                ? { ...currentSheet, breads: { ...currentSheet.breads, ...missingRecords } }
                : currentSheet;

            setSheet(patchedSheet);
            setSavedAt(new Date());
            setIsDirty(false);

            // AUTO-UPDATE WEATHER: if today's weather is missing
            const todayWeather = currentSheet.weather.find(w => w.label === '당일')?.weather;
            if (!todayWeather) {
                const lat = Number(localStorage.getItem('latitude')) || 37.526;
                const lng = Number(localStorage.getItem('longitude')) || 126.674;
                // currentSheet를 명시적으로 전달하여 stale closure 방지
                refreshWeather(lat, lng, currentSheet);
            }
        } else {
            // Auto-prefill from yesterday's data
            const yesterday = new Date(date);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = `${STORAGE_KEY}_${yesterday.toISOString().split('T')[0]}`;
            const yesterdaySaved = localStorage.getItem(yesterdayKey);
            const yesterdaySheet: DailySheet | null = yesterdaySaved ? JSON.parse(yesterdaySaved) : null;

            const prefillBreads = getEmptyBreads(masterBreadList);
            if (yesterdaySheet) {
                masterBreadList.forEach(bread => {
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
                    // produce 플래그는 이월하지 않음 — 매일 기본값 true에서 시작
                    prefillBreads[bread.id] = {
                        ...prefillBreads[bread.id],
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
            // newSheet를 명시적으로 전달하여 stale closure 방지 (setTimeout도 클로저 캡처 문제 있음)
            setTimeout(() => refreshWeather(lat, lng, newSheet), 100);
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
            // date=test 로 조회 → not_found 또는 error 응답이 오면 서버 연결 성공
            const response = await fetch(`${syncUrl.trim()}?date=test&t=${Date.now()}`, { cache: 'no-cache' });
            if (response.ok) {
                alert('연결 성공! 구글 시트 서버와 통신됩니다.');
            } else {
                alert(`연결 실패: 서버 오류 (${response.status})`);
            }
        } catch (e) {
            alert('연결 실패: 주소가 잘못되었거나 네트워크/CORS가 차단되었습니다.');
        } finally {
            setIsSyncing(false);
            setSyncMessage(null);
        }
    };

    const finalizeSheet = async () => {
        if (!confirm('현재 생산 계획을 최종 확정하시겠습니까? 확정 후에는 기사님이 확인하게 됩니다.')) return;

        // saveSheet와 동일하게 빈 문자열 → 0 정규화
        const sanitizedBreads = { ...sheet.breads };
        Object.keys(sanitizedBreads).forEach(id => {
            const rec = sanitizedBreads[id];
            sanitizedBreads[id] = {
                ...rec,
                remain: rec.remain === '' ? 0 : Number(rec.remain),
                disposal: rec.disposal === '' ? 0 : Number(rec.disposal),
                produceQty: rec.produceQty === '' ? 0 : Number(rec.produceQty),
            };
        });

        const finalizedSheet: DailySheet = { ...sheet, breads: sanitizedBreads, status: 'finalized' };
        setSheet(finalizedSheet);

        // Immediate save & sync
        localStorage.setItem(`${STORAGE_KEY}_${sheet.date}`, JSON.stringify(finalizedSheet));
        setSavedAt(new Date());
        setIsDirty(false);

        if (syncUrl) {
            setIsSyncing(true);
            setSyncMessage('최종 확정 업로드 중...');
            try {
                const response = await fetch(syncUrl.trim(), {
                    method: 'POST',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(finalizedSheet)
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.result === 'success') {
                        setSyncMessage('최종 확정 완료 🔒');
                    } else {
                        setSyncMessage(`⚠️ 확정 업로드 오류: ${result.message || '알 수 없는 오류'}`);
                    }
                } else {
                    setSyncMessage(`⚠️ 확정 업로드 실패 (${response.status})`);
                }
                setTimeout(() => setSyncMessage(null), 3000);
            } catch (e) {
                console.error('Finalize sync failed', e);
                setSyncMessage('⚠️ 확정 업로드 실패 (네트워크 확인)');
            } finally {
                setIsSyncing(false);
            }
        }
    };

    // baseSheet: loadDate에서 날짜 전환 중 호출될 때 stale closure 방지를 위해 명시적으로 전달
    const refreshWeather = async (lat: number, lng: number, baseSheet?: DailySheet) => {
        setIsSyncing(true);
        setSyncMessage('날씨 정보 가져오는 중...');
        try {
            // baseSheet가 있으면 그것을 우선 사용 (loadDate 전환 시 stale closure 방지)
            // 없으면 현재 sheet 사용 (버튼 클릭 등 사용자가 직접 호출 시)
            const targetSheet = baseSheet || sheet;
            const startDate = targetSheet.weather[0].date;
            const endDate = targetSheet.weather[5].date;

            // Use weather_code, temperature_2m_max, and wind_speed_10m_max
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,wind_speed_10m_max&timezone=Asia%2FSeoul&start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (data.daily && data.daily.time) {
                    const apiDates = data.daily.time as string[];
                    const apiCodes = data.daily.weather_code as number[];
                    const apiTemps = data.daily.temperature_2m_max as number[];
                    const apiWinds = data.daily.wind_speed_10m_max as number[];

                    const newWeather = targetSheet.weather.map(w => {
                        const idx = apiDates.indexOf(w.date);
                        if (idx !== -1) {
                            return {
                                ...w,
                                weather: mapWMOCodeToWeather(apiCodes[idx]),
                                temp: apiTemps[idx],
                                wind: apiWinds[idx]
                            };
                        }
                        return w;
                    });

                    // 함수형 업데이트 사용: prev(최신 상태)의 date/breads는 유지하고 weather만 교체
                    // stale closure로 인해 sheet.date가 이전 날짜를 가리켜도 안전
                    setSheet(prev => ({ ...prev, weather: newWeather }));
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

    const addBreadItem = (name: string, group: BreadGroup, defaultQty: number | null) => {
        const id = `custom_${Date.now()}`;
        const newItem: BreadItem = { id, name, group, defaultQty };
        const newList = [...masterBreadList, newItem];
        setMasterBreadList(newList);
        localStorage.setItem(BREAD_LIST_KEY, JSON.stringify(newList));

        // Also add to current sheet if not exists
        if (!sheet.breads[id]) {
            updateBreadRecord(id, {
                breadId: id,
                remain: '',
                disposal: 0,
                produce: true,
                produceQty: defaultQty || '',
                soldOutTime: ''
            });
        }
    };

    const deleteBreadItem = (id: string) => {
        if (!confirm('이 품목을 전체 목록에서 삭제하시겠습니까? (기존 기록은 보존됩니다)')) return;
        const newList = masterBreadList.filter(item => item.id !== id);
        setMasterBreadList(newList);
        localStorage.setItem(BREAD_LIST_KEY, JSON.stringify(newList));
    };

    // 특정 날짜 데이터 삭제 (로컬 + 구글 시트 동시 삭제)
    const deleteSheetDate = async (targetDate: string) => {
        const key = `${STORAGE_KEY}_${targetDate}`;
        const hasLocal = !!localStorage.getItem(key);
        const trimmedUrl = syncUrl?.trim();

        if (!hasLocal && !trimmedUrl) {
            alert(`❌ ${targetDate} 데이터가 없습니다.`);
            return;
        }

        const ok = confirm(`🗑️ ${targetDate} 데이터를 삭제하시겠습니까?\n- 이 기기 저장 데이터\n- 구글 시트 데이터\n\n이 작업은 되돌릴 수 없습니다.`);
        if (!ok) return;

        // 로컬 삭제
        if (hasLocal) localStorage.removeItem(key);

        // 구글 시트 삭제
        if (trimmedUrl) {
            setIsSyncing(true);
            setSyncMessage('구글 시트에서 삭제 중...');
            try {
                const response = await fetch(trimmedUrl, {
                    method: 'POST',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ date: targetDate, status: 'deleted' })
                });
                if (response.ok) {
                    const result = await response.json();
                    if (result.result === 'success') {
                        alert(`✅ ${targetDate} 데이터 삭제 완료!\n(이 기기 + 구글 시트 모두 삭제됨)`);
                    } else {
                        alert(`✅ 이 기기에서 삭제 완료\n⚠️ 구글 시트 오류: ${result.message}`);
                    }
                } else {
                    alert(`✅ 이 기기에서 삭제 완료\n⚠️ 구글 시트 응답 오류 (${response.status})`);
                }
            } catch (e) {
                alert(`✅ 이 기기에서 삭제 완료\n⚠️ 구글 시트 연결 실패 (나중에 확인 필요)`);
            } finally {
                setIsSyncing(false);
                setSyncMessage(null);
            }
        } else {
            alert(`✅ ${targetDate} 데이터가 이 기기에서 삭제되었습니다.\n(구글 시트 URL 미설정)`);
        }
    };

    // 날짜 데이터 이동: fromDate의 로컬 데이터를 toDate로 옮기고 구글 시트에도 반영
    const moveSheetDate = async (fromDate: string, toDate: string) => {
        const fromKey = `${STORAGE_KEY}_${fromDate}`;
        const toKey = `${STORAGE_KEY}_${toDate}`;

        const raw = localStorage.getItem(fromKey);
        if (!raw) {
            alert(`❌ ${fromDate} 데이터가 없습니다.`);
            return;
        }

        const existing = localStorage.getItem(toKey);
        if (existing) {
            const ok = confirm(`⚠️ ${toDate}에 이미 데이터가 있습니다.\n덮어쓰시겠습니까?`);
            if (!ok) return;
        }

        // date 필드를 toDate로 수정
        const data: DailySheet = JSON.parse(raw);
        const corrected: DailySheet = { ...data, date: toDate };

        // localStorage 이동
        localStorage.setItem(toKey, JSON.stringify(corrected));
        localStorage.removeItem(fromKey);

        // 현재 보고 있는 날짜 갱신
        setSheet(corrected);
        setSavedAt(new Date());
        setIsDirty(false);

        // 구글 시트 동기화
        const trimmedUrl = syncUrl?.trim();
        if (trimmedUrl) {
            setIsSyncing(true);
            setSyncMessage('구글 시트 업로드 중...');
            try {
                const response = await fetch(trimmedUrl, {
                    method: 'POST',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(corrected)
                });
                if (response.ok) {
                    const result = await response.json();
                    if (result.result === 'success') {
                        alert(`✅ 완료!\n${fromDate} → ${toDate} 이동 성공\n구글 시트 반영 완료`);
                    } else {
                        alert(`✅ 날짜 이동 완료\n⚠️ 구글 시트 오류: ${result.message}`);
                    }
                } else {
                    alert(`✅ 날짜 이동 완료\n⚠️ 구글 시트 응답 오류 (${response.status})`);
                }
            } catch (e) {
                alert(`✅ 날짜 이동 완료\n⚠️ 구글 시트 연결 실패`);
            } finally {
                setIsSyncing(false);
                setSyncMessage(null);
            }
        } else {
            alert(`✅ 날짜 이동 완료 (${fromDate} → ${toDate})\n구글 시트 URL이 없어 로컬만 반영됨`);
        }
    };

    return {
        sheet,
        masterBreadList, // Return the master list
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
        refreshWeather,
        addBreadItem,
        deleteBreadItem,
        moveSheetDate,
        deleteSheetDate
    };
};
