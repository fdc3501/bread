import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSheet } from './hooks/useSheet';
import type { Weather, WeatherRecord } from './types';
import AnalysisDashboard from './components/AnalysisDashboard';
import { Sparkline } from './components/Sparkline';
import './App.css';

const WEATHER_ICONS: Record<Weather, string> = {
  sunny: '?截?,
  cloudy: '?곻툘',
  rainy: '?뙢截?,
  snowy: '?꾬툘',
  'partly-cloudy': '??
};

interface SearchBarProps {
  onSearchChange: (term: string) => void;
  onClear: () => void;
}

// IME(?????낅젰湲? 踰꾧렇 ?섏젙:
// controlled input (value={...}) ???ъ슜?섎㈃ React媛 由щ젋?붾쭅留덈떎 DOM??value瑜?// 媛뺤젣濡??⑥튂?섎뒗?? ??怨쇱젙?먯꽌 Windows+Chrome ?섍꼍???쒓? IME ?몄뀡??珥덇린?붾맖.
// uncontrolled input (ref 湲곕컲)?쇰줈 ?꾪솚?섎㈃ React媛 DOM??嫄대뱶由ъ? ?딆븘 IME媛 ?좎???
const SearchBar = React.memo(({ onSearchChange, onClear }: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // clear 踰꾪듉 ?쒖떆 ?щ?留?濡쒖뺄 state濡?愿由?(寃?됱뼱 ?꾩껜瑜?state濡??щ━吏 ?딆쓬)
  const [hasContent, setHasContent] = useState(false);

  const handleClear = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    setHasContent(false);
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  return (
    <div className="search-bar">
      <span className="search-icon">?뵇</span>
      <input
        ref={inputRef}
        type="text"
        // inputMode="text": number ???input???ъ빱?????뚯븘????IME媛 ?レ옄紐⑤뱶濡?        // ?⑥븘?덈뒗 臾몄젣瑜?諛⑹?. 釉뚮씪?곗?/OS????input??text?꾩쓣 紐낆떆?곸쑝濡??뚮┝.
        inputMode="text"
        placeholder="鍮??대쫫??寃?됲븯?몄슂..."
        // value ?띿꽦 ?놁쓬 ??uncontrolled input
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const val = e.target.value;
          setHasContent(val.length > 0);
          if (composingRef.current) {
            // IME 議고빀 以?compositionstart~end ?ъ씠)?먮뒗 寃???꾪꽣留??섏? ?딆쓬
            // 議고빀???앸궃 ??onCompositionEnd)??理쒖쥌 寃?됱뼱濡??꾪꽣留?            return;
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
          // 議고빀 ?꾨즺 ??利됱떆 寃?됱뼱 諛섏쁺 (debounce ?놁씠)
          onSearchChange(val);
        }}
      />
      {hasContent && (
        <button
          className="clear-search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
        >??/button>
      )}
    </div>
  );
});

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(() => {
    // toISOString()? UTC 湲곗??대씪 ?덈꼍 5~7??KST)???대㈃ ?꾨궇 ?좎쭨媛 ??    // 濡쒖뺄 ?쒓컙 湲곗??쇰줈 ?좎쭨瑜?援ы빐???쒓뎅 ?덈꼍 ?쒓컙??먮룄 ?뺥솗??    const now = new Date();
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

      // ?곗씠???쒗봽??Data Shift) 蹂댁젙:
      // ?ㅻ뒛 留ㅼ옣??源붾━??鍮?媛쒖닔(?앹궛????'?댁젣 ?쒗듃'???곹엺 ?댁씪 ?앹궛?섎웾(produceQty)?낅땲??
      const yesterdayDate = new Date(d);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yDateStr = yesterdayDate.toISOString().split('T')[0];
      const yesterdayEntry = allHistory.find(h => h.date === yDateStr);
      const actualProdQtyForThatDay = yesterdayEntry?.breads[breadId]?.produceQty;

      // produce: false(?앹궛X)?대㈃ produceQty 臾댁떆
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
    if (isDirty && !confirm('??ν븯吏 ?딆? 蹂寃쎌궗??씠 ?덉뒿?덈떎. 怨꾩냽?섏떆寃좎뒿?덇퉴?')) return;
    const newDate = e.target.value;
    setCurrentDate(newDate);
    loadDate(newDate);
  };

  const isFinalized = sheet.status === 'finalized';

  const handleTabChange = (tab: 'edit' | 'analyze' | 'demo' | 'settings') => {
    if (isDirty && !confirm('??ν븯吏 ?딆? 蹂寃쎌궗??씠 ?덉뒿?덈떎. 怨꾩냽?섏떆寃좎뒿?덇퉴?')) return;
    setActiveTab(tab);
  };

  const copyToKakao = () => {
    const itemsExcluded = masterBreadList.filter(item => {
      const rec = sheet.breads[item.id];
      return rec && !rec.produce;
    });
    const dateStr = new Date(currentDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    let text = `?뜛 ${dateStr} ?앹궛 ?쒖쇅 ?덈ぉ\n\n`;

    if (itemsExcluded.length === 0) {
      text = `?뜛 ${dateStr} ?앹궛 吏?쒖꽌\n- ???덈ぉ ?뺤긽 ?앹궛\n\n`;
    } else {
      // Group items by A/B for better readability
      const groupA = itemsExcluded.filter(i => i.group === 'A');
      const groupB = itemsExcluded.filter(i => i.group === 'B');

      if (groupA.length > 0) {
        text += `[湲곕낯 鍮듬쪟 ?쒖쇅]\n`;
        groupA.forEach(item => {
          text += `- ${item.name}\n`;
        });
        text += '\n';
      }

      if (groupB.length > 0) {
        text += `[湲고?/怨좊줈耳 ?쒖쇅]\n`;
        groupB.forEach(item => {
          text += `- ${item.name}\n`;
        });
        text += '\n';
      }
    }

    if (sheet.memo) {
      text += `?뱷 硫붾え/二쇱쓽?ы빆:\n${sheet.memo}\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      alert('移댄넚???띿뒪???앹궛 ?쒖쇅 ?덈ぉ 以묒떖)媛 蹂듭궗?섏뿀?듬땲??');
    }).catch(err => {
      console.error('Copy failed', err);
      alert('蹂듭궗 ?ㅽ뙣. 釉뚮씪?곗? 沅뚰븳???뺤씤??二쇱꽭??');
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

    // 媛?섎떎 ?뺣젹 (寃???꾪꽣? ?낅┰?곸쑝濡??쒖꽌留?寃곗젙)
    const sortedItems = sortMode === 'abc'
      ? [...rawItems].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
      : rawItems;

    // 寃?됱뼱 留ㅼ묶 ?щ? (DOM?먯꽌 ?쒓굅?섏? ?딄퀬 ?④꺼???덉씠?꾩썐 蹂??諛⑹?)
    const matchSearch = (name: string) =>
      !searchTerm || name.includes(searchTerm);

    const hours = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 ~ 22:00

    return (
      <div className="table-container">
        <table className="bread-table">
          <thead>
            <tr>
              <th style={{ width: '220px' }}>鍮??대쫫</th>
              <th>?붾웾</th>
              <th title="湲곕?? 臾띠쓬鍮?>?먭린(湲곕?/臾띠쓬鍮?</th>
              <th className="no-print">異붿꽭(7??</th>
              <th>?앹궛</th>
              <th>?댁씪({tomorrowLabel}) ?앹궛?섎웾</th>
              <th>?덉젅?쒓컙</th>
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
                      inputMode="numeric"
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
                      inputMode="numeric"
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
                      {record.produce ? '?? : '??}
                    </button>
                  </td>
                  <td>
                    {!isQuantityDisabled ? (
                      <input
                        type="text"
                        inputMode="numeric"
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
                          {h}??                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="no-print">
                    <button
                      className="delete-bread-btn"
                      onClick={() => deleteBreadItem(item.id)}
                      title="?덈ぉ ??젣"
                      disabled={isFinalized}
                    >
                      ?뿊截?                    </button>
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
          <h1>?뜛 鍮??앹궛 吏?쒖꽌</h1>
          {sheet.status === 'finalized' ? (
            <div className="status-badge finalized">?뵏 理쒖쥌 ?뺤젙??/div>
          ) : (
            <div className="status-badge draft">?뵑 ?묒꽦 以?(誘명솗??</div>
          )}
          <nav className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => handleTabChange('edit')}
            >
              ?뱷 ?앹궛 ?낅젰
            </button>
            <button
              className={`tab-btn ${activeTab === 'analyze' ? 'active' : ''}`}
              onClick={() => handleTabChange('analyze')}
            >
              ?뱤 ?곗씠??遺꾩꽍
            </button>
            <button
              className={`tab-btn ${activeTab === 'demo' ? 'active' : ''}`}
              onClick={() => handleTabChange('demo')}
            >
              ?㎦ ?곕え
            </button>
            <button
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleTabChange('settings')}
            >
              ?숋툘 ?ㅼ젙
            </button>
          </nav>
        </div>
        <div className="header-controls">
          <input type="date" value={currentDate} onChange={handleDateChange} />

          {isSyncing && <div className="sync-spinner" title="?숆린??以?..">?봽</div>}
          {syncMessage && <span className="sync-msg">{syncMessage}</span>}

          <button
            className={`save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={saveSheet}
          >
            ?뮶 {isDirty ? '??ν븯湲? : '??λ맖'}
          </button>

          {savedAt && (
            <span className="last-saved-time">
              留덉?留???? {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button className="copy-btn" onClick={copyToKakao} title="?앹궛 紐⑸줉???띿뒪?몃줈 蹂듭궗?섏뿬 移댄넚?쇰줈 蹂대궡?몄슂">
            ?뱥 移댄넚??蹂듭궗
          </button>

          {sheet.status !== 'finalized' ? (
            <button className="finalize-btn" onClick={finalizeSheet}>?뵑 理쒖쥌 ?뺤젙?섍린</button>
          ) : (
            <button className="finalize-btn finalized" disabled>?뵏 理쒖쥌 ?뺤젙?꾨즺</button>
          )}

          <button className="print-btn" onClick={() => window.print()}>?뼥截??몄뇙?섍린</button>
        </div>
      </header>

      <section className="weather-section">
        <div className="weather-grid">
          {sheet.weather.map((w: WeatherRecord, i: number) => (
            <div key={w.date} className={`weather-card ${w.label === '?뱀씪' ? 'today' : ''}`}>
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
                  title="?좎뵪 蹂寃쏀븯?ㅻ㈃ ?대┃"
                >
                  {w.weather ? WEATHER_ICONS[w.weather as Weather] : '??}
                </button>
              </div>
              <div className="weather-details">
                {w.temp !== undefined && (
                  <span className="weather-temp">{Math.round(w.temp)}째C</span>
                )}
                {w.wind !== undefined && (
                  <span className="weather-wind">{w.wind.toFixed(1)}m/s</span>
                )}
              </div>
            </div>
          ))}
          <div className="weather-card refresh-card">
            <button className="refresh-weather-btn" title="API?먯꽌 ?좎뵪 ?먮룞 遺덈윭?ㅺ린" onClick={() => refreshWeather(lat, lng)}>
              ?쎇截??먮룞 ?좎뵪<br />遺덈윭?ㅺ린
            </button>
          </div>
        </div>
      </section>

      {/* Tomorrow weather warning */}
      {activeTab === 'edit' && !sheet.weather.find(w => w.label === '?ㅼ쓬??)?.weather && (
        <div className="weather-warn no-print">
          ?좑툘 <strong>?댁씪 ?좎뵪</strong>媛 ?꾩쭅 ?낅젰?섏? ?딆븯?듬땲?? ?낅젰?섎㈃ ?앹궛 異붿쿇 ?뺥솗?꾧? ?щ씪媛묐땲??
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
                  title={sortMode === 'original' ? '媛?섎떎?쒖쑝濡??뺣젹' : '?먮옒 ?쒖꽌濡??뺣젹'}
                >
                  {sortMode === 'original' ? '?봼 ?먮옒?쒖꽌' : '?뵠 媛?섎떎??}
                </button>
                <button
                  className={`add-item-toggle ${isAddingBread ? 'active' : ''}`}
                  onClick={() => setIsAddingBread(!isAddingBread)}
                >
                  {isAddingBread ? '痍⑥냼' : '??鍮?醫낅쪟 異붽?'}
                </button>
              </div>
            </div>

            {isAddingBread && (
              <div className="add-bread-form no-print">
                <form onSubmit={handleAddBread}>
                  <input
                    type="text"
                    placeholder="鍮??대쫫 (?? ?뚮낫濡쒕뭇)"
                    value={newBread.name}
                    onChange={(e) => setNewBread({ ...newBread, name: e.target.value })}
                    required
                  />
                  <select
                    value={newBread.group}
                    onChange={(e) => setNewBread({ ...newBread, group: e.target.value as 'A' | 'B' })}
                  >
                    <option value="A">湲곕낯 鍮듬쪟 (A)</option>
                    <option value="B">湲고? & 怨좊줈耳 (B)</option>
                  </select>
                  <input
                    type="number"
                    placeholder="湲곕낯 ?앹궛??
                    value={newBread.defaultQty}
                    onChange={(e) => setNewBread({ ...newBread, defaultQty: e.target.value })}
                  />
                  <button type="submit" className="submit-add-btn">異붽??섍린</button>
                </form>
              </div>
            )}

            <div className="group-sections">
              <div className="section">
                <h2>湲곕낯 鍮듬쪟 (A)</h2>
                {renderTable('A')}
              </div>
              <div className="section">
                <h2>湲고? & 怨좊줈耳瑜?(B)</h2>
                {renderTable('B')}
              </div>
            </div>

            <section className="memo-section">
              <h2>?뱷 硫붾え / ?꾨떖?ы빆</h2>
              <textarea
                value={sheet.memo}
                onChange={(e) => updateMemo(e.target.value)}
                placeholder="?쒕뭇湲곗궗?섍퍡 ?꾨떖???댁슜???곸뼱二쇱꽭??.."
                readOnly={isFinalized}
              />
            </section>
          </>
        ) : activeTab === 'analyze' ? (
          <AnalysisDashboard history={history} todayDate={currentDate} />
        ) : activeTab === 'demo' ? (
          <div className="demo-section">
            <div className="demo-card">
              <h2>?㎦ ?쒕??덉씠???곕え</h2>
              <p>1媛쒖썡(30?? 移섏쓽 媛???먮ℓ/?먭린 ?곗씠?곕? ?먮룞?쇰줈 ?앹꽦?⑸땲??</p>
              <p className="warning-text">?좑툘 二쇱쓽: ?꾩옱 ??λ맂 ?ㅼ젣 ?곗씠?곌? ?덉쓣 寃쎌슦 ?좎쭨媛 寃뱀튂硫???뼱?뚯썙吏????덉뒿?덈떎.</p>
              <button className="generate-btn" onClick={() => {
                generateDummyData();
                alert('30?쇱튂 媛???곗씠?곌? ?앹꽦?섏뿀?듬땲?? ?곗씠??遺꾩꽍 ??쓣 ?뺤씤??蹂댁꽭??');
                setActiveTab('analyze');
              }}>
                30???곗씠???앹꽦?섍린
              </button>
              <button className="clear-demo-btn" onClick={() => {
                if (confirm('紐⑤뱺 ?곕え ?곗씠?곕? ??젣?섏떆寃좎뒿?덇퉴? (?ㅼ젣 湲곕줉? ?좎??⑸땲??')) {
                  clearDemoData();
                  alert('?곕え ?곗씠?곌? ??젣?섏뿀?듬땲??');
                }
              }}>
                ?곕え ?곗씠?곕쭔 ??젣?섍린
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-section">
            <div className="settings-card">
              <div className="settings-item">
                <h3>?숋툘 ???ㅼ젙</h3>
                <p className="description">?뵕 援ш? ?쒗듃 ?곕룞 (?숆린??</p>
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
                    ?뵕 ?곌껐 ?뚯뒪??                  </button>
                </div>
                {syncUrl ? (
                  <div className="sync-status-info">
                    ??二쇱냼媛 ?낅젰?섏뿀?듬땲??
                  </div>
                ) : (
                  <div className="sync-status-info" style={{ color: '#e74c3c' }}>
                    ?좑툘 二쇱냼媛 ?낅젰?섏? ?딆븯?듬땲?? ??移몄뿉 援ш? ?쒗듃 二쇱냼瑜??ｌ뼱二쇱꽭??
                  </div>
                )}
              </div>

              <div className="settings-item">
                <h3>?뱧 留ㅼ옣 ?꾩튂 ?ㅼ젙 (?몄쿇 ?쒓뎄 媛?뺣룞)</h3>
                <p className="description">?먮룞 ?좎뵪瑜?遺덈윭???꾩튂???꾨룄? 寃쎈룄?낅땲??</p>
                <div className="location-input-group">
                  <div className="coord-input">
                    <label>?꾨룄(Latitude)</label>
                    <input
                      type="number"
                      value={lat}
                      onChange={(e) => setLat(Number(e.target.value))}
                      step="0.001"
                    />
                  </div>
                  <div className="coord-input">
                    <label>寃쎈룄(Longitude)</label>
                    <input
                      type="number"
                      value={lng}
                      onChange={(e) => setLng(Number(e.target.value))}
                      step="0.001"
                    />
                  </div>
                </div>
                <p className="help-text" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '5px' }}>
                  ?뮕 ?몄쿇 ?쒓뎄 媛?뺣룞 洹쇱쿂濡?湲곕낯 ?ㅼ젙?섏뼱 ?덉뒿?덈떎.
                </p>
              </div>

              <div className="settings-item">
                <h3>?벀 ?좎쭨 ?곗씠???대룞</h3>
                <p className="description">?섎せ???좎쭨????λ맂 ?곗씠?곕? ?щ컮瑜??좎쭨濡???퉩?덈떎.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '0.9rem' }}>?대룞???좎쭨</label>
                    <input type="date" value={moveFrom} onChange={e => setMoveFrom(e.target.value)} />
                  </div>
                  <span style={{ fontSize: '1.2rem' }}>??/span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '0.9rem' }}>??만 ?좎쭨</label>
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
                    ?벀 ?대룞?섍린
                  </button>
                </div>
                <p className="help-text" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '8px' }}>
                  ?뮕 ?대룞 ??援ш? ?쒗듃?먮룄 ?먮룞 諛섏쁺?⑸땲??
                </p>
              </div>

              <div className="settings-item">
                <h3>?뿊截??좎쭨 ?곗씠????젣</h3>
                <p className="description">?섎せ ??λ맂 ?좎쭨???곗씠?곕? ??젣?⑸땲??</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '0.9rem' }}>??젣???좎쭨</label>
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
                    ?뿊截???젣?섍린
                  </button>
                </div>
                <p className="help-text" style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '8px' }}>
                  ?좑툘 ??젣 ??蹂듦뎄?????놁뒿?덈떎. ??湲곌린 + 援ш? ?쒗듃?먯꽌 紐⑤몢 ??젣?⑸땲??
                </p>
              </div>

              <section className="settings-item help">
                <h3>???ㅼ젙 諛⑸쾿 ?꾩?留?/h3>
                <ol>
                  <li>援ш? ?쒗듃瑜??덈줈 ?섎굹 留뚮벊?덈떎.</li>
                  <li><strong>[?뺤옣 ?꾨줈洹몃옩] &gt; [Apps Script]</strong>瑜??대┃?⑸땲??</li>
                  <li>?뚯씪???쒓났??<code>google_sheets_bridge.js</code> 肄붾뱶瑜?遺숈뿬?ｌ뒿?덈떎.</li>
                  <li><strong>[諛고룷] &gt; [??諛고룷]</strong> (?좏삎: ???? ?≪꽭??沅뚰븳: 紐⑤뱺 ?ъ슜??瑜??ㅽ뻾?⑸땲??</li>
                  <li>?꾨즺 ???섏삤??<strong>????URL</strong>????移몄뿉 遺숈뿬?ｌ쑝硫???</li>
                </ol>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="footer no-print">
        <p>짤 2026 Bread Production App. All records are saved locally.</p>
      </footer>

      {/* Print-only layout header */}
      <div className="print-header only-print">
        <h1>?앹궛 吏?쒖꽌 ({currentDate})</h1>
        <div className="print-weather">
          ?좎뵪: {(() => {
            const today = sheet.weather.find(w => w.label === '?뱀씪');
            if (!today?.weather) return '誘멸린濡?;
            let weatherStr = WEATHER_ICONS[today.weather];
            if (today.temp !== undefined) weatherStr += ` ${Math.round(today.temp)}째C`;
            if (today.wind !== undefined) weatherStr += ` / ?띿냽 ${today.wind.toFixed(1)}m/s`;
            return weatherStr;
          })()}
        </div>
      </div>
    </div >
  );
};

export default App;
