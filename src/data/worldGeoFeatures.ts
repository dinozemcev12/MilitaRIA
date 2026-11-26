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
  type: 'mountain' | 'forest' | 'desert' | 'hills' | 'marsh';
  lat: number;
  lng: number;
  rx: number; // радиус в градусах широты
  ry: number; // радиус в градусах долготы
  angle?: number;
  elevation?: number; // 0..1 (высота)
  ridgePoints?: [number, number][]; // полилиния хребта [lat, lng]
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
  // Европа и бассейн Чёрного/Балтийского морей
  { name: 'Днепр', points: [[54.8, 32.0], [53.5, 30.2], [52.1, 30.6], [50.45, 30.52], [49.0, 32.8], [48.46, 35.04], [47.5, 35.1], [46.63, 32.61]] },
  { name: 'Днестр', points: [[49.2, 23.0], [48.5, 26.5], [47.8, 28.5], [46.8, 29.6], [46.3, 30.2]] },
  { name: 'Дунай', points: [[48.1, 8.5], [48.5, 12.1], [48.2, 16.3], [47.5, 19.0], [45.2, 19.8], [44.8, 20.4], [44.6, 22.5], [43.7, 24.5], [44.2, 28.0], [45.2, 29.6]] },
  { name: 'Рейн', points: [[46.8, 9.5], [47.6, 7.6], [49.5, 8.4], [50.1, 8.3], [50.9, 6.9], [51.9, 4.5]] },
  { name: 'Эльба', points: [[50.7, 15.6], [51.0, 13.7], [52.1, 11.6], [53.5, 9.9], [53.9, 8.7]] },
  { name: 'Одер', points: [[49.6, 17.5], [51.1, 17.0], [52.3, 14.5], [53.4, 14.6], [53.9, 14.3]] },
  { name: 'Висла', points: [[49.6, 19.0], [50.0, 20.0], [51.2, 21.8], [52.2, 21.0], [53.1, 18.6], [54.3, 18.9]] },
  { name: 'Сена', points: [[47.5, 4.8], [48.85, 2.35], [49.4, 1.1], [49.4, 0.1]] },
  { name: 'Луара', points: [[44.8, 4.2], [47.2, 2.0], [47.4, 0.7], [47.2, -2.1]] },
  { name: 'По', points: [[44.7, 7.1], [45.0, 9.6], [45.0, 11.5], [44.9, 12.4]] },
  { name: 'Эбро', points: [[43.0, -4.1], [42.4, -2.4], [41.6, -0.9], [40.7, 0.8]] },

  // Россия и СНГ
  { name: 'Волга', points: [[57.2, 32.5], [57.6, 39.8], [56.3, 44.0], [55.8, 49.0], [53.2, 50.1], [51.5, 46.0], [48.7, 44.5], [46.3, 48.0]] },
  { name: 'Дон', points: [[54.0, 38.3], [51.0, 39.5], [49.5, 42.5], [47.5, 41.0], [47.1, 39.3]] },
  { name: 'Обь', points: [[52.4, 85.0], [55.0, 82.9], [61.2, 73.4], [61.0, 69.0], [66.5, 66.6]] },
  { name: 'Енисей', points: [[51.7, 94.4], [56.0, 92.9], [61.0, 90.0], [67.4, 86.6], [71.8, 82.5]] },
  { name: 'Лена', points: [[53.9, 107.9], [60.4, 120.4], [62.0, 129.7], [67.5, 123.4], [72.4, 126.8]] },
  { name: 'Амур', points: [[53.3, 121.5], [50.2, 127.5], [48.5, 132.5], [48.5, 135.1], [53.1, 140.7]] },

  // Ближний Восток и Африка
  { name: 'Нил', points: [[-2.5, 29.5], [1.5, 32.5], [9.5, 31.5], [15.6, 32.5], [21.8, 31.3], [25.7, 32.6], [30.04, 31.23], [31.4, 30.4]] },
  { name: 'Тигр', points: [[38.5, 39.5], [37.2, 42.2], [35.5, 43.3], [33.3, 44.4], [31.0, 47.4]] },
  { name: 'Евфрат', points: [[39.8, 41.3], [37.5, 38.0], [35.9, 39.0], [34.4, 41.5], [33.3, 43.8], [31.0, 47.4]] },
  { name: 'Конго', points: [[-11.5, 26.5], [-4.3, 26.0], [0.5, 25.2], [2.0, 22.5], [0.0, 18.1], [-4.3, 15.3], [-6.0, 12.4]] },
  { name: 'Нигер', points: [[9.5, -10.5], [13.0, -5.0], [17.0, -1.0], [13.5, 4.0], [7.5, 6.5], [4.5, 6.0]] },

  // Азия
  { name: 'Инд', points: [[31.5, 81.5], [35.0, 75.0], [34.0, 71.5], [30.0, 71.0], [25.0, 68.3], [23.9, 67.5]] },
  { name: 'Ганг', points: [[31.0, 79.0], [28.5, 78.0], [25.4, 81.8], [25.6, 85.1], [24.0, 88.0], [22.6, 89.5]] },
  { name: 'Янцзы', points: [[33.5, 91.5], [30.0, 99.0], [28.5, 104.5], [29.5, 106.5], [30.6, 114.3], [31.23, 121.47]] },
  { name: 'Хуанхэ', points: [[35.0, 96.0], [36.0, 103.8], [40.2, 110.0], [37.5, 111.0], [34.7, 113.6], [37.7, 119.1]] },
  { name: 'Меконг', points: [[33.0, 94.0], [27.0, 99.5], [20.0, 101.0], [17.9, 102.6], [15.1, 105.8], [10.5, 106.5]] },

  // Америка
  { name: 'Миссисипи', points: [[47.2, -95.2], [44.0, -91.5], [41.5, -90.5], [38.6, -90.2], [35.1, -90.0], [32.3, -90.9], [29.9, -90.0], [29.1, -89.2]] },
  { name: 'Миссури', points: [[45.5, -111.5], [47.5, -106.5], [47.5, -101.0], [43.5, -98.5], [39.0, -94.5], [38.8, -90.1]] },
  { name: 'Колорадо', points: [[40.2, -106.0], [38.5, -109.5], [36.0, -112.5], [36.0, -114.7], [32.5, -114.8]] },
  { name: 'Св. Лаврентий', points: [[44.3, -76.0], [45.5, -73.6], [46.8, -71.2], [49.5, -67.0]] },
  { name: 'Амазонка', points: [[-11.0, -75.5], [-4.4, -73.5], [-3.1, -60.0], [-2.4, -54.7], [-1.0, -51.0], [-0.5, -49.5]] },
  { name: 'Парана', points: [[-18.5, -49.0], [-24.0, -54.0], [-27.5, -58.5], [-32.5, -60.5], [-34.2, -58.5]] }
];

