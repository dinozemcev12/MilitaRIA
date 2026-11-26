/* ============================================================
   politics/PoliticsSystem.ts — политическая система (Этап 2)
   Министры, законы, выборы, борьба с коррупцией, стабильность.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { MinisterSet } from '../country/Country.js';

export interface LawDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  stabilityDelta: number;
  corruptionDelta: number;
  opinionDelta: number;
}

export const AVAILABLE_LAWS: LawDefinition[] = [
  {
    id: 'anti_corruption_act',
    name: 'Закон о прозрачности',
    description: 'Снижает коррупцию на 8%, +4% стабильности',
    cost: 15,
    stabilityDelta: 0.04,
    corruptionDelta: -0.08,
    opinionDelta: 0.05
  },
  {
    id: 'industrial_subsidies',
    name: 'Промышленные субсидии',
    description: '+0.6% к росту ВВП, -3% безработицы',
    cost: 30,
    stabilityDelta: 0.02,
    corruptionDelta: 0.01,
    opinionDelta: 0.04
  },
  {
    id: 'martial_readiness',
    name: 'Повышенная боеготовность',
    description: 'Ускоряет мобилизацию и снижает стоимость найма войск',
    cost: 25,
    stabilityDelta: -0.03,
    corruptionDelta: 0,
    opinionDelta: -0.04
  },
  {
    id: 'social_welfare',
    name: 'Социальный пакт',
    description: '+8% общественное мнение, +5% стабильность',
    cost: 35,
    stabilityDelta: 0.05,
    corruptionDelta: 0,
    opinionDelta: 0.08
  }
];

export const MINISTER_CANDIDATES: Record<keyof MinisterSet, string[]> = {
  defense: ['Стандартный генштаб', 'Генерал-реформатор', 'Ястреб ВПК', 'Специалист по обороне'],
  economy: ['Технократ', 'Реформатор', 'Монетарист', 'Кейнсианец'],
  foreign: ['Карьерный дипломат', 'Миротворец', 'Жёсткий реалист', 'Торговый представитель'],
  interior: ['Силовик', 'Либеральный юрист', 'Антикоррупционер', 'Технократ МВД']
};

export class PoliticsSystem implements IGameSystem {
  readonly name = 'Politics';
  readonly priority = 30;

  private unsubscribeTick: (() => void) | null = null;

  static instance: PoliticsSystem;
  static getInstance(): PoliticsSystem {
    if (!PoliticsSystem.instance) PoliticsSystem.instance = new PoliticsSystem();
    return PoliticsSystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, (data: { date: { day: number } }) => {
      if (data?.date?.day === 1) this._onMonthTick();
    }).unsubscribe;
    console.log('[PoliticsSystem] инициализировано');
  }

  update(dt: number): void {
    void dt;
  }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  private _onMonthTick(): void {
    for (const c of countrySystem.getAll()) {
      // Стабильность и общественное мнение реагируют на экономику и войну
      const unempPenalty = Math.max(0, c.unemployment - 0.1) * 0.05;
      const infPenalty = Math.max(0, c.inflation - 0.06) * 0.04;
      const warPenalty = c.warWith.length * 0.008;
      const interiorBonus = c.ministers.interior === 'Антикоррупционер' ? 0.004 : 0;

      if (c.ministers.interior === 'Антикоррупционер' && c.corruption > 0.05) {
        c.corruption = Math.max(0.05, c.corruption - 0.003);
      }

      const deltaOpinion = (c.gdpGrowth > 0.02 ? 0.004 : -0.004) - unempPenalty - infPenalty - warPenalty;
      c.publicOpinion = Math.min(1, Math.max(0.05, c.publicOpinion + deltaOpinion));

      const stabDrift = (c.publicOpinion - 0.5) * 0.015 + interiorBonus - warPenalty - c.corruption * 0.005;
      c.stability = Math.min(1, Math.max(0.05, c.stability + stabDrift));
    }
  }

  /* ---------- операции ---------- */
  appointMinister(countryCode: string, ministry: keyof MinisterSet, name: string): boolean {
    const c = countrySystem.getCountry(countryCode);
    if (!c) return false;
    c.ministers[ministry] = name;
    eventBus.emit(GameEvents.MINISTER_APPOINTED, { country: countryCode, ministry, name });
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: countryCode, field: 'ministers' });
    return true;
  }

  changeStability(countryCode: string, delta: number, reason: string): void {
    const c = countrySystem.getCountry(countryCode);
    if (!c) return;
    c.changeStability(delta, reason);
    eventBus.emit(GameEvents.STABILITY_CHANGED, { country: countryCode, delta, after: c.stability });
  }

  passLaw(countryCode: string, lawId: string): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(countryCode);
    if (!c) return { ok: false, reason: 'Страна не найдена' };
    if (c.laws.includes(lawId)) return { ok: false, reason: 'Закон уже принят' };
    const law = AVAILABLE_LAWS.find((l) => l.id === lawId);
    if (!law) return { ok: false, reason: 'Неизвестный закон' };
    if (c.money < law.cost) return { ok: false, reason: `Недостаточно средств (нужно ${law.cost} млрд)` };

    c.changeMoney(-law.cost, `принятие закона: ${law.name}`);
    c.laws.push(law.id);
    c.changeStability(law.stabilityDelta, law.name);
    c.corruption = Math.min(1, Math.max(0.02, c.corruption + law.corruptionDelta));
    c.publicOpinion = Math.min(1, Math.max(0, c.publicOpinion + law.opinionDelta));
    if (law.id === 'industrial_subsidies') {
      c.unemployment = Math.max(0.02, c.unemployment - 0.03);
    }

    eventBus.emit(GameEvents.LAW_PASSED, { country: countryCode, law: law.id, name: law.name });
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: countryCode, field: 'laws' });
    return { ok: true };
  }

  fightCorruption(countryCode: string): boolean {
    const c = countrySystem.getCountry(countryCode);
    const cost = Math.max(10, Math.round(c ? c.gdp * 0.01 : 10));
    if (!c || c.money < cost || c.corruption <= 0.05) return false;
    c.changeMoney(-cost, 'антикоррупционная кампания');
    c.corruption = Math.max(0.05, c.corruption - 0.05);
    c.changeStability(0.02, 'антикоррупционная кампания');
    c.publicOpinion = Math.min(1, c.publicOpinion + 0.03);
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: countryCode, field: 'corruption' });
    return true;
  }

  startElection(countryCode: string): boolean {
    const c = countrySystem.getCountry(countryCode);
    if (!c) return false;
    const parties = ['Реформистский альянс', 'Национальная коалиция', 'Социал-демократы', 'Либеральный блок', 'Центристская партия'];
    const nextParty = parties[Math.floor(Math.random() * parties.length)] ?? c.rulingParty;
    c.rulingParty = nextParty;
    c.changeStability(c.publicOpinion > 0.5 ? 0.06 : -0.04, 'выборы');
    c.publicOpinion = Math.min(1, Math.max(0.25, c.publicOpinion + 0.08));
    eventBus.emit(GameEvents.ELECTION_STARTED, { country: countryCode, winner: nextParty });
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: countryCode, field: 'rulingParty' });
    return true;
  }

  getState(): Record<string, any> {
    return {};
  }
  setState(_s: Record<string, any>): void {}
}

export const politicsSystem = PoliticsSystem.getInstance();
