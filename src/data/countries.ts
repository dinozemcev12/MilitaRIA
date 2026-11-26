/* ============================================================
   data/countries.ts — справочник всех 166 государств мира на 1 января 2000 года.
   ============================================================ */
import { WORLD_COUNTRIES_2000, RawCountry2000 } from './worldCountries2000.js';
import { getCountryCentroid, initWorldGeometry } from '../world/WorldGeometry.js';

export interface CountryData {
  code: string;
  tag: string;
  name: string;
  nameRu: string;
  capital: string;
  capLat: number;
  capLng: number;
  region: string;
  continent: string;
  population: number; // млн
  gdp: number;        // млрд USD
  money: number;      // млрд игровых
  stability: number;  // 0..1
  corruption: number; // 0..1
  ideology: string;
  government: string;
  rulingParty: string;
  publicOpinion: number; // 0..1
  militaryBudget: number; // млрд
  inflation: number;
  unemployment: number;
  militaryTech: number;
  aiControlled: boolean;
  color: string;
  polygon: [number, number][]; // legacy fallback; реальные контуры в WorldGeometry
}

interface CountryOverride {
  capLat?: number;
  capLng?: number;
  money?: number;
  stability?: number;
  corruption?: number;
  rulingParty?: string;
  publicOpinion?: number;
  militaryBudget?: number;
  inflation?: number;
  unemployment?: number;
  militaryTech?: number;
}