export const TERRAIN_ZONES: TerrainZone[] = [
  // --- ГОРООБРАЗОВАНИЯ И ХРЕБТЫ (Хребтовые линии в стиле HoI) ---
  {
    name: 'Альпы',
    type: 'mountain',
    lat: 46.5, lng: 10.5, rx: 2.4, ry: 5.8, angle: 0.15,
    elevation: 0.88,
    ridgePoints: [[45.4, 6.8], [45.9, 7.8], [46.5, 9.8], [47.1, 11.5], [47.4, 13.6], [46.8, 15.2]]
  },
  {
    name: 'Карпаты',
    type: 'mountain',
    lat: 47.8, lng: 24.5, rx: 2.8, ry: 3.8, angle: -0.35,
    elevation: 0.75,
    ridgePoints: [[49.2, 19.5], [49.4, 21.0], [48.6, 23.5], [47.5, 25.5], [46.0, 26.2], [45.3, 25.0], [45.1, 23.0]]
  },
  {
    name: 'Кавказ',
    type: 'mountain',
    lat: 42.6, lng: 44.5, rx: 1.8, ry: 5.2, angle: -0.25,
    elevation: 0.92,
    ridgePoints: [[44.5, 38.5], [43.6, 41.5], [43.3, 42.5], [42.5, 45.0], [41.5, 47.5], [40.8, 49.0]]
  },
  {
    name: 'Пиренеи',
    type: 'mountain',
    lat: 42.6, lng: 1.0, rx: 1.2, ry: 3.2, angle: -0.05,
    elevation: 0.80,
    ridgePoints: [[43.3, -1.8], [42.8, 0.1], [42.5, 1.5], [42.4, 3.1]]
  },
  {
    name: 'Апеннины',
    type: 'mountain',
    lat: 42.5, lng: 13.0, rx: 3.5, ry: 2.0, angle: -0.45,
    elevation: 0.68,
    ridgePoints: [[44.4, 9.8], [43.8, 12.0], [42.4, 13.4], [40.8, 15.5], [38.5, 16.0]]
  },
  {
    name: 'Динарское нагорье и Балканы',
    type: 'mountain',
    lat: 43.0, lng: 18.5, rx: 3.2, ry: 2.8, angle: -0.5,
    elevation: 0.70,
    ridgePoints: [[45.5, 14.5], [44.0, 16.8], [42.8, 19.2], [42.0, 21.0], [40.5, 21.5]]
  },
  {
    name: 'Уральские горы',
    type: 'mountain',
    lat: 60.0, lng: 59.5, rx: 8.5, ry: 2.0, angle: 0.05,
    elevation: 0.68,
    ridgePoints: [[67.5, 65.0], [64.0, 60.0], [60.0, 59.2], [56.0, 59.8], [52.0, 57.5], [51.0, 56.5]]
  },
  {
    name: 'Скандинавские горы',
    type: 'mountain',
    lat: 65.0, lng: 14.0, rx: 5.5, ry: 3.5, angle: 0.35,
    elevation: 0.72,
    ridgePoints: [[68.0, 19.0], [65.5, 14.5], [62.5, 9.0], [60.5, 7.5]]
  },
  {
    name: 'Понтийские горы',
    type: 'mountain',
    lat: 40.8, lng: 37.0, rx: 1.4, ry: 4.8, angle: 0.0,
    elevation: 0.72,
    ridgePoints: [[41.2, 32.5], [40.8, 36.5], [40.8, 41.0]]
  },
  {
    name: 'Тавр (Турция)',
    type: 'mountain',
    lat: 37.5, lng: 35.0, rx: 1.5, ry: 5.5, angle: 0.1,
    elevation: 0.76,
    ridgePoints: [[36.8, 30.5], [37.2, 33.5], [37.8, 37.0], [38.2, 42.0]]
  },
  {
    name: 'Загрос (Иран)',
    type: 'mountain',
    lat: 32.0, lng: 50.0, rx: 5.5, ry: 4.5, angle: -0.55,
    elevation: 0.82,
    ridgePoints: [[37.0, 45.0], [34.5, 48.0], [32.0, 51.5], [29.5, 54.0], [27.5, 56.5]]
  },
  {
    name: 'Эльбурс',
    type: 'mountain',
    lat: 36.2, lng: 52.0, rx: 1.2, ry: 3.2, angle: 0.05,
    elevation: 0.80,
    ridgePoints: [[37.0, 49.5], [36.0, 52.0], [36.5, 54.5]]
  },
  {
    name: 'Гималаи и Каракорум',
    type: 'mountain',
    lat: 30.5, lng: 85.0, rx: 4.8, ry: 13.5, angle: -0.18,
    elevation: 1.0,
    ridgePoints: [[35.8, 76.5], [33.5, 77.5], [31.5, 80.0], [29.5, 83.0], [28.0, 86.5], [27.5, 90.0], [28.2, 95.0]]
  },
  {
    name: 'Гиндукуш и Памир',
    type: 'mountain',
    lat: 37.0, lng: 72.0, rx: 2.5, ry: 3.5, angle: 0.25,
    elevation: 0.94,
    ridgePoints: [[35.5, 69.0], [37.0, 72.0], [38.5, 74.5]]
  },
  {
    name: 'Тянь-Шань',
    type: 'mountain',
    lat: 42.5, lng: 80.0, rx: 2.2, ry: 7.5, angle: 0.05,
    elevation: 0.88,
    ridgePoints: [[42.5, 74.0], [42.0, 78.5], [43.0, 84.0], [43.5, 89.0]]
  },
  {
    name: 'Алтай',
    type: 'mountain',
    lat: 50.0, lng: 87.0, rx: 2.5, ry: 4.5, angle: -0.35,
    elevation: 0.78,
    ridgePoints: [[51.5, 83.5], [50.0, 87.0], [48.5, 90.5]]
  },
  {
    name: 'Саяны',
    type: 'mountain',
    lat: 52.2, lng: 98.0, rx: 2.0, ry: 5.5, angle: 0.15,
    elevation: 0.74,
    ridgePoints: [[53.0, 93.0], [52.0, 99.0], [51.5, 102.5]]
  },
  {
    name: 'Японские Альпы',
    type: 'mountain',
    lat: 36.0, lng: 137.8, rx: 1.8, ry: 1.2, angle: 0.35,
    elevation: 0.72,
    ridgePoints: [[36.8, 137.2], [36.0, 137.8], [35.2, 138.4]]
  },
  {
    name: 'Скалистые горы',
    type: 'mountain',
    lat: 45.0, lng: -112.0, rx: 11.5, ry: 5.5, angle: -0.22,
    elevation: 0.86,
    ridgePoints: [[55.0, -122.0], [51.5, -116.0], [47.0, -113.5], [43.0, -109.5], [39.0, -106.5], [35.5, -106.0]]
  },
  {
    name: 'Каскадные горы и Сьерра-Невада',
    type: 'mountain',
    lat: 42.0, lng: -120.5, rx: 7.0, ry: 2.2, angle: -0.15,
    elevation: 0.82,
    ridgePoints: [[48.5, -121.5], [44.5, -121.8], [39.5, -120.2], [36.5, -118.5]]
  },
  {
    name: 'Аппалачи',
    type: 'mountain',
    lat: 38.5, lng: -79.5, rx: 6.0, ry: 3.5, angle: 0.55,
    elevation: 0.58,
    ridgePoints: [[44.5, -71.5], [41.0, -76.5], [37.5, -80.5], [35.0, -84.0]]
  },
  {
    name: 'Анды',
    type: 'mountain',
    lat: -20.0, lng: -69.0, rx: 20.0, ry: 3.5, angle: 0.05,
    elevation: 0.96,
    ridgePoints: [[10.0, -73.0], [3.0, -76.0], [-5.0, -78.0], [-13.0, -73.0], [-19.0, -68.5], [-26.0, -68.5], [-33.5, -70.0], [-42.0, -72.0], [-51.0, -73.0]]
  },
  {
    name: 'Атласские горы',
    type: 'mountain',
    lat: 33.5, lng: 0.0, rx: 2.8, ry: 7.5, angle: 0.25,
    elevation: 0.72,
    ridgePoints: [[31.5, -7.5], [33.0, -4.5], [35.0, 2.5], [36.5, 7.5]]
  },
  {
    name: 'Эфиопское нагорье',
    type: 'mountain',
    lat: 9.5, lng: 38.5, rx: 3.5, ry: 2.5, angle: 0.1,
    elevation: 0.76,
    ridgePoints: [[12.5, 37.5], [9.5, 39.0], [7.0, 39.5]]
  },
  {
    name: 'Большой Водораздельный хребет',
    type: 'mountain',
    lat: -28.0, lng: 148.5, rx: 9.5, ry: 2.5, angle: 0.2,
    elevation: 0.65,
    ridgePoints: [[-17.0, 144.5], [-24.5, 148.5], [-31.5, 151.0], [-36.5, 148.5]]
  },

  // --- ЛЕСА И ТАЙГА ---
  { name: 'Сибирская тайга', type: 'forest', lat: 60.5, lng: 80.0, rx: 7.5, ry: 38.0 },
  { name: 'Восточно-европейские леса', type: 'forest', lat: 54.0, lng: 28.0, rx: 3.5, ry: 8.0 },
  { name: 'Скандинавские леса', type: 'forest', lat: 62.0, lng: 18.0, rx: 4.5, ry: 6.0 },
  { name: 'Канадская тайга', type: 'forest', lat: 55.0, lng: -95.0, rx: 6.5, ry: 25.0 },
  { name: 'Амазонская сельва', type: 'forest', lat: -4.5, lng: -62.0, rx: 8.5, ry: 13.0 },
  { name: 'Джунгли Конго', type: 'forest', lat: 0.5, lng: 22.0, rx: 5.5, ry: 7.5 },
  { name: 'Юго-Восточная Азия (джунгли)', type: 'forest', lat: 18.0, lng: 102.0, rx: 6.0, ry: 7.0 },

  // --- БОЛОТА И ПЛАВНИ ---
  { name: 'Полесье (Припятские болота)', type: 'marsh', lat: 51.8, lng: 27.5, rx: 1.5, ry: 3.5 },

  // --- ПУСТЫНИ И ПОЛУПУСТЫНИ ---
  { name: 'Сахара', type: 'desert', lat: 23.0, lng: 12.0, rx: 9.0, ry: 24.0 },
  { name: 'Аравийская пустыня', type: 'desert', lat: 23.5, lng: 45.0, rx: 6.5, ry: 9.0 },
  { name: 'Гоби', type: 'desert', lat: 42.5, lng: 103.0, rx: 4.5, ry: 11.0 },
  { name: 'Калахари', type: 'desert', lat: -23.0, lng: 21.0, rx: 4.5, ry: 5.5 },
  { name: 'Австралийская пустыня', type: 'desert', lat: -25.0, lng: 132.0, rx: 7.5, ry: 12.0 },
  { name: 'Мохаве и Сонора', type: 'desert', lat: 33.0, lng: -114.0, rx: 3.5, ry: 4.0 }
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
