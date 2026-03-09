import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSheet } from './hooks/useSheet';
import type { Weather, WeatherRecord } from './types';
import AnalysisDashboard from './components/AnalysisDashboard';
import { Sparkline } from './components/Sparkline';
import './App.css';

const WEATHER_ICONS: Record<Weather, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  'partly-cloudy': '⛅'
};

interface SearchBarProps {
  onSearchChange: (term: string) => void;
  onClear: () => void;
}

// IME(한/영 입력기) 버그 수정:
// controlled input (value={...}) 을 사용하면 React가 리렌더링마다 DOM의 value를
// 강제로 패치하는데, 이 과정에서 Windows+Chrome 환경의 한글 IME 세션이 초기화됨.
// uncontrolled input (ref 기반)으로 전환하면 React가 DOM을 건드리지 않아 IME가 유지됨.
const SearchBar = React.memo(({ onSearchChange, onClear }: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // clear 버튼 표시 여부만 로컬 state로 관리 (검색어 전체를 state로 올리지 않음)
  const [hasContent, setHasContent] = useState(false);

  const handleClear = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    setHasContent(false);
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  return (
    <div className="search-bar">
      <span className="search-icon">🔍</span>
      <input
        ref={inputRef}
        type="search"
        lang="ko"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        // inputMode="text": number 타입 input에 포커스 후 돌아올 때 IME가 숫자모드로
        // 남아있는 문제를 방지. 브라우저/OS에 이 input이 text임을 명시적으로 알림.
        inputMode="text"
        placeholder="빵 이름을 검색하세요..."
        // value 속성 없음 → uncontrolled input
        autoComplete="off"
        onFocus={(e) => {
          // 크로미움(Edge/Chrome) 기반 브라우저에서 IME 세션이 영문(Alphanumeric)에 고정되는 현상 해결:
          // 포커스 시 아주 짧은 순간 readOnly를 걸었다가 해제하면 브라우저가 입력을 재평가하며 IME를 초기화함.
          const target = e.currentTarget;
          target.readOnly = true;
          setTimeout(() => {
            target.readOnly = false;
          }, 40);
        }}
        onChange={(e) => {
          const val = e.target.value;
          setHasContent(val.length > 0);
          if (composingRef.current) {
            // IME 조합 중(compositionstart~end 사이)에는 검색 필터링 하지 않음
            // 조합이 끝난 후(onCompositionEnd)에 최종 검색어로 필터링
            return;
          }
          clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            onSearchChange(val);
          }, 150);
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          const val = e.currentTarget.value;
          clearTimeout(debounceTimer.current);
          // 조합 완료 후 즉시 검색어 반영 (debounce 없이)
          onSearchChange(val);
        }}
      />
      {hasContent && (
        <button
          className="clear-search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
        >✕</button>
      )}
    </div>
  );
});

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(() => {
    // toISOString()은 UTC 기준이라 새벽 5~7시(KST)에 열면 전날 날짜가 됨
    // 로컬 시간 기준으로 날짜를 구해야 한국 새벽 시간대에도 정확함
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [activeTab, setActiveTab] = useState<'edit' | 'analyze' | 'demo' | 'settings'>('edit');
  const [syncUrl, setSyncUrl] = useState(() => localStorage.getItem('google_sheets_url') || '');
  const [lat, setLat] = useState(() => Number(localStorage.getItem('latitude')) || 37.526);
  const [lng, setLng] = useState(() => Number(localStorage.getItem('longitude')) || 126.674);
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchTerm('');
  }, []);

  const [sortMode, setSortMode] = useState<'original' | 'abc'>('original');
  const [isAddingBread, setIsAddingBread] = useState(false);
  const [newBread, setNewBread] = useState<{ name: string, group: 'A' | 'B', defaultQty: string | number }>({ name: '', group: 'A', defaultQty: '' });

  const {
    sheet, masterBreadList, savedAt, isDirty, isSyncing, syncMessage,
    saveSheet, updateWeather, updateBreadRecord, updateMemo, loadDate,
    getAllHistory, generateDummyData, clearDemoData, testSync, finalizeSheet,
    refreshWeather, addBreadItem, deleteBreadItem, moveSheetDate, deleteSheetDate
  } = useSheet(currentDate, syncUrl);

  const [moveFrom, setMoveFrom] = React.useState('');
  const [moveTo, setMoveTo] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState('');

  const allHistory = useMemo(() => {
    const rawHistory = getAllHistory();
    // Merge current live sheet into history so dashboard sees unsaved changes
    const filtered = rawHistory.filter(h => h.date !== sheet.date);
    return [sheet, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
  }, [sheet]);
  const history = useMemo(() => activeTab === 'analyze' || activeTab === 'edit' ? allHistory : [], [activeTab, allHistory]);

  useEffect(() => {
    localStorage.setItem('google_sheets_url', syncUrl);
  }, [syncUrl]);

  useEffect(() => {
    localStorage.setItem('latitude', lat.toString());
    localStorage.setItem('longitude', lng.toString());
  }, [lat, lng]);

  // Sync data on mount
  useEffect(() => {
    if (syncUrl) {
      loadDate(currentDate);
    }
  }, []);

  const getSparklineData = (breadId: string) => {
    const last7Days = [];
    const baseDate = new Date(currentDate);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry = allHistory.find(h => h.date === dateStr);
      const bData = entry?.breads[breadId];
      const todayWeatherEntry = entry?.weather?.find(w => w.date === dateStr);

      // 데이터 시프트(Data Shift) 보정:
      // 오늘 매장에 깔리는 빵 개수(생산량)는 '어제 시트'에 적힌 내일 생산수량(produceQty)입니다.
      const yesterdayDate = new Date(d);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yDateStr = yesterdayDate.toISOString().split('T')[0];
      const yesterdayEntry = allHistory.find(h => h.date === yDateStr);
      const actualProdQtyForThatDay = yesterdayEntry?.breads[breadId]?.produceQty;

      // produce: false(생산X)이면 produceQty 무시
      const shouldProduce = bData?.produce !== false;
      last7Days.push({
        prod: Number(shouldProduce ? actualProdQtyForThatDay : 0) || 0,
        disp: Number(bData?.disposal) || 0,
        rem: Number(bData?.remain) || 0,
        date: dateStr,
        weather: todayWeatherEntry?.weather || undefined,
        temp: todayWeatherEntry?.temp,
        wind: todayWeatherEntry?.wind,
      });
    }
    return last7Days.reverse();
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDirty && !confirm('저장하지 않은 변경사항이 있습니다. 계속하시겠습니까?')) return;
    const newDate = e.target.value;
    setCurrentDate(newDate);
    loadDate(newDate);
  };

  const isFinalized = sheet.status === 'finalized';

  const handleTabChange = (tab: 'edit' | 'analyze' | 'demo' | 'settings') => {
    if (isDirty && !confirm('저장하지 않은 변경사항이 있습니다. 계속하시겠습니까?')) return;
    setActiveTab(tab);
  };

  const copyToKakao = () => {
    const itemsExcluded = masterBreadList.filter(item => {
      const rec = sheet.breads[item.id];
      return rec && !rec.produce;
    });
    const dateStr = new Date(currentDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    let text = `🍞 ${dateStr} 생산 제외 품목\n\n`;

    if (itemsExcluded.length === 0) {
      text = `🍞 ${dateStr} 생산 지시서\n- 전 품목 정상 생산\n\n`;
    } else {
      // Group items by A/B for better readability
      const groupA = itemsExcluded.filter(i => i.group === 'A');
      const groupB = itemsExcluded.filter(i => i.group === 'B');

      if (groupA.length > 0) {
        text += `[기본 빵류 제외]\n`;
        groupA.forEach(item => {
          text += `- ${item.name}\n`;
        });
        text += '\n';
      }

      if (groupB.length > 0) {
        text += `[기타/고로케 제외]\n`;
        groupB.forEach(item => {
          text += `- ${item.name}\n`;
        });
        text += '\n';
      }
    }

    if (sheet.memo) {
      text += `📝 메모/주의사항:\n${sheet.memo}\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      alert('카톡용 텍스트(생산 제외 품목 중심)가 복사되었습니다!');
    }).catch(err => {
      console.error('Copy failed', err);
      alert('복사 실패. 브라우저 권한을 확인해 주세요.');
    });
  };

  const handleAddBread = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBread.name.trim()) return;
    addBreadItem(newBread.name.trim(), newBread.group, newBread.defaultQty === '' ? null : Number(newBread.defaultQty));
    setNewBread({ name: '', group: 'A', defaultQty: '' });
    setIsAddingBread(false);
  };

  const tomorrowLabel = useMemo(() => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }, [currentDate]);

  const renderTable = (group: 'A' | 'B') => {
    const rawItems = masterBreadList.filter(item => item.group === group);

    // 가나다 정렬 (검색 필터와 독립적으로 순서만 결정)
    const sortedItems = sortMode === 'abc'
      ? [...rawItems].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
      : rawItems;

    // 검색어 매칭 여부 (DOM에서 제거하지 않고 숨겨서 레이아웃 변동 방지)
    const matchSearch = (name: string) =>
      !searchTerm || name.includes(searchTerm);

    const hours = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 ~ 22:00

    return (
      <div className="table-container">
        <table className="bread-table">
          <thead>
            <tr>
              <th style={{ width: '220px' }}>빵 이름</th>
              <th>잔량</th>
              <th title="기부와 묶음빵">폐기(기부/묶음빵)</th>
              <th className="no-print">추세(7일)</th>
              <th>생산</th>
              <th>내일({tomorrowLabel}) 생산수량</th>
              <th>품절시간</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map(item => {
              const record = sheet.breads[item.id] ?? {
                breadId: item.id,
                remain: '',
                disposal: 0,
                produce: true,
                produceQty: item.defaultQty ?? '',
                soldOutTime: ''
              };
              const isQuantityDisabled = item.defaultQty === null;
              const hidden = !matchSearch(item.name);

              return (
                <tr key={item.id} className={!record.produce ? 'disabled-row' : ''} style={hidden ? { display: 'none' } : undefined}>
                  <td className="name-cell">
                    <div className="bread-name">{item.name}</div>
                    {item.note && <div className="bread-note">{item.note}</div>}
                  </td>
                  <td>
                    <input
                      type="text"
                      lang="ko"
                      pattern="[0-9]*"
                      value={record.remain}
                      onChange={(e) => updateBreadRecord(item.id, { remain: e.target.value })}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      readOnly={isFinalized}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      lang="ko"
                      pattern="[0-9]*"
                      value={record?.disposal || ''}
                      onChange={(e) => updateBreadRecord(item.id, { disposal: e.target.value })}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      readOnly={isFinalized}
                    />
                  </td>
                  <td className="no-print center">
                    <Sparkline data={getSparklineData(item.id)} />
                  </td>
                  <td className="center">
                    <button
                      className={`toggle-btn ${record.produce ? 'active' : ''}`}
                      onClick={() => updateBreadRecord(item.id, { produce: !record.produce })}
                      disabled={isFinalized}
                    >
                      {record.produce ? '✅' : '❌'}
                    </button>
                  </td>
                  <td>
                    {!isQuantityDisabled ? (
                      <input
                        type="text"
                        lang="ko"
                        pattern="[0-9]*"
                        value={record.produceQty}
                        onChange={(e) => updateBreadRecord(item.id, { produceQty: e.target.value })}
                        disabled={!record.produce || isFinalized}
                      />
                    ) : (
                      <span className="no-qty">-</span>
                    )}
                  </td>
                  <td className="sold-out-cell">
                    <select
                      value={record.soldOutTime || ''}
                      onChange={(e) => updateBreadRecord(item.id, { soldOutTime: e.target.value })}
                      className="hour-select"
                      disabled={isFinalized}
                    >
                      <option value="">-</option>
                      {hours.map(h => (
                        <option key={h} value={`${String(h).padStart(2, '0')}:00`}>
                          {h}시
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="no-print">
                    <button
                      className="delete-bread-btn"
                      onClick={() => deleteBreadItem(item.id)}
                      title="품목 삭제"
                      disabled={isFinalized}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="app-header no-print">
        <div className="header-left">
          <h1>🍞 빵 생산 지시서</h1>
          {sheet.status === 'finalized' ? (
            <div className="status-badge finalized">🔒 최종 확정됨</div>
          ) : (
            <div className="status-badge draft">🔓 작성 중 (미확정)</div>
          )}
          <nav className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => handleTabChange('edit')}
            >
              📝 생산 입력
            </button>
            <button
              className={`tab-btn ${activeTab === 'analyze' ? 'active' : ''}`}
              onClick={() => handleTabChange('analyze')}
            >
              📊 데이터 분석
            </button>
            <button
              className={`tab-btn ${activeTab === 'demo' ? 'active' : ''}`}
              onClick={() => handleTabChange('demo')}
            >
              🧪 데모
            </button>
            <button
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleTabChange('settings')}
            >
              ⚙️ 설정
            </button>
          </nav>
        </div>
        <div className="header-controls">
          <input type="date" value={currentDate} onChange={handleDateChange} />

          {isSyncing && <div className="sync-spinner" title="동기화 중...">🔄</div>}
          {syncMessage && <span className="sync-msg">{syncMessage}</span>}

          <button
            className={`save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={saveSheet}
          >
            💾 {isDirty ? '저장하기' : '저장됨'}
          </button>

          {savedAt && (
            <span className="last-saved-time">
              마지막 저장: {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button className="copy-btn" onClick={copyToKakao} title="생산 목록을 텍스트로 복사하여 카톡으로 보내세요">
            📋 카톡용 복사
          </button>

          {sheet.status !== 'finalized' ? (
            <button className="finalize-btn" onClick={finalizeSheet}>🔓 최종 확정하기</button>
          ) : (
            <button className="finalize-btn finalized" disabled>🔒 최종 확정완료</button>
          )}

          <button className="print-btn" onClick={() => window.print()}>🖨️ 인쇄하기</button>
        </div>
      </header>

      <section className="weather-section">
        <div className="weather-grid">
          {sheet.weather.map((w: WeatherRecord, i: number) => (
            <div key={w.date} className={`weather-card ${w.label === '당일' ? 'today' : ''}`}>
              <div className="weather-label">{w.label}</div>
              <div className="weather-date">{w.date.slice(5)}</div>
              <div className="weather-display">
                <button
                  className="weather-main-btn"
                  onClick={() => {
                    const types = Object.keys(WEATHER_ICONS) as Weather[];
                    const currentIdx = types.indexOf(w.weather || 'sunny');
                    const nextIdx = (currentIdx + 1) % types.length;
                    updateWeather(i, types[nextIdx]);
                  }}
                  title="날씨 변경하려면 클릭"
                >
                  {w.weather ? WEATHER_ICONS[w.weather as Weather] : '❓'}
                </button>
              </div>
              <div className="weather-details">
                {w.temp !== undefined && (
                  <span className="weather-temp">{Math.round(w.temp)}°C</span>
                )}
                {w.wind !== undefined && (
                  <span className="weather-wind">{w.wind.toFixed(1)}m/s</span>
                )}
              </div>
            </div>
          ))}
          <div className="weather-card refresh-card">
            <button className="refresh-weather-btn" title="API에서 날씨 자동 불러오기" onClick={() => refreshWeather(lat, lng)}>
              🛰️ 자동 날씨<br />불러오기
            </button>
          </div>
        </div>
      </section>

      {/* Tomorrow weather warning */}
      {activeTab === 'edit' && !sheet.weather.find(w => w.label === '다음날')?.weather && (
        <div className="weather-warn no-print">
          ⚠️ <strong>내일 날씨</strong>가 아직 입력되지 않았습니다. 입력하면 생산 추천 정확도가 올라갑니다.
        </div>
      )}

      <main className="sheet-main">
        {activeTab === 'edit' ? (
          <>
            <div className="edit-controls no-print">
              <SearchBar
                onSearchChange={handleSearchChange}
                onClear={handleSearchClear}
              />
              <div className="filter-group">
                <button
                  className={`sort-toggle-btn ${sortMode === 'abc' ? 'active' : ''}`}
                  onClick={() => setSortMode(sortMode === 'original' ? 'abc' : 'original')}
                  title={sortMode === 'original' ? '가나다순으로 정렬' : '원래 순서로 정렬'}
                >
                  {sortMode === 'original' ? '🔃 원래순서' : '🔠 가나다순'}
                </button>
                <button
                  className={`add-item-toggle ${isAddingBread ? 'active' : ''}`}
                  onClick={() => setIsAddingBread(!isAddingBread)}
                >
                  {isAddingBread ? '취소' : '➕ 빵 종류 추가'}
                </button>
              </div>
            </div>

            {isAddingBread && (
              <div className="add-bread-form no-print">
                <form onSubmit={handleAddBread}>
                  <input
                    type="text"
                    placeholder="빵 이름 (예: 소보로빵)"
                    value={newBread.name}
                    onChange={(e) => setNewBread({ ...newBread, name: e.target.value })}
                    required
                  />
                  <select
                    value={newBread.group}
                    onChange={(e) => setNewBread({ ...newBread, group: e.target.value as 'A' | 'B' })}
                  >
                    <option value="A">기본 빵류 (A)</option>
                    <option value="B">기타 & 고로케 (B)</option>
                  </select>
                  <input
                    type="text"
                    lang="ko"
                    pattern="[0-9]*"
                    placeholder="기본 생산량"
                    value={newBread.defaultQty}
                    onChange={(e) => setNewBread({ ...newBread, defaultQty: e.target.value })}
                  />
                  <button type="submit" className="submit-add-btn">추가하기</button>
                </form>
              </div>
            )}

            <div className="group-sections">
              <div className="section">
                <h2>기본 빵류 (A)</h2>
                {renderTable('A')}
              </div>
              <div className="section">
                <h2>기타 & 고로케류 (B)</h2>
                {renderTable('B')}
              </div>
            </div>

            <section className="memo-section">
              <h2>📝 메모 / 전달사항</h2>
              <textarea
                value={sheet.memo}
                onChange={(e) => updateMemo(e.target.value)}
                placeholder="제빵기사님께 전달할 내용을 적어주세요..."
                readOnly={isFinalized}
              />
            </section>
          </>
        ) : activeTab === 'analyze' ? (
          <AnalysisDashboard history={history} todayDate={currentDate} />
        ) : activeTab === 'demo' ? (
          <div className="demo-section">
            <div className="demo-card">
              <h2>🧪 시뮬레이션 데모</h2>
              <p>1개월(30일) 치의 가상 판매/폐기 데이터를 자동으로 생성합니다.</p>
              <p className="warning-text">⚠️ 주의: 현재 저장된 실제 데이터가 있을 경우 날짜가 겹치면 덮어씌워질 수 있습니다.</p>
              <button className="generate-btn" onClick={() => {
                generateDummyData();
                alert('30일치 가상 데이터가 생성되었습니다. 데이터 분석 탭을 확인해 보세요!');
                setActiveTab('analyze');
              }}>
                30일 데이터 생성하기
              </button>
              <button className="clear-demo-btn" onClick={() => {
                if (confirm('모든 데모 데이터를 삭제하시겠습니까? (실제 기록은 유지됩니다)')) {
                  clearDemoData();
                  alert('데모 데이터가 삭제되었습니다.');
                }
              }}>
                데모 데이터만 삭제하기
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-section">
            <div className="settings-card">
              <div className="settings-item">
                <h3>⚙️ 앱 설정</h3>
                <p className="description">🔗 구글 시트 연동 (동기화)</p>
                <div className="sync-input-group">
                  <input
                    type="text"
                    value={syncUrl}
                    onChange={(e) => setSyncUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                  <button
                    className="save-btn"
                    style={{ marginLeft: '10px', height: '100%', padding: '10px 15px' }}
                    onClick={() => testSync()}
                    disabled={!syncUrl}
                  >
                    🔗 연결 테스트
                  </button>
                </div>
                {syncUrl ? (
                  <div className="sync-status-info">
                    ✅ 주소가 입력되었습니다.
                  </div>
                ) : (
                  <div className="sync-status-info" style={{ color: '#e74c3c' }}>
                    ⚠️ 주소가 입력되지 않았습니다. 위 칸에 구글 시트 주소를 넣어주세요.
                  </div>
                )}
              </div>

              <div className="settings-item">
                <h3>📍 매장 위치 설정 (인천 서구 가정동)</h3>
                <p className="description">자동 날씨를 불러올 위치의 위도와 경도입니다.</p>
                <div className="location-input-group">
                  <div className="coord-input">
                    <label>위도(Latitude)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={lat}
                      onChange={(e) => setLat(Number(e.target.value))}
                      step="0.001"
                    />
                  </div>
                  <div className="coord-input">
                    <label>경도(Longitude)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={lng}
                      onChange={(e) => setLng(Number(e.target.value))}
                      step="0.001"
                    />
                  </div>
                </div>
                <p className="help-text" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '5px' }}>
                  💡 인천 서구 가정동 근처로 기본 설정되어 있습니다.
                </p>
              </div>

              <div className="settings-item">
                <h3>📦 날짜 데이터 이동</h3>
                <p className="description">잘못된 날짜에 저장된 데이터를 올바른 날짜로 옮깁니다.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '0.9rem' }}>이동할 날짜</label>
                    <input type="date" value={moveFrom} onChange={e => setMoveFrom(e.target.value)} />
                  </div>
                  <span style={{ fontSize: '1.2rem' }}>→</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '0.9rem' }}>옮길 날짜</label>
                    <input type="date" value={moveTo} onChange={e => setMoveTo(e.target.value)} />
                  </div>
                  <button
                    className="save-btn"
                    style={{ padding: '10px 16px' }}
                    disabled={!moveFrom || !moveTo || moveFrom === moveTo}
                    onClick={() => {
                      if (!moveFrom || !moveTo) return;
                      moveSheetDate(moveFrom, moveTo).then(() => {
                        setCurrentDate(moveTo);
                        loadDate(moveTo);
                      });
                    }}
                  >
                    📦 이동하기
                  </button>
                </div>
                <p className="help-text" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '8px' }}>
                  💡 이동 후 구글 시트에도 자동 반영됩니다.
                </p>
              </div>

              <div className="settings-item">
                <h3>🗑️ 날짜 데이터 삭제</h3>
                <p className="description">잘못 저장된 날짜의 데이터를 삭제합니다.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '0.9rem' }}>삭제할 날짜</label>
                    <input type="date" value={deleteTarget} onChange={e => setDeleteTarget(e.target.value)} />
                  </div>
                  <button
                    style={{ padding: '10px 16px', background: '#e53935', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
                    disabled={!deleteTarget}
                    onClick={() => {
                      deleteSheetDate(deleteTarget);
                      setDeleteTarget('');
                    }}
                  >
                    🗑️ 삭제하기
                  </button>
                </div>
                <p className="help-text" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '8px' }}>
                  ⚠️ 삭제 후 복구할 수 없습니다. 이 기기 + 구글 시트에서 모두 삭제됩니다.
                </p>
              </div>

              <section className="settings-item help">
                <h3>❓ 설정 방법 도움말</h3>
                <ol>
                  <li>구글 시트를 새로 하나 만듭니다.</li>
                  <li><strong>[확장 프로그램] &gt; [Apps Script]</strong>를 클릭합니다.</li>
                  <li>파일에 제공된 <code>google_sheets_bridge.js</code> 코드를 붙여넣습니다.</li>
                  <li><strong>[배포] &gt; [새 배포]</strong> (유형: 웹 앱, 액세스 권한: 모든 사용자)를 실행합니다.</li>
                  <li>완료 후 나오는 <strong>웹 앱 URL</strong>을 위 칸에 붙여넣으면 끝!</li>
                </ol>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="footer no-print">
        <p>© 2026 Bread Production App. All records are saved locally.</p>
      </footer>

      {/* Print-only layout header */}
      <div className="print-header only-print">
        <h1>생산 지시서 ({currentDate})</h1>
        <div className="print-weather">
          날씨: {(() => {
            const today = sheet.weather.find(w => w.label === '당일');
            if (!today?.weather) return '미기록';
            let weatherStr = WEATHER_ICONS[today.weather];
            if (today.temp !== undefined) weatherStr += ` ${Math.round(today.temp)}°C`;
            if (today.wind !== undefined) weatherStr += ` / 풍속 ${today.wind.toFixed(1)}m/s`;
            return weatherStr;
          })()}
        </div>
      </div>
    </div >
  );
};

export default App;