const MAJOR_OVERRIDES: Record<string, CountryOverride> = {
  USA: { capLat: 38.9, capLng: -77.0, money: 2200, stability: 0.72, corruption: 0.25, rulingParty: 'Демократическая / Республиканская', publicOpinion: 0.65, militaryBudget: 300, inflation: 0.034, unemployment: 0.04, militaryTech: 1.3 },
  RUS: { capLat: 55.8, capLng: 37.6, money: 140, stability: 0.60, corruption: 0.55, rulingParty: 'Единство / КПРФ', publicOpinion: 0.55, militaryBudget: 25, inflation: 0.20, unemployment: 0.10, militaryTech: 1.05 },
  CHN: { capLat: 39.9, capLng: 116.4, money: 380, stability: 0.68, corruption: 0.45, rulingParty: 'Коммунистическая партия Китая', publicOpinion: 0.70, militaryBudget: 65, inflation: 0.016, unemployment: 0.031, militaryTech: 0.8 },
  GBR: { capLat: 51.5, capLng: -0.1, money: 320, stability: 0.75, corruption: 0.22, rulingParty: 'Лейбористская партия', publicOpinion: 0.68, militaryBudget: 40, inflation: 0.008, unemployment: 0.06, militaryTech: 1.1 },
  FRA: { capLat: 48.9, capLng: 2.3, money: 290, stability: 0.70, corruption: 0.30, rulingParty: 'Социалистическая партия / ОПР', publicOpinion: 0.60, militaryBudget: 42, inflation: 0.008, unemployment: 0.10, militaryTech: 1.05 },
  DEU: { capLat: 52.5, capLng: 13.4, money: 410, stability: 0.74, corruption: 0.18, rulingParty: 'СДПГ / Зелёные', publicOpinion: 0.65, militaryBudget: 35, inflation: 0.011, unemployment: 0.10, militaryTech: 1.0 },
  POL: { capLat: 52.2, capLng: 21.0, money: 60, stability: 0.70, corruption: 0.35, rulingParty: 'Акция Солидарности', publicOpinion: 0.62, militaryBudget: 7, inflation: 0.10, unemployment: 0.16, militaryTech: 0.7 },
  TUR: { capLat: 39.9, capLng: 32.9, money: 80, stability: 0.65, corruption: 0.40, rulingParty: 'ДЛП / ПНД', publicOpinion: 0.58, militaryBudget: 14, inflation: 0.055, unemployment: 0.06, militaryTech: 0.75 },
  JPN: { capLat: 35.7, capLng: 139.7, money: 900, stability: 0.78, corruption: 0.20, rulingParty: 'Либерально-демократическая партия', publicOpinion: 0.70, militaryBudget: 42, inflation: -0.007, unemployment: 0.047, militaryTech: 1.1 },
  IND: { capLat: 28.6, capLng: 77.2, money: 120, stability: 0.62, corruption: 0.45, rulingParty: 'БДП (Национальный альянс)', publicOpinion: 0.60, militaryBudget: 18, inflation: 0.038, unemployment: 0.09, militaryTech: 0.7 },
  IRN: { capLat: 35.7, capLng: 51.4, money: 40, stability: 0.55, corruption: 0.50, rulingParty: 'Консерваторы / Реформаторы', publicOpinion: 0.50, militaryBudget: 6, inflation: 0.12, unemployment: 0.13, militaryTech: 0.6 },
  IRQ: { capLat: 33.3, capLng: 44.4, money: 30, stability: 0.45, corruption: 0.65, rulingParty: 'Баас', publicOpinion: 0.40, militaryBudget: 12, inflation: 0.05, unemployment: 0.20, militaryTech: 0.55 },
  ISR: { capLat: 31.8, capLng: 35.2, money: 45, stability: 0.55, corruption: 0.30, rulingParty: 'Авода / Ликуд', publicOpinion: 0.55, militaryBudget: 11, inflation: 0.01, unemployment: 0.09, militaryTech: 0.9 },
  SAU: { capLat: 24.7, capLng: 46.7, money: 150, stability: 0.58, corruption: 0.55, rulingParty: 'Династия Аль Сауд', publicOpinion: 0.60, militaryBudget: 15, inflation: -0.01, unemployment: 0.05, militaryTech: 0.8 },
  PRK: { capLat: 39.0, capLng: 125.7, money: 10, stability: 0.50, corruption: 0.70, rulingParty: 'Трудовая партия Кореи', publicOpinion: 0.45, militaryBudget: 4, inflation: 0.02, unemployment: 0.0, militaryTech: 0.5 },
  KOR: { capLat: 37.6, capLng: 127.0, money: 180, stability: 0.68, corruption: 0.35, rulingParty: 'Демократическая партия', publicOpinion: 0.62, militaryBudget: 16, inflation: 0.02, unemployment: 0.04, militaryTech: 0.85 },
  AUS: { capLat: -35.3, capLng: 149.1, money: 140, stability: 0.80, corruption: 0.18, rulingParty: 'Либеральная партия', publicOpinion: 0.72, militaryBudget: 10, inflation: 0.04, unemployment: 0.06, militaryTech: 0.95 },
  CAN: { capLat: 45.4, capLng: -75.7, money: 200, stability: 0.82, corruption: 0.15, rulingParty: 'Либеральная партия', publicOpinion: 0.75, militaryBudget: 11, inflation: 0.027, unemployment: 0.068, militaryTech: 0.9 },
  BRA: { capLat: -15.8, capLng: -47.9, money: 110, stability: 0.60, corruption: 0.45, rulingParty: 'ПСДБ', publicOpinion: 0.55, militaryBudget: 15, inflation: 0.07, unemployment: 0.06, militaryTech: 0.65 },
  ARG: { capLat: -34.6, capLng: -58.4, money: 70, stability: 0.55, corruption: 0.40, rulingParty: 'Альянс', publicOpinion: 0.50, militaryBudget: 4, inflation: -0.01, unemployment: 0.14, militaryTech: 0.6 },
  EGY: { capLat: 30.1, capLng: 31.2, money: 40, stability: 0.58, corruption: 0.50, rulingParty: 'НДП', publicOpinion: 0.55, militaryBudget: 9, inflation: 0.03, unemployment: 0.08, militaryTech: 0.6 },
  ZAF: { capLat: -25.7, capLng: 28.2, money: 50, stability: 0.55, corruption: 0.40, rulingParty: 'АНК', publicOpinion: 0.52, militaryBudget: 3, inflation: 0.05, unemployment: 0.26, militaryTech: 0.65 },
  UKR: { capLat: 50.4, capLng: 30.5, money: 20, stability: 0.50, corruption: 0.55, rulingParty: 'Парламентская коалиция', publicOpinion: 0.48, militaryBudget: 1.5, inflation: 0.06, unemployment: 0.11, militaryTech: 0.6 },
  MEX: { capLat: 19.4, capLng: -99.1, money: 80, stability: 0.58, corruption: 0.50, rulingParty: 'ПРИ / ПАН', publicOpinion: 0.55, militaryBudget: 4, inflation: 0.095, unemployment: 0.04, militaryTech: 0.55 },
  IDN: { capLat: -6.2, capLng: 106.8, money: 45, stability: 0.55, corruption: 0.55, rulingParty: 'Голкар / Демократы', publicOpinion: 0.55, militaryBudget: 5, inflation: 0.03, unemployment: 0.06, militaryTech: 0.55 },
  ESP: { capLat: 40.4, capLng: -3.7, money: 110, stability: 0.72, corruption: 0.30, rulingParty: 'Народная партия', publicOpinion: 0.62, militaryBudget: 8, inflation: 0.02, unemployment: 0.14, militaryTech: 0.8 },
  ITA: { capLat: 41.9, capLng: 12.5, money: 180, stability: 0.60, corruption: 0.45, rulingParty: 'Правоцентристская коалиция', publicOpinion: 0.55, militaryBudget: 18, inflation: 0.019, unemployment: 0.10, militaryTech: 0.85 },
  VNM: { capLat: 21.0, capLng: 105.8, money: 20, stability: 0.60, corruption: 0.50, rulingParty: 'Коммунистическая партия Вьетнама', publicOpinion: 0.62, militaryBudget: 2, inflation: 0.0, unemployment: 0.06, militaryTech: 0.5 },
  KZK: { capLat: 51.2, capLng: 71.4, money: 25, stability: 0.60, corruption: 0.50, rulingParty: 'Отан', publicOpinion: 0.58, militaryBudget: 2, inflation: 0.13, unemployment: 0.10, militaryTech: 0.55 },
  YUG: { capLat: 44.8, capLng: 20.5, money: 8, stability: 0.42, corruption: 0.55, rulingParty: 'СПС / ДОС', publicOpinion: 0.45, militaryBudget: 1.5, inflation: 0.15, unemployment: 0.22, militaryTech: 0.55 }
};

