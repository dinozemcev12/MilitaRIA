/* ============================================================
   data/worldGeoFeatures.ts — географические объекты и инфраструктура 2000 года
   Крупные города, порты, авиабазы, реки, горные хребты, пустыни и магистрали.
   ============================================================ */

export interface WorldCity {
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  isCapital?: boolean;
  isPort?: boolean;
  isAirbase?: boolean;
  importance: 1 | 2 | 3; // 3 = мегаполис/ключевой узел, 2 = крупный город, 1 = региональный
}

export interface RiverPath {
  name: string;
  points: [number, number][]; // [lat, lng]
}

export interface TerrainZone {
  name: string;
  type: 'mountain' | 'forest' | 'desert';
  lat: number;
  lng: number;
  rx: number; // радиус в градусах широты
  ry: number; // радиус в градусах долготы
  angle?: number;
}

export interface TransportCorridor {
  from: [number, number];
  to: [number, number];
  kind: 'rail' | 'highway';
}

export const WORLD_CITIES: WorldCity[] = [
  // Восточная Европа и Евразия
  { name: 'Киев', countryCode: 'UKR', lat: 50.45, lng: 30.52, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Харьков', countryCode: 'UKR', lat: 49.99, lng: 36.23, isAirbase: true, importance: 2 },
  { name: 'Одесса', countryCode: 'UKR', lat: 46.48, lng: 30.72, isPort: true, importance: 2 },
  { name: 'Львов', countryCode: 'UKR', lat: 49.84, lng: 24.03, importance: 2 },
  { name: 'Севастополь', countryCode: 'UKR', lat: 44.61, lng: 33.52, isPort: true, isAirbase: true, importance: 2 },

  { name: 'Москва', countryCode: 'RUS', lat: 55.75, lng: 37.62, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Санкт-Петербург', countryCode: 'RUS', lat: 59.93, lng: 30.31, isPort: true, importance: 3 },
  { name: 'Новороссийск', countryCode: 'RUS', lat: 44.72, lng: 37.77, isPort: true, importance: 2 },
  { name: 'Екатеринбург', countryCode: 'RUS', lat: 56.84, lng: 60.60, importance: 2 },
  { name: 'Новосибирск', countryCode: 'RUS', lat: 55.01, lng: 82.93, isAirbase: true, importance: 2 },
  { name: 'Владивосток', countryCode: 'RUS', lat: 43.11, lng: 131.88, isPort: true, isAirbase: true, importance: 2 },
  { name: 'Мурманск', countryCode: 'RUS', lat: 68.97, lng: 33.07, isPort: true, importance: 2 },

  // Европа
  { name: 'Варшава', countryCode: 'POL', lat: 52.23, lng: 21.01, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Гданьск', countryCode: 'POL', lat: 54.35, lng: 18.64, isPort: true, importance: 2 },
  { name: 'Берлин', countryCode: 'DEU', lat: 52.52, lng: 13.40, isCapital: true, importance: 3 },
  { name: 'Гамбург', countryCode: 'DEU', lat: 53.55, lng: 9.99, isPort: true, importance: 2 },
  { name: 'Мюнхен', countryCode: 'DEU', lat: 48.13, lng: 11.58, isAirbase: true, importance: 2 },
  { name: 'Париж', countryCode: 'FRA', lat: 48.85, lng: 2.35, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Марсель', countryCode: 'FRA', lat: 43.30, lng: 5.37, isPort: true, importance: 2 },
  { name: 'Лондон', countryCode: 'GBR', lat: 51.50, lng: -0.12, isCapital: true, isPort: true, importance: 3 },
  { name: 'Портсмут', countryCode: 'GBR', lat: 50.80, lng: -1.09, isPort: true, isAirbase: true, importance: 2 },
  { name: 'Рим', countryCode: 'ITA', lat: 41.90, lng: 12.49, isCapital: true, importance: 3 },
  { name: 'Мадрид', countryCode: 'ESP', lat: 40.41, lng: -3.70, isCapital: true, importance: 3 },

  // Ближний Восток
  { name: 'Анкара', countryCode: 'TUR', lat: 39.93, lng: 32.85, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Стамбул', countryCode: 'TUR', lat: 41.01, lng: 28.97, isPort: true, importance: 3 },
  { name: 'Багдад', countryCode: 'IRQ', lat: 33.31, lng: 44.36, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Тегеран', countryCode: 'IRN', lat: 35.69, lng: 51.39, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Бендер-Аббас', countryCode: 'IRN', lat: 27.18, lng: 56.27, isPort: true, importance: 2 },
  { name: 'Тель-Авив', countryCode: 'ISR', lat: 32.08, lng: 34.78, isPort: true, isAirbase: true, importance: 3 },
  { name: 'Эр-Рияд', countryCode: 'SAU', lat: 24.71, lng: 46.67, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Каир', countryCode: 'EGY', lat: 30.04, lng: 31.23, isCapital: true, importance: 3 },
  { name: 'Александрия', countryCode: 'EGY', lat: 31.20, lng: 29.92, isPort: true, importance: 2 },

  // Азия
  { name: 'Пекин', countryCode: 'CHN', lat: 39.90, lng: 116.40, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Шанхай', countryCode: 'CHN', lat: 31.23, lng: 121.47, isPort: true, importance: 3 },
  { name: 'Гуанчжоу', countryCode: 'CHN', lat: 23.13, lng: 113.26, isPort: true, importance: 2 },
  { name: 'Чэнду', countryCode: 'CHN', lat: 30.57, lng: 104.06, isAirbase: true, importance: 2 },
  { name: 'Токио', countryCode: 'JPN', lat: 35.68, lng: 139.76, isCapital: true, isPort: true, importance: 3 },
  { name: 'Йокосука', countryCode: 'JPN', lat: 35.28, lng: 139.67, isPort: true, isAirbase: true, importance: 2 },
  { name: 'Сеул', countryCode: 'KOR', lat: 37.56, lng: 126.97, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Пусан', countryCode: 'KOR', lat: 35.18, lng: 129.07, isPort: true, importance: 2 },
  { name: 'Пхеньян', countryCode: 'PRK', lat: 39.03, lng: 125.76, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Нью-Дели', countryCode: 'IND', lat: 28.61, lng: 77.21, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Мумбаи', countryCode: 'IND', lat: 19.07, lng: 72.87, isPort: true, importance: 3 },

  // Америка и Океания
  { name: 'Вашингтон', countryCode: 'USA', lat: 38.90, lng: -77.03, isCapital: true, isAirbase: true, importance: 3 },
  { name: 'Нью-Йорк', countryCode: 'USA', lat: 40.71, lng: -74.00, isPort: true, importance: 3 },
  { name: 'Норфолк', countryCode: 'USA', lat: 36.85, lng: -76.29, isPort: true, isAirbase: true, importance: 2 },
  { name: 'Сан-Диего', countryCode: 'USA', lat: 32.71, lng: -117.16, isPort: true, isAirbase: true, importance: 2 },
  { name: 'Чикаго', countryCode: 'USA', lat: 41.88, lng: -87.63, importance: 2 },
  { name: 'Оттава', countryCode: 'CAN', lat: 45.42, lng: -75.69, isCapital: true, importance: 3 },
  { name: 'Бразилиа', countryCode: 'BRA', lat: -15.79, lng: -47.88, isCapital: true, importance: 3 },
  { name: 'Рио-де-Жанейро', countryCode: 'BRA', lat: -22.90, lng: -43.17, isPort: true, importance: 2 },
  { name: 'Буэнос-Айрес', countryCode: 'ARG', lat: -34.60, lng: -58.38, isCapital: true, isPort: true, importance: 3 },
  { name: 'Канберра', countryCode: 'AUS', lat: -35.28, lng: 149.13, isCapital: true, importance: 3 },
  { name: 'Сидней', countryCode: 'AUS', lat: -33.86, lng: 151.20, isPort: true, isAirbase: true, importance: 2 },
  { name: 'Претория', countryCode: 'ZAF', lat: -25.74, lng: 28.22, isCapital: true, importance: 3 }
];

export const WORLD_RIVERS: RiverPath[] = [
  { name: 'Днепр', points: [[54.8, 32.0], [52.1, 30.6], [50.45, 30.52], [48.46, 35.04], [46.63, 32.61]] },
  { name: 'Волга', points: [[57.2, 32.5], [56.3, 44.0], [53.2, 50.1], [48.7, 44.5], [46.3, 48.0]] },
  { name: 'Дунай', points: [[48.1, 8.5], [48.2, 16.3], [47.5, 19.0], [44.8, 20.4], [45.2, 29.6]] },
  { name: 'Рейн', points: [[46.8, 9.5], [49.5, 8.4], [50.9, 6.9], [51.9, 4.5]] },
  { name: 'Нил', points: [[1.5, 32.5], [15.6, 32.5], [25.7, 32.6], [30.04, 31.23], [31.4, 30.4]] },
  { name: 'Евфрат', points: [[38.8, 39.2], [35.9, 39.0], [33.3, 43.8], [30.5, 47.8]] },
  { name: 'Янцзы', points: [[33.0, 96.0], [29.5, 106.5], [30.6, 114.3], [31.23, 121.47]] },
  { name: 'Хуанхэ', points: [[35.0, 100.0], [36.0, 103.8], [40.2, 110.0], [34.7, 113.6], [37.7, 119.1]] },
  { name: 'Ганг', points: [[30.1, 78.3], [25.4, 81.8], [25.6, 85.1], [22.6, 88.3]] },
  { name: 'Миссисипи', points: [[47.2, -95.2], [41.5, -90.5], [38.6, -90.2], [35.1, -90.0], [29.9, -90.0]] },
  { name: 'Амазонка', points: [[-4.4, -73.5], [-3.1, -60.0], [-2.4, -54.7], [-0.5, -49.5]] }
];

export const TERRAIN_ZONES: TerrainZone[] = [
  { name: 'Альпы', type: 'mountain', lat: 46.5, lng: 10.5, rx: 2.2, ry: 5.5, angle: 0.15 },
  { name: 'Карпаты', type: 'mountain', lat: 47.8, lng: 24.5, rx: 2.5, ry: 3.5, angle: -0.4 },
  { name: 'Кавказ', type: 'mountain', lat: 42.6, lng: 44.5, rx: 1.6, ry: 5.0, angle: -0.25 },
  { name: 'Урал', type: 'mountain', lat: 60.0, lng: 59.5, rx: 7.5, ry: 1.8, angle: 0.1 },
  { name: 'Гималаи', type: 'mountain', lat: 31.0, lng: 84.0, rx: 4.5, ry: 13.0, angle: -0.2 },
  { name: 'Скалистые горы', type: 'mountain', lat: 45.0, lng: -112.0, rx: 12.0, ry: 4.5, angle: -0.2 },
  { name: 'Анды', type: 'mountain', lat: -18.0, lng: -68.5, rx: 18.0, ry: 3.0, angle: 0.05 },

  { name: 'Тайга (Евразия)', type: 'forest', lat: 60.5, lng: 75.0, rx: 6.5, ry: 35.0 },
  { name: 'Полесье / Леса', type: 'forest', lat: 52.0, lng: 28.0, rx: 2.4, ry: 5.0 },
  { name: 'Амазония', type: 'forest', lat: -4.5, lng: -62.0, rx: 7.5, ry: 12.0 },
  { name: 'Конго', type: 'forest', lat: 0.5, lng: 21.0, rx: 5.0, ry: 6.5 },

  { name: 'Сахара', type: 'desert', lat: 23.0, lng: 12.0, rx: 8.5, ry: 22.0 },
  { name: 'Аравийская пустыня', type: 'desert', lat: 23.5, lng: 45.0, rx: 6.0, ry: 8.0 },
  { name: 'Гоби', type: 'desert', lat: 42.5, lng: 103.0, rx: 4.0, ry: 10.0 }
];

export const TRANSPORT_CORRIDORS: TransportCorridor[] = [
  // Европа — Украина — Россия
  { from: [51.50, -0.12], to: [48.85, 2.35], kind: 'rail' },
  { from: [48.85, 2.35], to: [52.52, 13.40], kind: 'rail' },
  { from: [52.52, 13.40], to: [52.23, 21.01], kind: 'rail' },
  { from: [52.23, 21.01], to: [49.84, 24.03], kind: 'rail' },
  { from: [49.84, 24.03], to: [50.45, 30.52], kind: 'rail' },
  { from: [50.45, 30.52], to: [49.99, 36.23], kind: 'rail' },
  { from: [50.45, 30.52], to: [46.48, 30.72], kind: 'highway' },
  { from: [49.99, 36.23], to: [55.75, 37.62], kind: 'rail' },
  { from: [55.75, 37.62], to: [59.93, 30.31], kind: 'rail' },
  // Транссиб
  { from: [55.75, 37.62], to: [56.84, 60.60], kind: 'rail' },
  { from: [56.84, 60.60], to: [55.01, 82.93], kind: 'rail' },
  { from: [55.01, 82.93], to: [43.11, 131.88], kind: 'rail' },
  // Ближний Восток и Азия
  { from: [41.01, 28.97], to: [39.93, 32.85], kind: 'highway' },
  { from: [39.93, 32.85], to: [33.31, 44.36], kind: 'highway' },
  { from: [33.31, 44.36], to: [35.69, 51.39], kind: 'highway' },
  { from: [39.90, 116.40], to: [31.23, 121.47], kind: 'rail' },
  { from: [31.23, 121.47], to: [23.13, 113.26], kind: 'rail' },
  { from: [39.90, 116.40], to: [30.57, 104.06], kind: 'highway' },
  // США
  { from: [40.71, -74.00], to: [38.90, -77.03], kind: 'rail' },
  { from: [38.90, -77.03], to: [41.88, -87.63], kind: 'rail' },
  { from: [41.88, -87.63], to: [32.71, -117.16], kind: 'highway' }
];
