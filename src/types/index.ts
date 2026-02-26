export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'partly-cloudy';

export type BreadGroup = 'A' | 'B' | 'Special';

export interface BreadItem {
  id: string;
  name: string;
  group: BreadGroup;
  defaultQty: number | null; // null means no default quantity (e.g. only name and status)
  note?: string;
}

export interface BreadRecord {
  breadId: string;
  remain: number | string;
  disposal: number | string;
  produce: boolean;
  produceQty: number | string;
  soldOutTime: string;
}

export interface WeatherRecord {
  date: string; // YYYY-MM-DD
  label: string; // 전전날, 전날, 당일, 다음날, 다다음날, 다다다음날
  weather: Weather | null;
  temp?: number;
  wind?: number;
}

export interface DailySheet {
  date: string; // YYYY-MM-DD
  weather: WeatherRecord[];
  breads: Record<string, BreadRecord>;
  memo: string;
  isDemo?: boolean; // true if this is demo/simulator data
  status?: 'draft' | 'finalized';
  customBreads?: BreadItem[]; // 사용자가 추가한 커스텀 빵 목록 — 기기 간 동기화용
}
