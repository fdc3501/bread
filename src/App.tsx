import React, { useState, useMemo, useEffect } from 'react';
import { useSheet } from './hooks/useSheet';
import { BREAD_LIST } from './data/breads';
import type { Weather } from './types';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { Sparkline } from './components/Sparkline';
import './App.css';

const WEATHER_ICONS: Record<Weather, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  'partly-cloudy': '⛅'
};

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'edit' | 'analyze' | 'demo' | 'settings'>('edit');
  const [syncUrl, setSyncUrl] = useState(() => localStorage.getItem('google_sheets_url') || '');

  const {
    sheet, savedAt, isDirty, isSyncing, syncMessage,
    saveSheet, updateWeather, updateBreadRecord, updateMemo, loadDate,
    getAllHistory, generateDummyData, clearDemoData
  } = useSheet(currentDate, syncUrl);

  const allHistory = useMemo(() => getAllHistory(), [sheet]);
  const history = useMemo(() => activeTab === 'analyze' ? allHistory : [], [activeTab, allHistory]);

  useEffect(() => {
    localStorage.setItem('google_sheets_url', syncUrl);
  }, [syncUrl]);

  const getSparklineData = (breadId: string) => {
    const last7Days = [];
    const baseDate = new Date(currentDate);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry = allHistory.find(h => h.date === dateStr);
      const bData = entry?.breads[breadId];
      const weather = entry?.weather?.[0]?.weather || undefined;
      last7Days.push({
        prod: Number(bData?.produceQty) || 0,
        disp: Number(bData?.disposal) || 0,
        rem: Number(bData?.remain) || 0,
        date: dateStr,
        weather,
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

  const handleTabChange = (tab: 'edit' | 'analyze' | 'demo' | 'settings') => {
    if (isDirty && !confirm('저장하지 않은 변경사항이 있습니다. 계속하시겠습니까?')) return;
    setActiveTab(tab);
  };

  const renderTable = (group: 'A' | 'B') => {
    const items = BREAD_LIST.filter(item => item.group === group);

    return (
      <div className="table-container">
        <table className="bread-table">
          <thead>
            <tr>
              <th>빵 이름</th>
              <th>잔량</th>
              <th>폐기</th>
              <th className="no-print">추세(7일)</th>
              <th>생산</th>
              <th>생산수량</th>
              <th>품절시간</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const record = sheet.breads[item.id];
              const isQuantityDisabled = item.defaultQty === null;

              return (
                <tr key={item.id} className={!record.produce ? 'disabled-row' : ''}>
                  <td className="name-cell">
                    <div className="bread-name">{item.name}</div>
                    {item.note && <div className="bread-note">{item.note}</div>}
                  </td>
                  <td>
                    <input
                      type="number"
                      value={record.remain}
                      onChange={(e) => updateBreadRecord(item.id, { remain: e.target.value })}
                      placeholder="-"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={record.disposal}
                      onChange={(e) => updateBreadRecord(item.id, { disposal: e.target.value })}
                    />
                  </td>
                  <td className="no-print center">
                    <Sparkline data={getSparklineData(item.id)} />
                  </td>
                  <td className="center">
                    <button
                      className={`toggle-btn ${record.produce ? 'active' : ''}`}
                      onClick={() => updateBreadRecord(item.id, { produce: !record.produce })}
                    >
                      {record.produce ? '✅' : '❌'}
                    </button>
                  </td>
                  <td>
                    {!isQuantityDisabled ? (
                      <input
                        type="number"
                        value={record.produceQty}
                        onChange={(e) => updateBreadRecord(item.id, { produceQty: e.target.value })}
                        disabled={!record.produce}
                      />
                    ) : (
                      <span className="no-qty">-</span>
                    )}
                  </td>
                  <td className="sold-out-cell">
                    <input
                      type="time"
                      value={record.soldOutTime || ''}
                      onChange={(e) => updateBreadRecord(item.id, { soldOutTime: e.target.value })}
                      placeholder="--:--"
                    />
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

          <button className="print-btn" onClick={() => window.print()}>🖨️ 인쇄하기</button>
        </div>
      </header>

      <section className="weather-section">
        <div className="weather-grid">
          {sheet.weather.map((w: any, i: number) => (
            <div key={w.date} className={`weather-card ${w.label === '당일' ? 'today' : ''}`}>
              <div className="weather-label">{w.label}</div>
              <div className="weather-date">{w.date.slice(5)}</div>
              <div className="weather-select">
                {(Object.keys(WEATHER_ICONS) as Weather[]).map(type => (
                  <button
                    key={type}
                    className={`weather-icon-btn ${w.weather === type ? 'active' : ''}`}
                    onClick={() => updateWeather(i, type)}
                    title={type}
                  >
                    {WEATHER_ICONS[type]}
                  </button>
                ))}
              </div>
            </div>
          ))}
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
              />
            </section>
          </>
        ) : activeTab === 'analyze' ? (
          <AnalysisDashboard history={history} />
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
              <h2>⚙️ 앱 설정</h2>
              <section className="settings-item">
                <h3>🔗 구글 시트 연동 (동기화)</h3>
                <p>PC와 태블릿 간에 데이터를 공유하려면 구글 앱스 스크립트 URL을 입력하세요.</p>
                <div className="sync-input-group">
                  <input
                    type="text"
                    value={syncUrl}
                    onChange={(e) => setSyncUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                </div>
                {syncUrl && (
                  <div className="sync-status-info">
                    ✅ 주소가 설정되었습니다. [저장하기] 버튼 클릭 시 구글 시트에도 함께 저장됩니다.
                  </div>
                )}
              </section>

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
          날씨: {sheet.weather.find(w => w.label === '당일')?.weather ? WEATHER_ICONS[sheet.weather.find(w => w.label === '당일')!.weather!] : '미기록'}
        </div>
      </div>
    </div>
  );
};

export default App;
