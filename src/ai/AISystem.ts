/* ============================================================
   ai/AISystem.ts — ИИ государств (Этап 3)
   Каждая страна принимает решения на основе своих интересов и личности.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { Country } from '../country/Country.js';
import { diplomacySystem } from '../diplomacy/DiplomacySystem.js';
import { economySystem } from '../economy/EconomySystem.js';
import { politicsSystem } from '../politics/PoliticsSystem.js';
import { militarySystem } from '../military/MilitarySystem.js';
import { territorySystem } from '../military/TerritorySystem.js';
import { technologySystem, TECH_TREE } from '../tech/TechnologySystem.js';
import { productionSystem } from '../production/ProductionSystem.js';
import { logisticsSystem } from '../logistics/LogisticsSystem.js';
import { gameTime } from '../core/GameTime.js';

type AIPersonality = 'aggressive' | 'defensive' | 'neutral' | 'expansionist';

interface AIState {
  code: string;
  personality: AIPersonality;
  focus: 'economy' | 'military' | 'diplomacy' | 'politics';
}

export class AISystem implements IGameSystem {
  readonly name = 'AI';
  readonly priority = 90;

  private aiStates = new Map<string, AIState>();
  private dayCounter = 0;
  private unsubscribeTick: (() => void) | null = null;

  static instance: AISystem;
  static getInstance(): AISystem {
    if (!AISystem.instance) AISystem.instance = new AISystem();
    return AISystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._assignPersonalities();
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => {
      this.dayCounter++;
      if (this.dayCounter % 3 === 0) {
        for (const c of countrySystem.getAll()) {
          if (!c.aiControlled || c.warWith.length === 0) continue;
          this._commandWarUnits(c);
        }
      }
      if (this.dayCounter % 15 === 0) {
        for (const c of countrySystem.getAll()) {
          if (!c.aiControlled) continue;
          this._decide(c);
        }
      }
    }).unsubscribe;
    console.log('[AISystem] инициализировано');
  }

  update(dt: number): void {
    void dt;
  }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  private _assignPersonalities(): void {
    const presets: Record<string, { personality: AIPersonality; focus: AIState['focus'] }> = {
      USA: { personality: 'expansionist', focus: 'military' },
      RUS: { personality: 'defensive', focus: 'military' },
      CHN: { personality: 'expansionist', focus: 'economy' },
      DEU: { personality: 'neutral', focus: 'economy' },
      GBR: { personality: 'neutral', focus: 'diplomacy' },
      FRA: { personality: 'neutral', focus: 'diplomacy' },
      UKR: { personality: 'defensive', focus: 'economy' },
      PRK: { personality: 'aggressive', focus: 'military' },
      IRQ: { personality: 'aggressive', focus: 'military' },
      IRN: { personality: 'defensive', focus: 'military' },
      BRA: { personality: 'neutral', focus: 'politics' }
    };
    for (const c of countrySystem.getAll()) {
      const p = presets[c.code] ?? { personality: 'neutral', focus: 'economy' };
      this.aiStates.set(c.code, { code: c.code, personality: p.personality, focus: p.focus });
    }
  }

  private _commandWarUnits(c: Country): void {
    const ai = this.aiStates.get(c.code);
    const myUnits = militarySystem.getUnitsByCountry(c.code).filter(u => u.strength > 0);
    if (!myUnits.length) return;
    const enemyCodes = c.warWith;
    const enemyUnits = militarySystem.getAllUnits().filter(u => u.strength > 0 && enemyCodes.includes(u.countryCode));
    const enemyCap = countrySystem.getCountry(enemyCodes[0] ?? '');

    // Линия фронта: ИИ распределяет соединения по клеткам, а не гоняет всех в одну точку.
    const front = territorySystem.getFrontCells(c.code)
      .filter(cell => cell.owner !== c.code || cell.controller !== c.code)
      .sort((a, b) => a.defense - b.defense);

    const assigned = new Set<number>();
    const aggressive = ai?.personality === 'aggressive' || ai?.personality === 'expansionist';

    for (let i = 0; i < myUnits.length; i++) {
      const u = myUnits[i]!;
      if (u.targetLat !== undefined && u.targetLng !== undefined) continue;

      // Один отряд остаётся прикрывать столицу, если враг близко
      if (i === 0 && myUnits.length > 1) {
        const threat = enemyUnits.some(e => Math.hypot(e.lat - c.capLat, e.lng - c.capLng) < 14);
        if (threat) {
          militarySystem.setStance(u.id, 'defend');
          militarySystem.orderMove(u.id, c.capLat, c.capLng);
          continue;
        }
      }

      if (front.length > 0) {
        // Атакующие ищут слабейшую ещё не занятую клетку, обороняющиеся — ближайшую к себе.
        let pick = front.find(cell => !assigned.has(cell.index) && (aggressive ? cell.defense < 60 : true));
        if (!pick) pick = front.find(cell => !assigned.has(cell.index));
        if (!pick) pick = front[0]!;
        assigned.add(pick.index);

        const dist = Math.hypot(pick.lat - u.lat, pick.lng - u.lng);
        const shouldAttack = aggressive || pick.defense < 25;
        militarySystem.setStance(u.id, shouldAttack ? 'attack' : 'front');
        if (dist > 1.5) {
          if (shouldAttack) {
            // Строим линию наступления: текущая позиция -> промежуточная -> цель
            const midLat = u.lat + (pick.lat - u.lat) * 0.4;
            const midLng = u.lng + (pick.lng - u.lng) * 0.4;
            militarySystem.setOffensiveLine(u.id, [
              { lat: midLat, lng: midLng },
              { lat: pick.lat, lng: pick.lng }
            ]);
          } else {
            militarySystem.orderMove(u.id, pick.lat, pick.lng);
          }
        }
        continue;
      }

      if (enemyUnits.length > 0) {
        let nearest = enemyUnits[0]!;
        let bestD = Infinity;
        for (const e of enemyUnits) {
          const d = Math.hypot(e.lat - u.lat, e.lng - u.lng);
          if (d < bestD) { bestD = d; nearest = e; }
        }
        militarySystem.setStance(u.id, 'attack');
        const midLat = u.lat + (nearest.lat - u.lat) * 0.5;
        const midLng = u.lng + (nearest.lng - u.lng) * 0.5;
        militarySystem.setOffensiveLine(u.id, [
          { lat: midLat, lng: midLng },
          { lat: nearest.lat, lng: nearest.lng }
        ]);
      } else if (enemyCap) {
        militarySystem.setStance(u.id, 'attack');
        const midLat = u.lat + (enemyCap.capLat - u.lat) * 0.5;
        const midLng = u.lng + (enemyCap.capLng - u.lng) * 0.5;
        militarySystem.setOffensiveLine(u.id, [
          { lat: midLat, lng: midLng },
          { lat: enemyCap.capLat, lng: enemyCap.capLng }
        ]);
      }
    }
  }

  private _decide(c: Country): void {
    const ai = this.aiStates.get(c.code);
    if (!ai) return;

    if (c.stability < 0.45) ai.focus = 'politics';
    else if (c.warWith.length > 0) ai.focus = 'military';
    else if (c.money > c.gdp * 0.15) ai.focus = 'economy';

    // Политические решения
    if (ai.focus === 'politics' && c.corruption > 0.35 && c.money > 20) {
      politicsSystem.fightCorruption(c.code);
    }

    // Экономические решения
    if (ai.focus === 'economy' && c.money > 40) {
      economySystem.investEconomy(c.code, Math.min(30, c.money * 0.2));
    }

    // Военные решения и ВПК
    const units = militarySystem.getUnitsByCountry(c.code);
    if ((ai.focus === 'military' || units.length < 3) && c.money > 25 && Math.random() < 0.35) {
      const type = c.money > 40 ? 'tank' : 'infantry';
      if (productionSystem.getIndustry(c.code).queue.length < 3) {
        productionSystem.queueOrder(c.code, 'unit', type);
      } else {
        militarySystem.recruitUnit(c.code, type);
      }
    }

    // Исследования ИИ
    const techSt = technologySystem.getCountryTechState(c.code);
    if (!techSt.active && c.money > 30 && Math.random() < 0.4) {
      const available = TECH_TREE.filter(t => technologySystem.canResearch(c.code, t.id).ok);
      if (available.length > 0) {
        const pick = available[Math.floor(Math.random() * available.length)]!;
        technologySystem.startResearch(c.code, pick.id);
      }
    }

    // Логистика ИИ (если снабжение просело)
    const log = logisticsSystem.getLogistics(c.code);
    if (c.supplyLevel < 0.6 && c.money > 15) {
      if (log.fuel < 40) logisticsSystem.buySupplies(c.code, 'fuel', 80);
      else if (log.ammo < 40) logisticsSystem.buySupplies(c.code, 'ammo', 80);
      else if (Math.random() < 0.3) logisticsSystem.buildDepot(c.code);
    }

    // Дипломатия и торговля
    if (Math.random() < 0.18) {
      const others = countrySystem.getAll().filter((x) => x.code !== c.code);
      const target = others[Math.floor(Math.random() * others.length)];
      if (target) {
        const rel = c.getRelation(target.code);
        if (rel > 0.3 && !c.tradePartners.includes(target.code) && Math.random() < 0.3) {
          const res = diplomacySystem.signTradeDeal(c.code, target.code);
          if (res.ok) {
            eventBus.emit(GameEvents.NOTIFICATION_ADD, {
              country: c.nameRu,
              text: `Подписано торговое соглашение с ${target.nameRu}.`,
              date: gameTime.formatDate('long')
            });
          }
        } else if (rel < -0.75 && ai.personality === 'aggressive' && c.warWith.length === 0 && Math.random() < 0.05) {
          diplomacySystem.declareWar(c.code, target.code);
          eventBus.emit(GameEvents.NOTIFICATION_ADD, {
            country: c.nameRu,
            text: `Объявлена война государству ${target.nameRu}!`,
            date: gameTime.formatDate('long')
          });
        } else {
          const drift = (Math.random() - 0.48) * 0.06;
          diplomacySystem.setRelation(c.code, target.code, Math.min(1, Math.max(-1, rel + drift)));
        }
      }
    }

    eventBus.emit(GameEvents.AI_DECISION_MADE, { country: c.code, focus: ai.focus });
  }

  getState(): Record<string, any> {
    return { aiStates: Array.from(this.aiStates.values()), dayCounter: this.dayCounter };
  }
  setState(s: Record<string, any>): void {
    if (Array.isArray(s.aiStates)) {
      this.aiStates.clear();
      for (const st of s.aiStates as AIState[]) this.aiStates.set(st.code, st);
    }
    if (typeof s.dayCounter === 'number') this.dayCounter = s.dayCounter;
  }
}

export const aiSystem = AISystem.getInstance();
