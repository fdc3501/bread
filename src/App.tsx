import React, { useState, useMemo, useEffect } from 'react';
import { useSheet } from './hooks/useSheet';
import { BREAD_LIST } from './data/breads';
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

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'edit' | 'analyze' | 'demo' | 'settings'>('edit');
  const [syncUrl, setSyncUrl] = useState(() => localStorage.getItem('google_sheets_url') || '');
  const [lat, setLat] = useState(() => Number(localStorage.getItem('latitude')) || 37.526);
  const [lng, setLng] = useState(() => Number(localStorage.getItem('longitude')) || 126.674);

  const {
    sheet, savedAt, isDirty, isSyncing, syncMessage,
    saveSheet, updateWeather, updateBreadRecord, updateMemo, loadDate,
    getAllHistory, generateDummyData, clearDemoData, testSync, finalizeSheet,
    refreshWeather
  } = useSheet(currentDate, syncUrl);

  const allHistory = useMemo(() => getAllHistory(), [sheet]);
  const history = useMemo(() => activeTab === 'analyze' ? allHistory : [], [activeTab, allHistory]);

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

  const copyToKakao = () => {
    const itemsToProduce = BREAD_LIST.filter(item => sheet.breads[item.id].produce);
    if (itemsToProduce.length === 0) return alert('생산할 품목이 없습니다.');

    const dateStr = new Date(currentDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    let text = `🍞 ${dateStr} 생산 지시서\n\n`;

    // Group items by A/B for better readability
    const groupA = itemsToProduce.filter(i => i.group === 'A');
    const groupB = itemsToProduce.filter(i => i.group === 'B');

    if (groupA.length > 0) {
      text += `[기본 빵류]\n`;
      groupA.forEach(item => {
        text += `- ${item.name}: ${sheet.breads[item.id].produceQty}개\n`;
      });
      text += '\n';
    }

    if (groupB.length > 0) {
      text += `[기타/고로케]\n`;
      groupB.forEach(item => {
        text += `- ${item.name}: ${sheet.breads[item.id].produceQty}개\n`;
      });
      text += '\n';
    }

    if (sheet.memo) {
      text += `📝 메모: ${sheet.memo}\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      alert('카톡용 텍스트가 복사되었습니다. 카카오톡에 붙여넣기 하세요!');
    }).catch(err => {
      console.error('Copy failed', err);
      alert('복사 실패. 브라우저 권한을 확인해 주세요.');
    });
  };

  const renderTable = (group: 'A' | 'B') => {
    const items = BREAD_LIST.filter(item => item.group === group);
    const hours = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 ~ 22:00

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
              <th>내일 생산수량 결정</th>
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
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={record.disposal}
                      onChange={(e) => updateBreadRecord(item.id, { disposal: e.target.value })}
                      placeholder="0"
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
                    <select
                      value={record.soldOutTime || ''}
                      onChange={(e) => updateBreadRecord(item.id, { soldOutTime: e.target.value })}
                      className="hour-select"
                    >
                      <option value="">-</option>
                      {hours.map(h => (
                        <option key={h} value={`${String(h).padStart(2, '0')}:00`}>
                          {h}시
                        </option>
                      ))}
                    </select>
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
                      type="number"
                      value={lat}
                      onChange={(e) => setLat(Number(e.target.value))}
                      step="0.001"
                    />
                  </div>
                  <div className="coord-input">
                    <label>경도(Longitude)</label>
                    <input
                      type="number"
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
    </div >
  );
};

export default App;