function buildCountryData(raw: RawCountry2000): CountryData {
  const ov = MAJOR_OVERRIDES[raw.code] ?? {};
  const [cLat, cLng] = getCountryCentroid(raw.code);
  const baseTech = raw.gdp > 1000 ? 0.95 : raw.gdp > 200 ? 0.75 : raw.gdp > 40 ? 0.6 : 0.45;
  const baseStab = raw.ideology === 'democracy' ? 0.65 : raw.ideology === 'monarchy' ? 0.6 : 0.52;

  return {
    code: raw.code,
    tag: raw.code,
    name: raw.name,
    nameRu: raw.nameRu,
    capital: raw.capital,
    capLat: ov.capLat ?? cLat,
    capLng: ov.capLng ?? cLng,
    region: raw.region,
    continent: raw.continent,
    population: raw.population,
    gdp: raw.gdp,
    money: ov.money ?? Math.max(2, Math.round(raw.gdp * 0.22)),
    stability: ov.stability ?? baseStab,
    corruption: ov.corruption ?? (raw.gdp > 300 ? 0.28 : 0.5),
    ideology: raw.ideology,
    government: raw.government,
    rulingParty: ov.rulingParty ?? 'Правящая коалиция',
    publicOpinion: ov.publicOpinion ?? 0.55,
    militaryBudget: ov.militaryBudget ?? Math.max(0.5, Math.round(raw.gdp * 0.025 * 10) / 10),
    inflation: ov.inflation ?? 0.04,
    unemployment: ov.unemployment ?? 0.09,
    militaryTech: ov.militaryTech ?? baseTech,
    aiControlled: true,
    color: raw.color,
    polygon: []
  };
}

export const COUNTRIES_2000: CountryData[] = [];

const countryRegistry = new Map<string, CountryData>();

export function initCountryData(): void {
  initWorldGeometry();
  COUNTRIES_2000.length = 0;
  countryRegistry.clear();

  for (const raw of WORLD_COUNTRIES_2000) {
    const cd = buildCountryData(raw);
    COUNTRIES_2000.push(cd);
    countryRegistry.set(cd.code, cd);
  }
  console.log(`[data/countries] initCountryData: загружено ${countryRegistry.size} стран на 2000 год`);
}

export function getCountryData(code: string): CountryData | undefined {
  return countryRegistry.get(code);
}

export function getAllCountryCodes(): string[] {
  return COUNTRIES_2000.map((c) => c.code);
}

export function getRegisteredCountry(code: string): CountryData | undefined {
  return countryRegistry.get(code);
}

export function getRegisteredCountries(): CountryData[] {
  return Array.from(countryRegistry.values());
}
