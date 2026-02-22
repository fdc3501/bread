/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ComposedChart
} from 'recharts';
import { 
  Calendar, 
  TrendingUp, 
  AlertCircle, 
  Clock, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  BarChart3,
  List,
  Trash2,
  CheckCircle2,
  Info,
  Cloud,
  Sun,
  CloudRain,
  Snowflake,
  Wind,
  Search,
  ArrowRight,
  History,
  Package,
  ShoppingCart,
  Zap,
  ClipboardList,
  LayoutDashboard,
  Download
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { generateMockData, BREAD_TYPES, DailyRecord, BreadType, BreadRecord } from './mockData';

const COLORS = ['#F27D26', '#141414', '#E4E3E0', '#8E9299', '#5A5A40'];

export default function App() {
  const [records, setRecords] = useState<DailyRecord[]>(() => generateMockData());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'add' | 'plan'>('dashboard');
  const [selectedBreadId, setSelectedBreadId] = useState<string>(BREAD_TYPES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [weatherForecast, setWeatherForecast] = useState<{date: string, temp: number, condition: string, icon: string}[]>([]);
  
  // Closing mode state
  const [closingData, setClosingData] = useState<Record<string, {
    disposed: number;
    remaining: number;
    willProduce: boolean;
    soldOutTime: string;
  }>>(() => {
    const initial: any = {};
    BREAD_TYPES.forEach(b => {
      initial[b.id] = { disposed: 0, remaining: 0, willProduce: true, soldOutTime: '' };
    });
    return initial;
  });

  // Fetch 5-day weather window (2 days past, today, 2 days future)
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&daily=weathercode,temperature_2m_max&timezone=Asia%2FSeoul&past_days=2&forecast_days=3');
        const data = await res.json();
        
        const forecast = data.daily.time.map((time: string, i: number) => {
          const code = data.daily.weathercode[i];
          let condition = '맑음';
          let icon = '☀️';
          if (code >= 1 && code <= 3) { condition = '흐림'; icon = '☁️'; }
          else if (code >= 51 && code <= 67) { condition = '비'; icon = '🌧️'; }
          else if (code >= 71 && code <= 77) { condition = '눈'; icon = '❄️'; }
          
          return {
            date: time,
            temp: Math.round(data.daily.temperature_2m_max[i]),
            condition,
            icon
          };
        });
        
        setWeatherForecast(forecast);
      } catch (e) {
        console.error('Weather fetch failed', e);
      }
    };
    fetchWeather();
  }, []);

  const selectedBread = useMemo(() => 
    BREAD_TYPES.find(b => b.id === selectedBreadId) || BREAD_TYPES[0]
  , [selectedBreadId]);

  // Statistics for selected bread
  const stats = useMemo(() => {
    const breadRecords = records
      .map(r => r.breadRecords[selectedBreadId])
      .filter(Boolean);

    const totalProduced = breadRecords.reduce((acc, r) => acc + r.produced, 0);
    const totalDisposed = breadRecords.reduce((acc, r) => acc + r.disposed, 0);
    const totalSold = breadRecords.reduce((acc, r) => acc + r.sold, 0);
    const soldOutDays = breadRecords.filter(r => r.remaining === 0).length;
    
    const sellOutTimes = breadRecords
      .filter(r => r.soldOutTime)
      .map(r => {
        const [h, m] = r.soldOutTime!.split(':').map(Number);
        return h * 60 + m;
      });
    
    const avgSellOutMinutes = sellOutTimes.length > 0 
      ? sellOutTimes.reduce((a, b) => a + b, 0) / sellOutTimes.length 
      : 0;
    
    const avgH = Math.floor(avgSellOutMinutes / 60);
    const avgM = Math.round(avgSellOutMinutes % 60);

    const lastRecord = records[records.length - 1]?.breadRecords[selectedBreadId];
    const recommendedProduction = lastRecord 
      ? Math.max(0, selectedBread.baseProduction - lastRecord.remaining)
      : selectedBread.baseProduction;

    return {
      totalProduced,
      totalDisposed,
      totalSold,
      wasteRate: totalProduced > 0 ? ((totalDisposed / (totalProduced + breadRecords[0]?.carriedOver || 0)) * 100).toFixed(1) : '0',
      soldOutRate: breadRecords.length > 0 ? ((soldOutDays / breadRecords.length) * 100).toFixed(1) : '0',
      avgSellOutTime: `${avgH}:${avgM.toString().padStart(2, '0')}`,
      currentStock: lastRecord?.remaining || 0,
      recommendedProduction
    };
  }, [records, selectedBreadId, selectedBread]);

  // Chart Data for selected bread
  const chartData = useMemo(() => {
    return records.map(r => {
      const breadRec = r.breadRecords[selectedBreadId];
      return {
        name: format(parseISO(r.date), 'MM/dd'),
        이월: breadRec?.carriedOver || 0,
        생산: breadRec?.produced || 0,
        폐기: breadRec?.disposed || 0,
        판매: breadRec?.sold || 0,
        잔고: breadRec?.remaining || 0,
      };
    });
  }, [records, selectedBreadId]);

  const filteredBreads = useMemo(() => 
    BREAD_TYPES.filter(b => b.name.includes(searchQuery))
  , [searchQuery]);

  const handleAddRecord = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    
    const breadRecords: Record<string, BreadRecord> = {};
    
    BREAD_TYPES.forEach(b => {
      const lastRec = records[records.length - 1]?.breadRecords[b.id];
      const carriedOver = lastRec?.remaining || 0;
      const data = closingData[b.id];

      const produced = data.willProduce ? b.baseProduction : 0;
      const disposed = data.disposed;
      const remaining = data.remaining;
      
      // Calculate sold: (CarriedOver + Produced - Disposed) - Remaining
      const totalAvailable = carriedOver + produced - disposed;
      const sold = Math.max(0, totalAvailable - remaining);

      breadRecords[b.id] = {
        breadId: b.id,
        carriedOver,
        produced,
        disposed,
        sold,
        remaining,
        soldOutTime: data.soldOutTime || null
      };
    });

    const newRecord: DailyRecord = {
      date,
      weather: weatherForecast.find(w => w.date === date) || null,
      breadRecords,
      notes: (formData.get('notes') as string) || '마감 기록 완료',
    };

    setRecords(prev => {
      const filtered = prev.filter(r => r.date !== newRecord.date);
      return [...filtered, newRecord].sort((a, b) => a.date.localeCompare(b.date));
    });
    setActiveTab('list');
  };

  const downloadCSV = () => {
    const headers = ['Date', 'Bread', 'Carried Over', 'Produced', 'Disposed', 'Sold', 'Remaining', 'Sold Out Time', 'Weather', 'Temp', 'Notes'];
    const rows = records.flatMap(record => 
      BREAD_TYPES.map(bread => {
        const br = record.breadRecords[bread.id];
        return [
          record.date,
          bread.name,
          br?.carriedOver || 0,
          br?.produced || 0,
          br?.disposed || 0,
          br?.sold || 0,
          br?.remaining || 0,
          br?.soldOutTime || '-',
          record.weather?.condition || '-',
          record.weather?.temp || '-',
          record.notes.replace(/,/g, ';')
        ].join(',');
      })
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `bakery_records_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight italic font-serif">BAKERY FLOW</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-60">Inventory & Production Guide</p>
          </div>
        </div>

        {/* 5-Day Weather Window */}
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 max-w-full custom-scrollbar">
          {weatherForecast.map((w, i) => {
            const isToday = i === 2; // past_days=2 means index 2 is today
            return (
              <div 
                key={w.date} 
                className={`flex flex-col items-center min-w-[70px] px-2 py-1 border ${
                  isToday ? 'bg-[#141414] text-white border-[#141414]' : 'bg-[#E4E3E0]/30 border-transparent'
                }`}
              >
                <span className="text-[8px] uppercase font-bold opacity-60">
                  {isToday ? 'Today' : format(parseISO(w.date), 'EEE', { locale: ko })}
                </span>
                <span className="text-lg my-0.5">{w.icon}</span>
                <span className="text-[10px] font-bold">{w.temp}°C</span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 shrink-0">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`p-2 rounded-full transition-colors ${activeTab === 'dashboard' ? 'bg-[#141414] text-white' : 'hover:bg-black/5'}`}
            title="Dashboard"
          >
            <LayoutDashboard size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('plan')}
            className={`p-2 rounded-full transition-colors ${activeTab === 'plan' ? 'bg-[#141414] text-white' : 'hover:bg-black/5'}`}
            title="Production Plan"
          >
            <ClipboardList size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('list')}
            className={`p-2 rounded-full transition-colors ${activeTab === 'list' ? 'bg-[#141414] text-white' : 'hover:bg-black/5'}`}
            title="History"
          >
            <History size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('add')}
            className={`p-2 rounded-full transition-colors ${activeTab === 'add' ? 'bg-[#F27D26] text-white' : 'hover:bg-[#F27D26]/10 text-[#F27D26]'}`}
            title="Daily Closing"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar - Bread Selection */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-[#141414] p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={14} />
              <input 
                type="text" 
                placeholder="빵 이름 검색..." 
                className="w-full pl-9 pr-4 py-2 bg-[#E4E3E0]/30 border-none text-xs focus:ring-1 focus:ring-[#F27D26] outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="h-[calc(100vh-250px)] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
              {filteredBreads.map(bread => (
                <button
                  key={bread.id}
                  onClick={() => setSelectedBreadId(bread.id)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors border ${
                    selectedBreadId === bread.id 
                      ? 'bg-[#141414] text-white border-[#141414]' 
                      : 'hover:bg-[#E4E3E0]/50 border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span>{bread.name}</span>
                    <span className={`text-[10px] opacity-50 ${selectedBreadId === bread.id ? 'text-white' : ''}`}>
                      {records[records.length-1]?.breadRecords[bread.id]?.remaining || 0}개 잔고
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="lg:col-span-9 space-y-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Bread Header */}
              <div className="bg-white p-6 border border-[#141414] flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-serif italic">{selectedBread.name}</h2>
                  <p className="text-xs opacity-50 uppercase tracking-widest mt-1">
                    기본 생산 목표: {selectedBread.baseProduction}개 / 일
                  </p>
                </div>
                <div className="text-right">
                  <div className="bg-[#F27D26] text-white px-4 py-2 inline-block">
                    <p className="text-[10px] uppercase tracking-widest opacity-80">내일 권장 생산량</p>
                    <p className="text-2xl font-bold">{stats.recommendedProduction}개</p>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                  <div className="flex items-center gap-2 mb-1">
                    <History size={14} className="opacity-40" />
                    <p className="text-[10px] uppercase tracking-widest opacity-50">현재 재고</p>
                  </div>
                  <p className="text-3xl font-bold">{stats.currentStock}</p>
                </div>
                <div className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart size={14} className="opacity-40" />
                    <p className="text-[10px] uppercase tracking-widest opacity-50">총 판매</p>
                  </div>
                  <p className="text-3xl font-bold">{stats.totalSold}</p>
                </div>
                <div className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                  <div className="flex items-center gap-2 mb-1">
                    <Trash2 size={14} className="opacity-40 text-[#F27D26]" />
                    <p className="text-[10px] uppercase tracking-widest opacity-50">폐기율</p>
                  </div>
                  <p className="text-3xl font-bold text-[#F27D26]">{stats.wasteRate}%</p>
                </div>
                <div className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className="opacity-40 text-yellow-500" />
                    <p className="text-[10px] uppercase tracking-widest opacity-50">완판율</p>
                  </div>
                  <p className="text-3xl font-bold">{stats.soldOutRate}%</p>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Sales & Stock Trend */}
                <div className="bg-white p-6 border border-[#141414]">
                  <h3 className="text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                    <ShoppingCart size={16} /> 판매 및 잔고 추이
                  </h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #141414', borderRadius: '0px' }} />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Line type="monotone" dataKey="판매" stroke="#F27D26" strokeWidth={3} dot={{ r: 4, fill: '#F27D26' }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="잔고" stroke="#141414" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Production & Waste Analysis */}
                <div className="bg-white p-6 border border-[#141414]">
                  <h3 className="text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Trash2 size={16} /> 생산 및 폐기 분석
                  </h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #141414', borderRadius: '0px' }} />
                        <Legend verticalAlign="top" height={36} iconType="rect" />
                        <Bar dataKey="생산" fill="#141414" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="폐기" fill="#F27D26" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Total Available Stock Composition */}
                <div className="bg-white p-6 border border-[#141414] lg:col-span-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Package size={16} /> 총 가용 재고 구성 (이월 + 생산)
                  </h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#141414" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#141414" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #141414', borderRadius: '0px' }} />
                        <Legend verticalAlign="top" height={36} />
                        <Area type="monotone" dataKey="이월" stackId="1" stroke="#8E9299" fill="#E4E3E0" />
                        <Area type="monotone" dataKey="생산" stackId="1" stroke="#141414" fill="url(#colorTotal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Insight Card */}
              <div className="bg-[#141414] text-white p-8 relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-3xl font-serif italic mb-4">Production Intelligence</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-1 bg-[#F27D26] rounded-full">
                          <CheckCircle2 size={14} className="text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">재고 기반 생산: {stats.recommendedProduction}개 권장</p>
                          <p className="text-xs opacity-60">현재 잔고가 {stats.currentStock}개이므로, 내일은 {stats.recommendedProduction}개만 생산하여 신선도를 유지하세요.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-1 bg-[#F27D26] rounded-full">
                          <CheckCircle2 size={14} className="text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">폐기 검토 알림</p>
                          <p className="text-xs opacity-60">이월 재고가 2일 이상 지속될 경우 품질 저하가 우려됩니다. 즉시 폐기를 검토하세요.</p>
                        </div>
                      </div>
                    </div>
                    <div className="border-l border-white/20 pl-8 hidden md:block">
                      <p className="text-xs uppercase tracking-widest opacity-40 mb-2">Inventory Strategy</p>
                      <p className="text-sm leading-relaxed italic">
                        "잔고가 생산량의 50%를 초과하는 날이 3일 연속될 경우, 기본 생산 목표(Base Production) 자체를 하향 조정하는 것을 추천합니다."
                      </p>
                    </div>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#F27D26] blur-[100px] opacity-20 -mr-32 -mt-32"></div>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="bg-white border border-[#141414] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-6 border-b border-[#141414] flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-widest">상세 재고 기록 ({selectedBread.name})</h3>
                <button 
                  onClick={downloadCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white text-[10px] uppercase tracking-widest font-bold hover:bg-[#F27D26] transition-colors"
                >
                  <Download size={14} />
                  CSV 다운로드
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#E4E3E0]/30 text-[10px] uppercase tracking-widest">
                      <th className="p-4 border-b border-[#141414]">날짜</th>
                      <th className="p-4 border-b border-[#141414]">날씨</th>
                      <th className="p-4 border-b border-[#141414]">이월</th>
                      <th className="p-4 border-b border-[#141414]">생산</th>
                      <th className="p-4 border-b border-[#141414]">폐기</th>
                      <th className="p-4 border-b border-[#141414]">판매</th>
                      <th className="p-4 border-b border-[#141414]">잔고</th>
                      <th className="p-4 border-b border-[#141414]">비고</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {records.slice().reverse().map((record, idx) => {
                      const breadRec = record.breadRecords[selectedBreadId];
                      return (
                        <tr key={idx} className="hover:bg-[#E4E3E0]/20 transition-colors">
                          <td className="p-4 border-b border-[#141414]/10 font-mono">{record.date}</td>
                          <td className="p-4 border-b border-[#141414]/10">
                            {record.weather ? (
                              <div className="flex items-center gap-2">
                                <span>{record.weather.icon}</span>
                                <span className="text-[10px] opacity-60">{record.weather.temp}°</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-4 border-b border-[#141414]/10 opacity-40">{breadRec?.carriedOver || 0}</td>
                          <td className="p-4 border-b border-[#141414]/10 font-bold">{breadRec?.produced || 0}</td>
                          <td className={`p-4 border-b border-[#141414]/10 font-bold ${breadRec?.disposed > 0 ? 'text-[#F27D26]' : 'text-black/10'}`}>
                            {breadRec?.disposed || 0}
                          </td>
                          <td className="p-4 border-b border-[#141414]/10 text-green-600 font-bold">{breadRec?.sold || 0}</td>
                          <td className={`p-4 border-b border-[#141414]/10 font-bold ${breadRec?.remaining > 0 ? 'text-blue-600' : 'text-black/10'}`}>
                            {breadRec?.remaining || 0}
                          </td>
                          <td className="p-4 border-b border-[#141414]/10 text-xs opacity-60">{record.notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'plan' && (
            <div className="bg-white border border-[#141414] p-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex justify-between items-end mb-8 border-b-2 border-[#141414] pb-4">
                <div>
                  <h2 className="text-3xl font-serif italic mb-1">Production Plan</h2>
                  <p className="text-xs uppercase tracking-widest opacity-60">내일 생산 지시서 (기사용)</p>
                </div>
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => {
                      const planText = BREAD_TYPES
                        .filter(b => closingData[b.id].willProduce)
                        .map(b => `${b.name}: ${b.baseProduction}개`)
                        .join('\n');
                      const blob = new Blob([`내일 생산 지시서 (${format(new Date(), 'yyyy-MM-dd')})\n\n${planText}`], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `production_plan_${format(new Date(), 'yyyyMMdd')}.txt`;
                      link.click();
                    }}
                    className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-[10px] uppercase tracking-widest font-bold hover:bg-[#141414] hover:text-white transition-colors"
                  >
                    <Download size={14} />
                    지시서 다운로드
                  </button>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold opacity-40">내일 날씨 예상</p>
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-2xl">{weatherForecast[3]?.icon}</span>
                      <span className="text-lg font-bold">{weatherForecast[3]?.temp}°C</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {BREAD_TYPES.map(bread => {
                  const lastRecord = records[records.length - 1];
                  const breadRec = lastRecord?.breadRecords[bread.id];
                  // If the last record was just added, it might already contain the "tomorrow's production" info
                  // But our logic adds a record for TODAY. The "willProduce" decision in the closing form
                  // determines if we produced TODAY (in the mock logic) or if we WILL produce tomorrow.
                  // In the real app logic, the closing form records TODAY's results and decides TOMORROW's production.
                  
                  // Let's assume the most recent record's "notes" or a specific flag tells us about tomorrow.
                  // Actually, the closingData state holds the current decision.
                  const willProduce = closingData[bread.id].willProduce;

                  if (!willProduce) return null;

                  return (
                    <div key={bread.id} className="border border-[#141414] p-4 flex justify-between items-center bg-[#E4E3E0]/10">
                      <div>
                        <h4 className="font-bold text-lg">{bread.name}</h4>
                        <p className="text-[10px] opacity-50 uppercase">Default: {bread.baseProduction}</p>
                      </div>
                      <div className="text-3xl font-serif italic text-[#F27D26]">
                        {bread.baseProduction}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-12 p-6 border-2 border-dashed border-[#141414]/20 text-center">
                <p className="text-sm italic opacity-60">"오늘의 마감 데이터와 내일의 날씨를 바탕으로 생성된 생산 지시서입니다."</p>
              </div>
            </div>
          )}
          {activeTab === 'add' && (
            <div className="bg-white border border-[#141414] p-8 animate-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-8 border-b border-[#141414] pb-4">
                <h3 className="text-xl font-serif italic">Daily Closing (마감 기록)</h3>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] uppercase tracking-widest opacity-50">전체 {BREAD_TYPES.length}종 일괄 기록</span>
                </div>
              </div>

              <form onSubmit={handleAddRecord} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">날짜</label>
                    <input 
                      type="date" 
                      name="date" 
                      required 
                      defaultValue={format(new Date(), 'yyyy-MM-dd')}
                      className="w-full p-3 border border-[#141414] focus:outline-none focus:ring-2 focus:ring-[#F27D26] rounded-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">비고</label>
                    <input 
                      type="text"
                      name="notes" 
                      className="w-full p-3 border border-[#141414] focus:outline-none focus:ring-2 focus:ring-[#F27D26] rounded-none"
                      placeholder="특이사항 기록"
                    />
                  </div>
                </div>

                <div className="border border-[#141414] overflow-hidden">
                  <div className="bg-[#141414] text-white grid grid-cols-12 text-[10px] uppercase tracking-widest font-bold p-3">
                    <div className="col-span-3">품목명</div>
                    <div className="col-span-2 text-center">1. 폐기</div>
                    <div className="col-span-2 text-center">2. 잔고</div>
                    <div className="col-span-3 text-center">3. 내일 생산</div>
                    <div className="col-span-2 text-center">소진시간</div>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                    {BREAD_TYPES.map(bread => {
                      const lastRec = records[records.length - 1]?.breadRecords[bread.id];
                      const carriedOver = lastRec?.remaining || 0;
                      const data = closingData[bread.id];

                      return (
                        <div key={bread.id} className="grid grid-cols-12 items-center p-3 border-b border-[#141414]/10 hover:bg-[#E4E3E0]/20 transition-colors">
                          <div className="col-span-3">
                            <p className="text-xs font-bold">{bread.name}</p>
                            <p className="text-[9px] opacity-40">이월: {carriedOver} / 기본: {bread.baseProduction}</p>
                          </div>
                          <div className="col-span-2 px-2">
                            <input 
                              type="number" 
                              min="0"
                              value={data.disposed}
                              onChange={(e) => setClosingData(prev => ({
                                ...prev,
                                [bread.id]: { ...prev[bread.id], disposed: Number(e.target.value) }
                              }))}
                              className="w-full p-1 text-center border border-[#141414]/20 text-xs focus:ring-1 focus:ring-[#F27D26] outline-none"
                            />
                          </div>
                          <div className="col-span-2 px-2">
                            <input 
                              type="number" 
                              min="0"
                              value={data.remaining}
                              onChange={(e) => setClosingData(prev => ({
                                ...prev,
                                [bread.id]: { ...prev[bread.id], remaining: Number(e.target.value) }
                              }))}
                              className="w-full p-1 text-center border border-[#141414]/20 text-xs focus:ring-1 focus:ring-[#F27D26] outline-none"
                            />
                          </div>
                          <div className="col-span-3 flex justify-center items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setClosingData(prev => ({
                                ...prev,
                                [bread.id]: { ...prev[bread.id], willProduce: !prev[bread.id].willProduce }
                              }))}
                              className={`px-3 py-1 text-[10px] font-bold border transition-colors ${
                                data.willProduce 
                                  ? 'bg-[#141414] text-white border-[#141414]' 
                                  : 'bg-white text-[#141414] border-[#141414]/20'
                              }`}
                            >
                              {data.willProduce ? `생산 (${bread.baseProduction})` : '미생산'}
                            </button>
                          </div>
                          <div className="col-span-2 px-2">
                            <input 
                              type="time" 
                              value={data.soldOutTime}
                              onChange={(e) => setClosingData(prev => ({
                                ...prev,
                                [bread.id]: { ...prev[bread.id], soldOutTime: e.target.value }
                              }))}
                              className="w-full p-1 text-center border border-[#141414]/20 text-[10px] focus:ring-1 focus:ring-[#F27D26] outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <button 
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className="px-8 py-4 border border-[#141414] font-bold uppercase tracking-widest hover:bg-black/5 transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="px-12 py-4 bg-[#141414] text-white font-bold uppercase tracking-widest hover:bg-[#F27D26] transition-colors shadow-[4px_4px_0px_0px_rgba(242,125,38,1)]"
                  >
                    마감 기록 완료 및 저장
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-12 text-center border-t border-[#141414]/5 mt-12">
        <p className="text-[10px] uppercase tracking-widest opacity-30">
          &copy; 2026 Bakery Inventory Intelligence &bull; Freshness First
        </p>
      </footer>
    </div>
  );
}
