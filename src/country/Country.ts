/* ============================================================
   country/Country.ts —運行时模型 государства (mutable state).
   Статические данные берутся из data/countries.ts.
   ============================================================ */
import { CountryData, getCountryData } from '../data/countries.js';
import { eventBus, GameEvents } from '../core/EventBus.js';

export interface MinisterSet {
  defense: string;
  economy: string;
  foreign: string;
  interior: string;
}

export interface CountryResources {
  oil: number;
  steel: number;
  energy: number;
  food: number;
}

export interface CountrySnapshot {
  code: string;
  money: number;
  debt: number;
  taxRate: number;
  stability: number;
  corruption: number;
  ideology: string;
  government: string;
  rulingParty: string;
  publicOpinion: number;
  militaryBudget: number;
  militaryTech: number;
  inflation: number;
  unemployment: number;
  gdp: number;
  gdpGrowth: number;
  population: number;
  manpower: number;
  supplyLevel: number;
  ministers: MinisterSet;
  laws: string[];
  sanctionsFrom: string[];
  tradePartners: string[];
  resources: CountryResources;
  relations: Record<string, number>;
  allies: string[];
  enemies: string[];
  warWith: string[];
  occupiedBy?: string | null;
  occupationProgress?: number;
}

export class Country {
  readonly code: string;
  readonly tag: string;
  readonly name: string;
  readonly nameRu: string;
  readonly capital: string;
  readonly capLat: number;
  readonly capLng: number;
  readonly region: string;
  readonly continent: string;
  readonly color: string;
  readonly baseData: CountryData;

  /* mutable */
  population: number;
  gdp: number;
  money: number;
  gdpGrowth: number;
  inflation: number;
  unemployment: number;
  debt: number;
  taxRate: number;

  stability: number;
  corruption: number;
  ideology: string;
  government: string;
  rulingParty: string;
  publicOpinion: number;

  militaryBudget: number;
  militaryTech: number;
  manpower: number;
  supplyLevel: number;

  ministers: MinisterSet;
  laws: string[] = [];
  sanctionsFrom: string[] = [];
  tradePartners: string[] = [];
  resources: CountryResources;

  selected: boolean;
  aiControlled: boolean;
  relations: Record<string, number> = {};
  allies: string[] = [];
  enemies: string[] = [];
  warWith: string[] = [];
  occupiedBy: string | null = null;
  occupationProgress = 0;

  constructor(data: CountryData) {
    this.baseData = data;
    this.code = data.code;
    this.tag = data.tag;
    this.name = data.name;
    this.nameRu = data.nameRu;
    this.capital = data.capital;
    this.capLat = data.capLat;
    this.capLng = data.capLng;
    this.region = data.region;
    this.continent = data.continent;
    this.color = data.color;
    this.aiControlled = data.aiControlled !== false;

    this.population = data.population;
    this.gdp = data.gdp;
    this.money = data.money;
    this.gdpGrowth = 0.025;
    this.inflation = data.inflation;
    this.unemployment = data.unemployment;
    this.debt = 0;
    this.taxRate = 0.25;

    this.stability = data.stability;
    this.corruption = data.corruption;
    this.ideology = data.ideology;
    this.government = data.government;
    this.rulingParty = data.rulingParty;
    this.publicOpinion = data.publicOpinion;

    this.militaryBudget = data.militaryBudget;
    this.militaryTech = data.militaryTech;
    this.manpower = Math.round(data.population * 12); // тыс. резервистов
    this.supplyLevel = 1.0;

    this.ministers = {
      defense: 'Стандартный генштаб',
      economy: 'Технократ',
      foreign: 'Карьерный дипломат',
      interior: 'Силовик'
    };

    const baseRes = Math.max(10, Math.round(data.gdp * 0.05 + data.population * 0.3));
    this.resources = {
      oil: Math.round(baseRes * (['SAU', 'RUS', 'IRN', 'IRQ', 'USA', 'CAN'].includes(data.code) ? 2.5 : 0.6)),
      steel: Math.round(baseRes * (['CHN', 'USA', 'RUS', 'DEU', 'JPN'].includes(data.code) ? 2.0 : 0.8)),
      energy: Math.round(baseRes * 1.1),
      food: Math.round(data.population * 1.2)
    };

    this.selected = false;
  }

