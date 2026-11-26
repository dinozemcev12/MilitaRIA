/* ============================================================
   logistics/LogisticsSystem.ts — снабжение и логистика (Этап 7)
   Запасы топлива, боеприпасов, продовольствия и медикаментов,
   военные склады, ж/д узлы и инфраструктура, расчёт supplyLevel.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { militarySystem } from '../military/MilitarySystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';

export type SupplyType = 'fuel' | 'ammo' | 'food' | 'medical';

export interface CountryLogistics {
  fuel: number;         // 0..2000
  ammo: number;         // 0..2000
  food: number;         // 0..2000
  medical: number;      // 0..2000
  depots: number;       // военные склады
  railHubs: number;     // ж/д узлы и порты
  infraLevel: number;   // 0.3..2.0 (состояние дорог, ж/д, портов)
  transportCap: number; // пропускная способность транспорта
  dailyNet: {
    fuel: number;
    ammo: number;
    food: number;
    medical: number;
  };
}

export class LogisticsSystem implements IGameSystem {
  readonly name = 'Logistics';
  readonly priority = 55;

  private data = new Map<string, CountryLogistics>();
  private unsubscribeTick: (() => void) | null = null;

  static instance: LogisticsSystem;
  static getInstance(): LogisticsSystem {
    if (!LogisticsSystem.instance) LogisticsSystem.instance = new LogisticsSystem();
    return LogisticsSystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._seedInitialLogistics();
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => {
      this._onDayTick();
    }).unsubscribe;
    console.log('[LogisticsSystem] инициализировано');
  }

  update(dt: number): void { void dt; }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  private _seedInitialLogistics(): void {
    this.data.clear();
    for (const c of countrySystem.getAll()) {
      const scale = Math.max(1, Math.sqrt(c.gdp / 50));
      const infra = Math.min(1.8, Math.max(0.4, 0.5 + c.militaryTech * 0.6));
      this.data.set(c.code, {
        fuel: Math.round(150 + c.resources.oil * 2.2),
        ammo: Math.round(180 + c.resources.steel * 1.8),
        food: Math.round(220 + c.resources.food * 1.5),
        medical: Math.round(140 + scale * 40),
        depots: Math.max(1, Math.round(scale * 1.5)),
        railHubs: Math.max(1, Math.round(scale * 1.2)),
        infraLevel: Number(infra.toFixed(2)),
        transportCap: Math.round(30 + infra * 25 + scale * 10),
        dailyNet: { fuel: 0, ammo: 0, food: 0, medical: 0 }
      });
    }
  }

  private _ensure(code: string): CountryLogistics {
    let l = this.data.get(code);
    if (!l) {
      l = {
        fuel: 150, ammo: 150, food: 200, medical: 120,
        depots: 1, railHubs: 1, infraLevel: 0.7, transportCap: 45,
        dailyNet: { fuel: 0, ammo: 0, food: 0, medical: 0 }
      };
      this.data.set(code, l);
    }
    return l;
  }

  getLogistics(code: string): CountryLogistics {
    return this._ensure(code);
  }

  addStockpile(code: string, type: SupplyType, amount: number): void {
    const l = this._ensure(code);
    const maxCap = 600 + l.depots * 250;
    l[type] = Math.min(maxCap, Math.max(0, l[type] + amount));
  }

  buildDepot(code: string): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(code);
    if (!c) return { ok: false, reason: 'Страна не найдена' };
    const cost = 12;
    if (c.money < cost) return { ok: false, reason: `Недостаточно средств (${cost} млрд $)` };
    const l = this._ensure(code);
    c.changeMoney(-cost, 'строительство военного склада');
    l.depots += 1;
    l.transportCap += 8;
    eventBus.emit(GameEvents.LOGISTICS_UPDATED, { country: code });
    return { ok: true };
  }

  upgradeInfrastructure(code: string): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(code);
    if (!c) return { ok: false, reason: 'Страна не найдена' };
    const l = this._ensure(code);
    if (l.infraLevel >= 2.0) return { ok: false, reason: 'Инфраструктура на максимуме' };
    const cost = 18;
    if (c.money < cost) return { ok: false, reason: `Недостаточно средств (${cost} млрд $)` };
    c.changeMoney(-cost, 'развитие ж/д и дорожной инфраструктуры');
    l.railHubs += 1;
    l.infraLevel = Math.min(2.0, Number((l.infraLevel + 0.12).toFixed(2)));
    l.transportCap += 14;
    c.gdp += 4;
    eventBus.emit(GameEvents.LOGISTICS_UPDATED, { country: code });
    return { ok: true };
  }

  buySupplies(code: string, type: SupplyType, amount: number): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(code);
    if (!c || amount <= 0) return { ok: false, reason: 'Некорректные параметры' };
    const unitPrice = type === 'ammo' ? 0.08 : type === 'fuel' ? 0.06 : 0.05;
    const cost = Number((amount * unitPrice).toFixed(1));
    if (c.money < cost) return { ok: false, reason: `Недостаточно средств (${cost} млрд $)` };
    c.changeMoney(-cost, `закупка снабжения (${type})`);
    this.addStockpile(code, type, amount);
    eventBus.emit(GameEvents.LOGISTICS_UPDATED, { country: code });
    return { ok: true };
  }

  private _onDayTick(): void {
    for (const c of countrySystem.getAll()) {
      const l = this._ensure(c.code);
      const bonuses = technologySystem.getCountryBonuses(c.code);
      const units = militarySystem.getUnitsByCountry(c.code);
      const atWar = c.warWith.length > 0;
      const movingCount = units.filter(u => u.targetLat !== undefined).length;

      // Производство ресурсов в день
      const effInfra = l.infraLevel + bonuses.infraBonus;
      const prodFuel = (c.resources.oil * 0.08 + 2) * (1 + bonuses.factoryOutput * 0.5);
      const prodAmmo = (c.resources.steel * 0.06 + c.militaryBudget * 0.15 + 1.5) * (1 + bonuses.factoryOutput);
      const prodFood = (c.resources.food * 0.06 + 3);
      const prodMed = (2.0 + c.gdp * 0.004) * (1 + bonuses.moraleRecovery * 0.4);

      // Потребление армией
      const unitCount = units.length;
      const supplyDiscount = Math.max(0.55, 1 - bonuses.supplyEff * 0.35);
      const consFuel = (unitCount * 0.9 + movingCount * 1.4 + (atWar ? unitCount * 0.8 : 0)) * supplyDiscount;
      const consAmmo = (unitCount * 0.4 + (atWar ? unitCount * 1.8 : 0)) * supplyDiscount;
      const consFood = (unitCount * 0.8 + c.population * 0.02);
      const consMed = (unitCount * 0.3 + (atWar ? unitCount * 1.1 : 0));

      l.dailyNet = {
        fuel: Number((prodFuel - consFuel).toFixed(1)),
        ammo: Number((prodAmmo - consAmmo).toFixed(1)),
        food: Number((prodFood - consFood).toFixed(1)),
        medical: Number((prodMed - consMed).toFixed(1))
      };

      const maxCap = 600 + l.depots * 250;
      l.fuel = Math.min(maxCap, Math.max(0, l.fuel + l.dailyNet.fuel));
      l.ammo = Math.min(maxCap, Math.max(0, l.ammo + l.dailyNet.ammo));
      l.food = Math.min(maxCap, Math.max(0, l.food + l.dailyNet.food));
      l.medical = Math.min(maxCap, Math.max(0, l.medical + l.dailyNet.medical));

      // Расчёт итогового уровня снабжения страны (0.15..1.0)
      const fuelFactor = Math.min(1, l.fuel / Math.max(20, unitCount * 6));
      const ammoFactor = Math.min(1, l.ammo / Math.max(20, unitCount * 5));
      const foodFactor = Math.min(1, l.food / Math.max(30, unitCount * 5));
      const medFactor = Math.min(1, l.medical / Math.max(15, unitCount * 4));
      const transportLoad = unitCount * 5;
      const transportFactor = Math.min(1, (l.transportCap * effInfra) / Math.max(10, transportLoad));

      const rawSupply =
        fuelFactor * 0.28 +
        ammoFactor * 0.28 +
        foodFactor * 0.16 +
        medFactor * 0.12 +
        transportFactor * 0.16;

      c.supplyLevel = Number(Math.max(0.15, Math.min(1.0, rawSupply + bonuses.supplyEff * 0.1)).toFixed(2));
    }
  }

  getState(): Record<string, any> {
    const out: Record<string, CountryLogistics> = {};
    for (const [k, v] of this.data.entries()) {
      out[k] = { ...v, dailyNet: { ...v.dailyNet } };
    }
    return out;
  }

  setState(s: Record<string, any>): void {
    if (!s || typeof s !== 'object') return;
    this.data.clear();
    for (const [k, v] of Object.entries(s)) {
      if (v && typeof v.fuel === 'number') {
        this.data.set(k, v as CountryLogistics);
      }
    }
  }
}

export const logisticsSystem = LogisticsSystem.getInstance();
