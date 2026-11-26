/* ============================================================
   economy/EconomySystem.ts — экономическая система (Этап 2)
   Бюджет, налоги, ВВП, инфляция, безработица, госдолг, санкции.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { Country } from '../country/Country.js';
import { technologySystem } from '../tech/TechnologySystem.js';

export interface MonthlyBudgetReport {
  taxIncome: number;
  tradeBonus: number;
  militaryUpkeep: number;
  civilUpkeep: number;
  debtInterest: number;
  net: number;
}

export class EconomySystem implements IGameSystem {
  readonly name = 'Economy';
  readonly priority = 40;

  private unsubscribeTick: (() => void) | null = null;

  static instance: EconomySystem;
  static getInstance(): EconomySystem {
    if (!EconomySystem.instance) EconomySystem.instance = new EconomySystem();
    return EconomySystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, (data: { date: { day: number } }) => {
      this._onDayTick(data?.date?.day === 1);
    }).unsubscribe;
    console.log('[EconomySystem] инициализировано');
  }

  update(dt: number): void {
    void dt;
  }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  getMonthlyReport(c: Country): MonthlyBudgetReport {
    const sanctionsPenalty = Math.min(0.45, c.sanctionsFrom.length * 0.08);
    const ministerBonus = c.ministers.economy === 'Реформатор' ? 1.08 : c.ministers.economy === 'Монетарист' ? 1.04 : 1.0;
    const taxIncome = (c.gdp * c.taxRate * (1 - c.corruption * 0.35) * (1 - sanctionsPenalty) * ministerBonus) / 12;
    const tradeBonus = (c.tradePartners.length * 0.015 * c.gdp) / 12;
    const militaryUpkeep = c.militaryBudget / 12;
    const civilUpkeep = (c.gdp * 0.16) / 12;
    const debtInterest = c.debt * 0.005;
    const net = taxIncome + tradeBonus - militaryUpkeep - civilUpkeep - debtInterest;
    return { taxIncome, tradeBonus, militaryUpkeep, civilUpkeep, debtInterest, net };
  }

  private _onDayTick(isNewMonth: boolean): void {
    for (const c of countrySystem.getAll()) {
      const rep = this.getMonthlyReport(c);
      // Ежедневное начисление (1/30 от месячного)
      c.money += rep.net / 30;
      if (c.money < 0) {
        const deficit = -c.money;
        c.debt += deficit;
        c.money = 0;
      }

      if (isNewMonth) {
        // Ежемесячное обновление ВВП, инфляции и безработицы
        const taxDrag = Math.max(0, c.taxRate - 0.25) * 0.08;
        const warDrag = c.warWith.length > 0 ? 0.015 : 0;
        const sanctionDrag = c.sanctionsFrom.length * 0.004;
        const stabFactor = (c.stability - 0.5) * 0.02;
        const tradeBoost = c.tradePartners.length * 0.002;
        const lawBoost = c.laws.includes('industrial_subsidies') ? 0.006 : 0;
        const techBoost = technologySystem.getCountryBonuses(c.code).gdpGrowth;

        const annualGrowth = Math.max(-0.08, Math.min(0.12, 0.028 + stabFactor + tradeBoost + lawBoost + techBoost - taxDrag - warDrag - sanctionDrag));
        c.gdpGrowth = annualGrowth;
        c.gdp = Math.max(5, c.gdp * (1 + annualGrowth / 12));

        // Инфляция и безработица
        const targetUnemp = Math.max(0.02, Math.min(0.35, 0.06 - annualGrowth * 0.5 + warDrag));
        c.unemployment += (targetUnemp - c.unemployment) * 0.08;
        const targetInf = Math.max(-0.01, Math.min(0.25, 0.025 + (c.debt / Math.max(1, c.gdp)) * 0.04 + warDrag * 2));
        c.inflation += (targetInf - c.inflation) * 0.1;

        // Рост населения (~0.5% в год)
        c.population *= 1 + 0.005 / 12;
        c.manpower = Math.min(c.population * 25, c.manpower + c.population * 0.08);
      }
    }
  }

  /* ---------- операции ---------- */
  setTax(countryCode: string, rate: number): void {
    const c = countrySystem.getCountry(countryCode);
    if (!c) return;
    const clamped = Math.max(0.10, Math.min(0.55, rate));
    const diff = clamped - c.taxRate;
    c.taxRate = clamped;
    if (Math.abs(diff) > 0.01) {
      c.publicOpinion = Math.max(0, Math.min(1, c.publicOpinion - diff * 0.4));
    }
    eventBus.emit(GameEvents.BUDGET_UPDATED, { country: countryCode, field: 'tax', value: clamped });
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: countryCode, field: 'taxRate' });
  }

  setMilitarySpending(countryCode: string, amount: number): void {
    const c = countrySystem.getCountry(countryCode);
    if (!c) return;
    c.militaryBudget = Math.max(0.5, amount);
    eventBus.emit(GameEvents.BUDGET_UPDATED, { country: countryCode, field: 'militarySpending', value: c.militaryBudget });
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: countryCode, field: 'militaryBudget' });
  }

  investEconomy(countryCode: string, amount: number): boolean {
    const c = countrySystem.getCountry(countryCode);
    if (!c || c.money < amount || amount <= 0) return false;
    c.changeMoney(-amount, 'инвестиции в экономику');
    c.gdp += amount * 1.35;
    c.unemployment = Math.max(0.015, c.unemployment - 0.005);
    c.publicOpinion = Math.min(1, c.publicOpinion + 0.015);
    eventBus.emit(GameEvents.GDP_CHANGED, { country: countryCode, gdp: c.gdp });
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: countryCode, field: 'gdp' });
    return true;
  }

  takeLoan(countryCode: string, amount: number): boolean {
    const c = countrySystem.getCountry(countryCode);
    if (!c || amount <= 0) return false;
    c.debt += amount;
    c.changeMoney(amount, 'государственный заём');
    c.inflation = Math.min(0.35, c.inflation + 0.003);
    eventBus.emit(GameEvents.BUDGET_UPDATED, { country: countryCode, field: 'debt', value: c.debt });
    return true;
  }

  repayDebt(countryCode: string, amount: number): boolean {
    const c = countrySystem.getCountry(countryCode);
    if (!c || c.debt <= 0) return false;
    const pay = Math.min(c.debt, c.money, amount);
    if (pay <= 0) return false;
    c.debt -= pay;
    c.changeMoney(-pay, 'погашение госдолга');
    eventBus.emit(GameEvents.BUDGET_UPDATED, { country: countryCode, field: 'debt', value: c.debt });
    return true;
  }

  getState(): Record<string, any> {
    return {};
  }
  setState(_s: Record<string, any>): void {}
}

export const economySystem = EconomySystem.getInstance();
