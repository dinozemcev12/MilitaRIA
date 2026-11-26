/* ============================================================
   intel/IntelSystem.ts — разведка и спецоперации (Этап 7)
   Сбор разведданных о странах, оценка ВПК и логистики, диверсии.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';
import { logisticsSystem } from '../logistics/LogisticsSystem.js';
import { diplomacySystem } from '../diplomacy/DiplomacySystem.js';

export interface IntelRecord {
  targetCode: string;
  level: number;      // 0..1 (уровень осведомлённости)
  lastUpdatedDay: number;
}

export class IntelSystem implements IGameSystem {
  readonly name = 'Intel';
  readonly priority = 65;

  // actorCode -> targetCode -> IntelRecord
  private networks = new Map<string, Map<string, IntelRecord>>();
  private dayCount = 0;
  private unsubscribeTick: (() => void) | null = null;

  static instance: IntelSystem;
  static getInstance(): IntelSystem {
    if (!IntelSystem.instance) IntelSystem.instance = new IntelSystem();
    return IntelSystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this.networks.clear();
    this.dayCount = 0;
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => {
      this.dayCount++;
      // Медленное устаревание разведданных
      if (this.dayCount % 30 === 0) {
        for (const map of this.networks.values()) {
          for (const rec of map.values()) {
            rec.level = Math.max(0.1, rec.level - 0.05);
          }
        }
      }
    }).unsubscribe;
    console.log('[IntelSystem] инициализировано');
  }

  update(dt: number): void { void dt; }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  getIntelLevel(actorCode: string, targetCode: string): number {
    if (actorCode === targetCode) return 1;
    const rec = this.networks.get(actorCode)?.get(targetCode);
    if (rec) return rec.level;
    const actor = countrySystem.getCountry(actorCode);
    if (actor?.allies.includes(targetCode)) return 0.75;
    return 0.2;
  }

  getKnownTargets(actorCode: string): IntelRecord[] {
    const map = this.networks.get(actorCode);
    return map ? Array.from(map.values()).sort((a, b) => b.level - a.level) : [];
  }

  gatherIntel(actorCode: string, targetCode: string): { ok: boolean; level?: number; reason?: string } {
    const actor = countrySystem.getCountry(actorCode);
    const target = countrySystem.getCountry(targetCode);
    if (!actor || !target || actorCode === targetCode) {
      return { ok: false, reason: 'Некорректная цель' };
    }
    const bonuses = technologySystem.getCountryBonuses(actorCode);
    const cost = Math.max(4, Math.round(8 * (1 - bonuses.intelBonus * 0.25)));
    if (actor.money < cost) return { ok: false, reason: `Недостаточно средств (${cost} млрд $)` };

    actor.changeMoney(-cost, `разведоперация: ${target.nameRu}`);
    let map = this.networks.get(actorCode);
    if (!map) {
      map = new Map();
      this.networks.set(actorCode, map);
    }
    const prev = map.get(targetCode)?.level ?? 0.2;
    const gain = 0.35 + bonuses.intelBonus * 0.35;
    const nextLevel = Math.min(1, Number((prev + gain).toFixed(2)));
    map.set(targetCode, { targetCode, level: nextLevel, lastUpdatedDay: this.dayCount });

    eventBus.emit(GameEvents.INTEL_GATHERED, { actor: actorCode, target: targetCode, level: nextLevel });
    return { ok: true, level: nextLevel };
  }

  sabotageSupply(actorCode: string, targetCode: string): { ok: boolean; detected?: boolean; reason?: string } {
    const actor = countrySystem.getCountry(actorCode);
    const target = countrySystem.getCountry(targetCode);
    if (!actor || !target || actorCode === targetCode) {
      return { ok: false, reason: 'Некорректная цель' };
    }
    const cost = 14;
    if (actor.money < cost) return { ok: false, reason: `Недостаточно средств (${cost} млрд $)` };
    actor.changeMoney(-cost, `диверсия против ${target.nameRu}`);

    const bonuses = technologySystem.getCountryBonuses(actorCode);
    const log = logisticsSystem.getLogistics(targetCode);
    const dmg = Math.round(45 + bonuses.intelBonus * 50);
    log.fuel = Math.max(0, log.fuel - dmg);
    log.ammo = Math.max(0, log.ammo - dmg);

    const detected = Math.random() > (0.45 + bonuses.intelBonus * 0.4);
    if (detected) {
      const rel = target.getRelation(actorCode);
      diplomacySystem.setRelation(targetCode, actorCode, Math.max(-1, rel - 0.25));
    }
    eventBus.emit(GameEvents.LOGISTICS_UPDATED, { country: targetCode });
    return { ok: true, detected };
  }

  getState(): Record<string, any> {
    const out: Record<string, IntelRecord[]> = {};
    for (const [actor, map] of this.networks.entries()) {
      out[actor] = Array.from(map.values());
    }
    return { networks: out, dayCount: this.dayCount };
  }

  setState(s: Record<string, any>): void {
    if (!s || !s.networks) return;
    this.networks.clear();
    this.dayCount = typeof s.dayCount === 'number' ? s.dayCount : 0;
    for (const [actor, list] of Object.entries(s.networks)) {
      if (Array.isArray(list)) {
        const m = new Map<string, IntelRecord>();
        for (const rec of list as IntelRecord[]) m.set(rec.targetCode, rec);
        this.networks.set(actor, m);
      }
    }
  }
}

export const intelSystem = IntelSystem.getInstance();
