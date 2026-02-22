import { format, subDays } from 'date-fns';

export interface BreadType {
  id: string;
  name: string;
  baseProduction: number;
}

export interface BreadRecord {
  breadId: string;
  carriedOver: number; // 전일 재고
  produced: number;    // 당일 생산
  disposed: number;    // 폐기량
  sold: number;        // 판매량
  remaining: number;   // 당일 잔고 (내일로 이월)
  soldOutTime: string | null;
}

export interface DailyRecord {
  date: string;
  weather: {
    temp: number;
    condition: string;
    icon: string;
  } | null;
  breadRecords: Record<string, BreadRecord>;
  notes: string;
}

export const BREAD_TYPES: BreadType[] = [
  { name: "소보로빵", baseProduction: 8 },
  { name: "초코소라빵", baseProduction: 8 },
  { name: "소시지빵빵", baseProduction: 3 },
  { name: "낙엽소세지", baseProduction: 10 },
  { name: "고소한후랑크", baseProduction: 2 },
  { name: "미니햄치즈롤", baseProduction: 4 },
  { name: "핫도그패스트", baseProduction: 4 },
  { name: "갈릭퐁당(소)", baseProduction: 2 },
  { name: "후레쉬샌드", baseProduction: 4 },
  { name: "착한통밀빵", baseProduction: 2 },
  { name: "고단백하루", baseProduction: 2 },
  { name: "겹겹이연유", baseProduction: 5 },
  { name: "바통(5개입)", baseProduction: 3 },
  { name: "피스타치오", baseProduction: 3 },
  { name: "마담얼그레이", baseProduction: 4 },
  { name: "맘모스", baseProduction: 4 },
  { name: "소금버터롤", baseProduction: 8 },
  { name: "연유퐁당(소)", baseProduction: 2 },
  { name: "카페모카(소)", baseProduction: 6 },
  { name: "크림치즈월넛", baseProduction: 4 },
  { name: "딸기잼맘모스(소)", baseProduction: 2 },
  { name: "사라다", baseProduction: 4 },
  { name: "카스테라우", baseProduction: 4 },
  { name: "32겹", baseProduction: 4 },
  { name: "리본파이", baseProduction: 2 },
  { name: "쌀베이글", baseProduction: 4 },
  { name: "올리브베이", baseProduction: 3 },
  { name: "뺑스위스", baseProduction: 2 },
  { name: "쿠키번", baseProduction: 2 },
  { name: "누룽지", baseProduction: 2 },
  { name: "초초모스(대)", baseProduction: 2 },
  { name: "진한우유식빵", baseProduction: 4 },
  { name: "옥수수식빵", baseProduction: 2 },
  { name: "밤식빵(대)", baseProduction: 2 },
  { name: "바게트", baseProduction: 2 },
  { name: "호두연유바게트", baseProduction: 2 },
  { name: "딸기피스타치오", baseProduction: 4 },
  { name: "딸기소보로", baseProduction: 4 },
  { name: "마블", baseProduction: 5 },
  { name: "단팥빵", baseProduction: 9 },
  { name: "슈크림빵", baseProduction: 4 },
  { name: "완두앙금빵", baseProduction: 3 },
  { name: "순우유롤", baseProduction: 2 },
  { name: "오르모닝롤", baseProduction: 2 },
  { name: "까까웨뜨", baseProduction: 3 },
  { name: "후레쉬크림빵", baseProduction: 4 },
  { name: "카라멜애플파이", baseProduction: 4 },
  { name: "진한우유크림", baseProduction: 4 },
  { name: "오리지널커피번", baseProduction: 4 },
  { name: "치즈빵앗간(3개)", baseProduction: 3 },
  { name: "깨찰빵", baseProduction: 4 },
  { name: "유자파이", baseProduction: 2 },
  { name: "고구마소보로", baseProduction: 2 },
  { name: "단팥소보로", baseProduction: 2 },
  { name: "햄야채롤", baseProduction: 2 },
  { name: "판크라상", baseProduction: 1 },
  { name: "김치고로케", baseProduction: 3 },
  { name: "바베큐고로케", baseProduction: 3 },
  { name: "정통고로케", baseProduction: 3 },
  { name: "그때그도너츠", baseProduction: 2 },
  { name: "쫄깃한찹쌀", baseProduction: 4 },
  { name: "옛날꽈배기", baseProduction: 4 },
  { name: "츄러스꽈배기", baseProduction: 2 },
  { name: "딸기마카롱", baseProduction: 1 },
  { name: "초코마카롱", baseProduction: 2 },
  { name: "크로크무슈", baseProduction: 5 },
  { name: "피자토스트", baseProduction: 5 },
  { name: "슈거글레이즈", baseProduction: 4 }
].map((item, index) => ({
  id: `bread-${index}`,
  ...item
}));

const WEATHER_CONDITIONS = [
  { condition: '맑음', icon: '☀️' },
  { condition: '흐림', icon: '☁️' },
  { condition: '비', icon: '🌧️' },
  { condition: '눈', icon: '❄️' },
  { condition: '안개', icon: '🌫️' },
];

export const generateMockData = (): DailyRecord[] => {
  const records: DailyRecord[] = [];
  const today = new Date();
  
  // Track inventory across days
  let previousDayInventory: Record<string, number> = {};
  BREAD_TYPES.forEach(b => previousDayInventory[b.id] = 0);

  for (let i = 29; i >= 0; i--) {
    const date = subDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const breadRecords: Record<string, BreadRecord> = {};
    
    BREAD_TYPES.forEach(bread => {
      const carriedOver = previousDayInventory[bread.id] || 0;
      
      // Decision: Dispose old stock? 
      // If carriedOver exists, 50% chance to dispose some if it's not fresh
      let disposed = 0;
      if (carriedOver > 0 && Math.random() > 0.5) {
        disposed = Math.min(carriedOver, Math.floor(Math.random() * 2) + 1);
      }

      const availableAfterDisposal = carriedOver - disposed;
      
      // Decision: Produce today?
      // If available stock is high, skip or reduce production
      let produced = 0;
      if (availableAfterDisposal < bread.baseProduction / 2) {
        produced = bread.baseProduction;
      } else if (availableAfterDisposal < bread.baseProduction) {
        produced = Math.max(0, bread.baseProduction - availableAfterDisposal);
      }

      const totalAvailable = availableAfterDisposal + produced;
      
      // Sales simulation
      // Demand fluctuates around baseProduction
      const demand = Math.floor(bread.baseProduction * (0.7 + Math.random() * 0.6));
      const sold = Math.min(totalAvailable, demand);
      const remaining = totalAvailable - sold;
      
      let soldOutTime: string | null = null;
      if (remaining === 0 && totalAvailable > 0) {
        const hour = Math.floor(Math.random() * 4) + 15; // 15:00 ~ 19:00
        const minute = Math.floor(Math.random() * 60);
        soldOutTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }

      breadRecords[bread.id] = {
        breadId: bread.id,
        carriedOver,
        produced,
        disposed,
        sold,
        remaining,
        soldOutTime,
      };

      // Update for next day
      previousDayInventory[bread.id] = remaining;
    });

    const weatherIdx = Math.floor(Math.random() * WEATHER_CONDITIONS.length);
    records.push({
      date: dateStr,
      weather: {
        temp: Math.floor(Math.random() * 15) + 5,
        ...WEATHER_CONDITIONS[weatherIdx]
      },
      breadRecords,
      notes: '정상 영업',
    });
  }

  return records;
};
