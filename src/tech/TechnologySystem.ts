/* ============================================================
   tech/TechnologySystem.ts — технологии и исследования (Этап 7)
   10 направлений исследований, дерево технологий, прогресс по дням,
   бонусы для армии, экономики, логистики, промышленности и разведки.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { gameTime } from '../core/GameTime.js';

export type TechBranch =
  | 'ground'
  | 'aviation'
  | 'naval'
  | 'comms'
  | 'intel'
  | 'electronics'
  | 'industry'
  | 'medicine'
  | 'transport'
  | 'infrastructure';

export const TECH_BRANCH_META: Record<TechBranch, { label: string }> = {
  ground: { label: 'Наземная техника' },
  aviation: { label: 'Авиация' },
  naval: { label: 'ВМФ' },
  comms: { label: 'Связь' },
  intel: { label: 'Разведка' },
  electronics: { label: 'Электроника' },
  industry: { label: 'Промышленность' },
  medicine: { label: 'Медицина' },
  transport: { label: 'Транспорт' },
  infrastructure: { label: 'Инфраструктура' }
};

export interface TechEffects {
  groundPower?: number;      // +множитель атаки наземных войск
  airPower?: number;         // +множитель атаки авиации
  navalPower?: number;       // +множитель атаки флота
  orgBonus?: number;         // +бонус к организации
  moraleRecovery?: number;   // +скорость восстановления морали
  supplyEff?: number;        // +эффективность снабжения
  researchSpeed?: number;    // +скорость исследований
  factoryOutput?: number;    // +скорость ВПК
  gdpGrowth?: number;        // +годовой рост ВВП
  intelBonus?: number;       // +эффективность разведки
  infraBonus?: number;       // +базовая инфраструктура
  unitSpeed?: number;        // +скорость перемещения войск
}

export interface TechDef {
  id: string;
  name: string;
  branch: TechBranch;
  tier: 1 | 2;
  cost: number;              // млрд $
  days: number;              // базовое время исследования в днях
  prereq?: string[];
  desc: string;
  effects: TechEffects;
}

export const TECH_TREE: TechDef[] = [
  // 1. Наземная техника
  {
    id: 'ground_1', name: 'Композитная броня 2000-х', branch: 'ground', tier: 1, cost: 22, days: 45,
    desc: '+12% боевая мощь танков и мехбригад',
    effects: { groundPower: 0.12 }
  },
  {
    id: 'ground_2', name: 'Активная защита и СУО', branch: 'ground', tier: 2, cost: 38, days: 70,
    prereq: ['ground_1', 'electronics_1'],
    desc: '+18% боевая мощь сухопутных войск',
    effects: { groundPower: 0.18 }
  },
  // 2. Авиация
  {
    id: 'air_1', name: 'БРЛС с ФАР', branch: 'aviation', tier: 1, cost: 28, days: 50,
    desc: '+15% эффективность авиации',
    effects: { airPower: 0.15 }
  },
  {
    id: 'air_2', name: 'Малозаметные БПЛА и 5-е поколение', branch: 'aviation', tier: 2, cost: 48, days: 85,
    prereq: ['air_1', 'electronics_1'],
    desc: '+22% мощь авиации и +10% разведка',
    effects: { airPower: 0.22, intelBonus: 0.10 }
  },
  // 3. ВМФ
  {
    id: 'naval_1', name: 'Противокорабельные комплексы', branch: 'naval', tier: 1, cost: 25, days: 50,
    desc: '+15% боевая мощь флота',
    effects: { navalPower: 0.15 }
  },
  {
    id: 'naval_2', name: 'Интегрированная ПВО ордера', branch: 'naval', tier: 2, cost: 42, days: 75,
    prereq: ['naval_1'],
    desc: '+20% боевая мощь флота',
    effects: { navalPower: 0.20 }
  },
  // 4. Связь
  {
    id: 'comms_1', name: 'Защищённая спутниковая связь', branch: 'comms', tier: 1, cost: 18, days: 40,
    desc: '+10% организация подразделений',
    effects: { orgBonus: 0.10 }
  },
  {
    id: 'comms_2', name: 'Сетецентрическое управление (C4ISR)', branch: 'comms', tier: 2, cost: 35, days: 65,
    prereq: ['comms_1', 'electronics_1'],
    desc: '+15% организация и +10% скорость войск',
    effects: { orgBonus: 0.15, unitSpeed: 0.10 }
  },
  // 5. Разведка
  {
    id: 'intel_1', name: 'Оптико-электронная спутниковая съёмка', branch: 'intel', tier: 1, cost: 20, days: 40,
    desc: '+25% эффективность разведопераций',
    effects: { intelBonus: 0.25 }
  },
  {
    id: 'intel_2', name: 'Киберразведка и РЭР', branch: 'intel', tier: 2, cost: 36, days: 65,
    prereq: ['intel_1'],
    desc: '+35% эффективность разведки и -15% стоимость операций',
    effects: { intelBonus: 0.35 }
  },
  // 6. Электроника
  {
    id: 'electronics_1', name: 'Цифровая элементная база', branch: 'electronics', tier: 1, cost: 24, days: 45,
    desc: '+15% скорость всех исследований',
    effects: { researchSpeed: 0.15 }
  },
  {
    id: 'electronics_2', name: 'Высокоточное наведение', branch: 'electronics', tier: 2, cost: 40, days: 70,
    prereq: ['electronics_1'],
    desc: '+20% скорость исследований, +10% мощь войск',
    effects: { researchSpeed: 0.20, groundPower: 0.10 }
  },
  // 7. Промышленность
  {
    id: 'industry_1', name: 'Автоматизированные сборочные линии', branch: 'industry', tier: 1, cost: 22, days: 45,
    desc: '+20% производительность ВПК',
    effects: { factoryOutput: 0.20 }
  },
  {
    id: 'industry_2', name: 'Гибкое оборонное производство', branch: 'industry', tier: 2, cost: 38, days: 70,
    prereq: ['industry_1'],
    desc: '+25% производительность ВПК и +0.4% к росту ВВП',
    effects: { factoryOutput: 0.25, gdpGrowth: 0.004 }
  },
  // 8. Медицина
  {
    id: 'medicine_1', name: 'Полевая экстренная медицина', branch: 'medicine', tier: 1, cost: 16, days: 35,
    desc: '+25% восстановление морали, +10% эффективность снабжения',
    effects: { moraleRecovery: 0.25, supplyEff: 0.10 }
  },
  {
    id: 'medicine_2', name: 'Военно-медицинская эвакуация', branch: 'medicine', tier: 2, cost: 28, days: 55,
    prereq: ['medicine_1'],
    desc: '+35% восстановление морали подразделений',
    effects: { moraleRecovery: 0.35 }
  },
  // 9. Транспорт
  {
    id: 'transport_1', name: 'Тяжёлая военно-транспортная логистика', branch: 'transport', tier: 1, cost: 20, days: 40,
    desc: '+15% скорость войск и +15% эффективность снабжения',
    effects: { unitSpeed: 0.15, supplyEff: 0.15 }
  },
  {
    id: 'transport_2', name: 'Контейнерные ж/д и авиапереброски', branch: 'transport', tier: 2, cost: 34, days: 60,
    prereq: ['transport_1'],
    desc: '+20% эффективность снабжения и +15% скорость войск',
    effects: { supplyEff: 0.20, unitSpeed: 0.15 }
  },
  // 10. Инфраструктура
  {
    id: 'infra_1', name: 'Модернизация ж/д узлов', branch: 'infrastructure', tier: 1, cost: 20, days: 45,
    desc: '+15% базовая инфраструктура и +0.3% рост ВВП',
    effects: { infraBonus: 0.15, gdpGrowth: 0.003 }
  },
  {
    id: 'infra_2', name: 'Единые логистические коридоры', branch: 'infrastructure', tier: 2, cost: 36, days: 70,
    prereq: ['infra_1'],
    desc: '+25% инфраструктура и +15% эффективность снабжения',
    effects: { infraBonus: 0.25, supplyEff: 0.15 }
  }
];

export interface ActiveResearch {
  techId: string;
  progressDays: number;
  totalDays: number;
}

export interface CountryTechState {
  researched: string[];
  active: ActiveResearch | null;
}

export interface AggregatedTechBonuses {
  groundPower: number;
  airPower: number;
  navalPower: number;
  orgBonus: number;
  moraleRecovery: number;
  supplyEff: number;
  researchSpeed: number;
  factoryOutput: number;
  gdpGrowth: number;
  intelBonus: number;
  infraBonus: number;
  unitSpeed: number;
}

export class TechnologySystem implements IGameSystem {
  readonly name = 'Technology';
  readonly priority = 45;

  private states = new Map<string, CountryTechState>();
  private unsubscribeTick: (() => void) | null = null;

  static instance: TechnologySystem;
  static getInstance(): TechnologySystem {
    if (!TechnologySystem.instance) TechnologySystem.instance = new TechnologySystem();
    return TechnologySystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._seedInitialTechs();
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => {
      this._onDayTick();
    }).unsubscribe;
    console.log('[TechnologySystem] инициализировано');
  }

  update(dt: number): void { void dt; }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  private _seedInitialTechs(): void {
    this.states.clear();
    for (const c of countrySystem.getAll()) {
      const researched: string[] = [];
      // Высокотехнологичные страны на 2000 год имеют часть стартовых технологий
      if (c.militaryTech >= 0.72) researched.push('electronics_1', 'comms_1');
      if (c.militaryTech >= 0.80) researched.push('ground_1', 'air_1', 'industry_1');
      if (c.militaryTech >= 0.88) researched.push('intel_1', 'transport_1');
      this.states.set(c.code, { researched, active: null });
    }
  }

  private _ensureState(code: string): CountryTechState {
    let st = this.states.get(code);
    if (!st) {
      st = { researched: [], active: null };
      this.states.set(code, st);
    }
    return st;
  }

  getCountryTechState(code: string): CountryTechState {
    return this._ensureState(code);
  }

  isResearched(code: string, techId: string): boolean {
    return this._ensureState(code).researched.includes(techId);
  }

  canResearch(code: string, techId: string): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(code);
    const tech = TECH_TREE.find(t => t.id === techId);
    if (!c || !tech) return { ok: false, reason: 'Технология не найдена' };

    const st = this._ensureState(code);
    if (st.researched.includes(techId)) return { ok: false, reason: 'Уже исследовано' };
    if (st.active) return { ok: false, reason: 'Уже идёт исследование другой технологии' };
    if (tech.prereq) {
      for (const req of tech.prereq) {
        if (!st.researched.includes(req)) {
          const reqName = TECH_TREE.find(t => t.id === req)?.name ?? req;
          return { ok: false, reason: `Требуется: ${reqName}` };
        }
      }
    }
    if (c.money < tech.cost) return { ok: false, reason: `Недостаточно средств (${tech.cost} млрд $)` };
    return { ok: true };
  }

  startResearch(code: string, techId: string): { ok: boolean; reason?: string } {
    const check = this.canResearch(code, techId);
    if (!check.ok) return check;
    const c = countrySystem.getCountry(code)!;
    const tech = TECH_TREE.find(t => t.id === techId)!;
    const st = this._ensureState(code);

    c.changeMoney(-tech.cost, `исследование: ${tech.name}`);
    st.active = {
      techId: tech.id,
      progressDays: 0,
      totalDays: tech.days
    };
    eventBus.emit(GameEvents.TECH_STARTED, { country: code, techId: tech.id });
    return { ok: true };
  }

  getCountryBonuses(code: string): AggregatedTechBonuses {
    const st = this._ensureState(code);
    const bonuses: AggregatedTechBonuses = {
      groundPower: 0,
      airPower: 0,
      navalPower: 0,
      orgBonus: 0,
      moraleRecovery: 0,
      supplyEff: 0,
      researchSpeed: 0,
      factoryOutput: 0,
      gdpGrowth: 0,
      intelBonus: 0,
      infraBonus: 0,
      unitSpeed: 0
    };
    for (const id of st.researched) {
      const def = TECH_TREE.find(t => t.id === id);
      if (!def) continue;
      for (const [k, v] of Object.entries(def.effects)) {
        if (typeof v === 'number') {
          (bonuses as any)[k] += v;
        }
      }
    }
    return bonuses;
  }

  private _onDayTick(): void {
    for (const c of countrySystem.getAll()) {
      const st = this._ensureState(c.code);
      if (!st.active) continue;

      const bonuses = this.getCountryBonuses(c.code);
      const speedMult = 1 + bonuses.researchSpeed + (c.militaryTech * 0.25);
      st.active.progressDays += speedMult;

      if (st.active.progressDays >= st.active.totalDays) {
        const tech = TECH_TREE.find(t => t.id === st.active!.techId);
        st.researched.push(st.active.techId);
        st.active = null;
        c.militaryTech = Math.min(1.5, c.militaryTech + 0.035);

        eventBus.emit(GameEvents.TECH_COMPLETED, { country: c.code, techId: tech?.id, techName: tech?.name });
        if (!c.aiControlled && tech) {
          eventBus.emit(GameEvents.NOTIFICATION_ADD, {
            country: c.nameRu,
            text: `Завершено исследование: ${tech.name}`,
            date: gameTime.formatDate('long')
          });
        }
      }
    }
  }

  getState(): Record<string, any> {
    const out: Record<string, CountryTechState> = {};
    for (const [k, v] of this.states.entries()) {
      out[k] = { researched: [...v.researched], active: v.active ? { ...v.active } : null };
    }
    return out;
  }

  setState(s: Record<string, any>): void {
    if (!s || typeof s !== 'object') return;
    this.states.clear();
    for (const [code, val] of Object.entries(s)) {
      if (val && Array.isArray(val.researched)) {
        this.states.set(code, {
          researched: [...val.researched],
          active: val.active ? { ...val.active } : null
        });
      }
    }
  }
}

export const technologySystem = TechnologySystem.getInstance();