  getSnapshot(): CountrySnapshot {
    return {
      code: this.code,
      money: this.money,
      debt: this.debt,
      taxRate: this.taxRate,
      stability: this.stability,
      corruption: this.corruption,
      ideology: this.ideology,
      government: this.government,
      rulingParty: this.rulingParty,
      publicOpinion: this.publicOpinion,
      militaryBudget: this.militaryBudget,
      militaryTech: this.militaryTech,
      inflation: this.inflation,
      unemployment: this.unemployment,
      gdp: this.gdp,
      gdpGrowth: this.gdpGrowth,
      population: this.population,
      manpower: this.manpower,
      supplyLevel: this.supplyLevel,
      ministers: { ...this.ministers },
      laws: [...this.laws],
      sanctionsFrom: [...this.sanctionsFrom],
      tradePartners: [...this.tradePartners],
      resources: { ...this.resources },
      relations: { ...this.relations },
      allies: [...this.allies],
      enemies: [...this.enemies],
      warWith: [...this.warWith],
      occupiedBy: this.occupiedBy,
      occupationProgress: this.occupationProgress
    };
  }

  applySnapshot(snap: CountrySnapshot): void {
    this.money = snap.money;
    this.debt = snap.debt ?? 0;
    this.taxRate = snap.taxRate ?? 0.25;
    this.stability = snap.stability;
    this.corruption = snap.corruption;
    this.ideology = snap.ideology;
    this.government = snap.government;
    this.rulingParty = snap.rulingParty;
    this.publicOpinion = snap.publicOpinion;
    this.militaryBudget = snap.militaryBudget;
    this.militaryTech = snap.militaryTech ?? this.militaryTech;
    this.inflation = snap.inflation;
    this.unemployment = snap.unemployment;
    this.gdp = snap.gdp;
    this.gdpGrowth = snap.gdpGrowth ?? 0.025;
    this.population = snap.population;
    this.manpower = snap.manpower ?? Math.round(this.population * 12);
    this.supplyLevel = snap.supplyLevel ?? 1.0;
    if (snap.ministers) this.ministers = { ...snap.ministers };
    this.laws = [...(snap.laws ?? [])];
    this.sanctionsFrom = [...(snap.sanctionsFrom ?? [])];
    this.tradePartners = [...(snap.tradePartners ?? [])];
    if (snap.resources) this.resources = { ...snap.resources };
    this.relations = { ...snap.relations };
    this.allies = [...snap.allies];
    this.enemies = [...snap.enemies];
    this.warWith = [...snap.warWith];
    this.occupiedBy = snap.occupiedBy ?? null;
    this.occupationProgress = snap.occupationProgress ?? 0;
  }

  changeStability(delta: number, reason?: string): void {
    const before = this.stability;
    this.stability = Math.min(1, Math.max(0, this.stability + delta));
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, {
      country: this.code, field: 'stability', before, after: this.stability, reason
    });
  }

  changeMoney(delta: number, reason?: string): void {
    this.money += delta;
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, {
      country: this.code, field: 'money', delta, after: this.money, reason
    });
  }

  setRelation(code: string, value: number): void {
    const clamped = Math.min(1, Math.max(-1, value));
    const before = this.relations[code] ?? 0;
    this.relations[code] = clamped;
    eventBus.emit(GameEvents.RELATION_CHANGED, {
      from: this.code, to: code, before, after: clamped
    });
  }

  getRelation(code: string): number {
    return this.relations[code] ?? 0;
  }
}
