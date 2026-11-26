/* ============================================================
   production/ProductionSystem.ts — военная промышленность (Этап 7)
   Военные и гражданские заводы, очереди производства техники и
   боеприпасов, связь с ресурсами, технологиями и логистикой.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { militarySystem, UnitType, UNIT_META } from '../military/MilitarySystem.js';
import { logisticsSystem } from '../logistics/LogisticsSystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';
import { gameTime } from '../core/GameTime.js';

export type OrderKind = 'unit' | 'ammo_batch' | 'fuel_batch' | 'medical_batch';

export interface ProductionOrder {
  id: string;
  kind: OrderKind;
  label: string;
  unitType?: UnitType;
  progress: number;     // 0..totalWork
  totalWork: number;
  steelCost: number;
}

export interface CountryIndustry {
  militaryFactories: number;
  civilFactories: number;
  queue: ProductionOrder[];
}

export class ProductionSystem implements IGameSystem {
  readonly name = 'Production';
  readonly priority = 48;

  private data = new Map<string, CountryIndustry>();
  private orderCounter = 0;
  private unsubscribeTick: (() => void) | null = null;

  static instance: ProductionSystem;
  static getInstance(): ProductionSystem {
    if (!ProductionSystem.instance) ProductionSystem.instance = new ProductionSystem();
    return ProductionSystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._seedInitialIndustry();
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => {
      this._onDayTick();
    }).unsubscribe;
    console.log('[ProductionSystem] инициализировано');
  }

  update(dt: number): void { void dt; }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  private _seedInitialIndustry(): void {
    this.data.clear();
    this.orderCounter = 0;
    for (const c of countrySystem.getAll()) {
      const milFac = Math.max(1, Math.round(Math.sqrt(c.gdp) * 0.18 + c.militaryTech * 2));
      const civFac = Math.max(2, Math.round(Math.sqrt(c.gdp) * 0.30));
      this.data.set(c.code, {
        militaryFactories: milFac,
        civilFactories: civFac,
        queue: []
      });
    }
  }

  private _ensure(code: string): CountryIndustry {
    let ind = this.data.get(code);
    if (!ind) {
      ind = { militaryFactories: 1, civilFactories: 2, queue: [] };
      this.data.set(code, ind);
    }
    return ind;
  }

  getIndustry(code: string): CountryIndustry {
    return this._ensure(code);
  }

  buildFactory(code: string, type: 'military' | 'civil'): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(code);
    if (!c) return { ok: false, reason: 'Страна не найдена' };
    const cost = type === 'military' ? 24 : 20;
    if (c.money < cost) return { ok: false, reason: `Недостаточно средств (${cost} млрд $)` };
    const ind = this._ensure(code);
    c.changeMoney(-cost, type === 'military' ? 'строительство военного завода' : 'строительство гражданского завода');
    if (type === 'military') {
      ind.militaryFactories += 1;
    } else {
      ind.civilFactories += 1;
      c.gdp += 6;
    }
    eventBus.emit(GameEvents.FACTORY_BUILT, { country: code, type });
    return { ok: true };
  }

  queueOrder(code: string, kind: OrderKind, unitType?: UnitType): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(code);
    if (!c) return { ok: false, reason: 'Страна не найдена' };
    const ind = this._ensure(code);
    if (ind.queue.length >= 6) return { ok: false, reason: 'Очередь производства заполнена (макс. 6)' };

    let label = '';
    let moneyCost = 4;
    let totalWork = 40;
    let steelCost = 5;

    if (kind === 'unit') {
      if (!unitType || !UNIT_META[unitType]) return { ok: false, reason: 'Неизвестный тип войск' };
      const meta = UNIT_META[unitType];
      // Производство через ВПК дешевле прямого срочного найма на 35%
      moneyCost = Math.max(2, Number((meta.cost * 0.65).toFixed(1)));
      totalWork = Math.round(meta.cost * 6);
      steelCost = Math.round(meta.cost * 1.2);
      label = meta.label;
    } else if (kind === 'ammo_batch') {
      label = 'Партия боеприпасов (+120)';
      moneyCost = 5;
      totalWork = 25;
      steelCost = 6;
    } else if (kind === 'fuel_batch') {
      label = 'Синтез и переработка топлива (+140)';
      moneyCost = 4;
      totalWork = 22;
      steelCost = 2;
    } else if (kind === 'medical_batch') {
      label = 'Полевые меднаборы (+120)';
      moneyCost = 3;
      totalWork = 18;
      steelCost = 1;
    }

    if (c.money < moneyCost) return { ok: false, reason: `Недостаточно средств (${moneyCost} млрд $)` };
    c.changeMoney(-moneyCost, `заказ ВПК: ${label}`);

    const order: ProductionOrder = {
      id: `prod_${++this.orderCounter}`,
      kind,
      label,
      unitType,
      progress: 0,
      totalWork,
      steelCost
    };
    ind.queue.push(order);
    eventBus.emit(GameEvents.PRODUCTION_STARTED, { country: code, order });
    return { ok: true };
  }

  cancelOrder(code: string, orderId: string): boolean {
    const ind = this._ensure(code);
    const idx = ind.queue.findIndex(o => o.id === orderId);
    if (idx === -1) return false;
    ind.queue.splice(idx, 1);
    return true;
  }

  private _onDayTick(): void {
    for (const c of countrySystem.getAll()) {
      const ind = this._ensure(c.code);
      if (ind.queue.length === 0) continue;

      const bonuses = technologySystem.getCountryBonuses(c.code);
      const steelFactor = Math.min(1.25, Math.max(0.4, c.resources.steel / 30));
      const dailyWork = ind.militaryFactories * (1 + bonuses.factoryOutput) * steelFactor;

      const current = ind.queue[0]!;
      current.progress += dailyWork;

      if (current.progress >= current.totalWork) {
        ind.queue.shift();
        this._completeOrder(c.code, current);
      }
    }
  }

  private _completeOrder(code: string, order: ProductionOrder): void {
    const c = countrySystem.getCountry(code);
    if (!c) return;

    if (order.kind === 'unit' && order.unitType) {
      const offset = (Math.random() - 0.5) * 1.4;
      const unit = militarySystem.createUnit(
        code,
        order.unitType,
        `${order.label} (${c.tag})`,
        c.capLat + offset,
        c.capLng + offset
      );
      if (!c.aiControlled && unit) {
        eventBus.emit(GameEvents.NOTIFICATION_ADD, {
          country: c.nameRu,
          text: `ВПК выпустил: ${unit.name}`,
          date: gameTime.formatDate('long')
        });
      }
    } else if (order.kind === 'ammo_batch') {
      logisticsSystem.addStockpile(code, 'ammo', 120);
    } else if (order.kind === 'fuel_batch') {
      logisticsSystem.addStockpile(code, 'fuel', 140);
    } else if (order.kind === 'medical_batch') {
      logisticsSystem.addStockpile(code, 'medical', 120);
    }

    eventBus.emit(GameEvents.PRODUCTION_COMPLETED, { country: code, order });
  }

  getState(): Record<string, any> {
    const out: Record<string, CountryIndustry> = {};
    for (const [k, v] of this.data.entries()) {
      out[k] = {
        militaryFactories: v.militaryFactories,
        civilFactories: v.civilFactories,
        queue: v.queue.map(o => ({ ...o }))
      };
    }
    return { data: out, orderCounter: this.orderCounter };
  }

  setState(s: Record<string, any>): void {
    if (!s || !s.data) return;
    this.data.clear();
    this.orderCounter = typeof s.orderCounter === 'number' ? s.orderCounter : 0;
    for (const [k, v] of Object.entries(s.data)) {
      if (v && typeof (v as CountryIndustry).militaryFactories === 'number') {
        this.data.set(k, v as CountryIndustry);
      }
    }
  }
}

export const productionSystem = ProductionSystem.getInstance();
