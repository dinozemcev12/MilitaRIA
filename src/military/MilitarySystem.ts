/* ============================================================
   military/MilitarySystem.ts — стратегическое управление армией (Этап 5)
   Подразделения, наём, перемещение, снабжение, обнаружение столкновений.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';
import { WORLD_CITIES } from '../data/worldGeoFeatures.js';

export type UnitType =
  | 'infantry' | 'mechanized' | 'motorized' | 'tank' | 'artillery'
  | 'recon' | 'engineer' | 'aa' | 'air' | 'naval' | 'airborne';

export type Echelon =
  | 'squad' | 'platoon' | 'company' | 'battalion'
  | 'regiment' | 'brigade' | 'division' | 'corps' | 'army';

export const ECHELON_ORDER: Echelon[] = [
  'squad', 'platoon', 'company', 'battalion', 'regiment', 'brigade', 'division', 'corps', 'army'
];

export const ECHELON_META: Record<Echelon, { label: string; mult: number }> = {
  squad:     { label: 'Отделение', mult: 0.4 },
  platoon:   { label: 'Взвод',     mult: 0.55 },
  company:   { label: 'Рота',      mult: 0.75 },
  battalion: { label: 'Батальон',  mult: 1.0 },
  regiment:  { label: 'Полк',      mult: 1.3 },
  brigade:   { label: 'Бригада',   mult: 1.65 },
  division:  { label: 'Дивизия',   mult: 2.1 },
  corps:     { label: 'Корпус',    mult: 2.6 },
  army:      { label: 'Армия',     mult: 3.2 }
};

export type UnitStance = 'front' | 'attack' | 'defend' | 'reserve';

export const STANCE_META: Record<UnitStance, { label: string; short: string; color: string; desc: string }> = {
  front:   { label: 'Держать фронт', short: 'ФРОНТ',  color: '#38bdf8', desc: 'Закрепляется на линии фронта, копает окопы и не отходит без приказа.' },
  attack:  { label: 'Наступление',   short: 'АТАКА',  color: '#f59e0b', desc: 'Продвигается вперёд по линии наступления, продавливая фронт.' },
  defend:  { label: 'Оборона',       short: 'ОБОРОНА', color: '#22c55e', desc: 'Стоит на месте, максимально ускоряет окопы и восстановление.' },
  reserve: { label: 'Резерв',        short: 'РЕЗЕРВ', color: '#94a3b8', desc: 'Отдыхает в тылу, восстанавливает людей, организацию и снабжение.' }
};

export const COMMANDER_TRAITS: Record<string, { label: string; powerBonus: number; speedBonus: number }> = {
  'Ген.-м. Волков (Штурмовик)': { label: '+12% атака', powerBonus: 0.12, speedBonus: 0 },
  'Ген.-л. Соколов (Манёвр)': { label: '+15% скорость', powerBonus: 0, speedBonus: 0.15 },
  'Полк. Марков (Тактик)': { label: '+8% атака, +8% скорость', powerBonus: 0.08, speedBonus: 0.08 },
  'Ген. Романов (Оборона)': { label: '+15% стойкость', powerBonus: 0.15, speedBonus: 0 }
};

export const UNIT_META: Record<UnitType, { label: string; cost: number; manpower: number; speed: number; power: number }> = {
  infantry: { label: 'Пехотный батальон', cost: 4, manpower: 1, speed: 0.6, power: 10 },
  motorized: { label: 'Мотопехота', cost: 6, manpower: 1, speed: 1.0, power: 13 },
  mechanized: { label: 'Механизированная бригада', cost: 9, manpower: 1.2, speed: 1.1, power: 18 },
  tank: { label: 'Танковый батальон', cost: 14, manpower: 0.8, speed: 1.2, power: 26 },
  artillery: { label: 'Артиллерийский дивизион', cost: 10, manpower: 0.6, speed: 0.7, power: 20 },
  recon: { label: 'Разведбат', cost: 5, manpower: 0.4, speed: 1.5, power: 8 },
  engineer: { label: 'Инженерный батальон', cost: 6, manpower: 0.5, speed: 0.7, power: 9 },
  aa: { label: 'Дивизион ПВО', cost: 9, manpower: 0.5, speed: 0.8, power: 15 },
  air: { label: 'Авиаэскадрилья', cost: 18, manpower: 0.3, speed: 3.5, power: 28 },
  naval: { label: 'Военно-морская группа', cost: 22, manpower: 1.0, speed: 1.8, power: 30 },
  airborne: { label: 'Десантный батальон', cost: 8, manpower: 0.9, speed: 1.4, power: 16 }
};

export interface MilitaryUnit {
  id: string;
  countryCode: string;
  type: UnitType;
  name: string;
  strength: number;      // 0..1000 — боевая готовность
  manpower: number;      // тыс. человек
  maxManpower: number;   // тыс. человек
  morale: number;        // 0..1
  experience: number;    // 0..1
  supply: number;        // 0..1
  organization: number;  // 0..1
  entrenchment: number;  // 0..1 — окопы/подготовленные позиции
  techLevel: number;     // 0..1
  lat: number;
  lng: number;
  targetLat?: number;
  targetLng?: number;
  echelon?: Echelon;
  commander?: string;
  stance?: UnitStance;
  offensiveLine?: { lat: number; lng: number }[];
  frontAnchor?: { lat: number; lng: number };
}

export interface ActiveBattle {
  id: string;
  lat: number;
  lng: number;
  attackerCode: string;
  defenderCode: string;
  attackerUnits: string[];
  defenderUnits: string[];
  ticks: number;
  inTactical: boolean;
}

export class MilitarySystem implements IGameSystem {
  readonly name = 'Military';
  readonly priority = 60;

  private units = new Map<string, MilitaryUnit>();
  private battles = new Map<string, ActiveBattle>();
  private occupiedCities = new Map<string, string>(); // "${countryCode}:${cityName}" -> occupierCode
  private territoryProgress = new Map<string, number>();
  private idCounter = 0;
  private battleCounter = 0;
  private unsubscribeTick: (() => void) | null = null;
  private unsubscribers: (() => void)[] = [];

  static instance: MilitarySystem;
  static getInstance(): MilitarySystem {
    if (!MilitarySystem.instance) MilitarySystem.instance = new MilitarySystem();
    return MilitarySystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._seedStartingUnits();
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => {
      this._onDayTick();
    }).unsubscribe;
    this.unsubscribers.push(
      eventBus.on(GameEvents.TERRITORY_UPDATED, (d: any) => {
        this.territoryProgress.clear();
        const stats = d?.stats ?? {};
        for (const code of Object.keys(stats)) {
          this.territoryProgress.set(code, Number(stats[code]?.progress ?? 0));
        }
      }).unsubscribe,
      eventBus.on(GameEvents.TERRITORY_CAPTURED, (d: any) => {
        if (!d?.owner || !d?.to) return;
        // Синхронизируем городскую оккупацию, чтобы карточки и старые проверки видели фронт.
        for (const city of WORLD_CITIES) {
          if (city.countryCode !== d.owner) continue;
          if (Math.abs(city.lat - d.lat) > 0.75 || Math.abs(city.lng - d.lng) > 0.75) continue;
          this.occupiedCities.set(`${d.owner}:${city.name}`, d.to);
        }
      }).unsubscribe
    );
    console.log(`[MilitarySystem] инициализировано, единиц: ${this.units.size}`);
  }

  update(dt: number): void {
    void dt;
  }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  private _seedStartingUnits(): void {
    this.units.clear();
    this.idCounter = 0;
    for (const c of countrySystem.getAll()) {
      this.createUnit(c.code, 'infantry', `1-й батальон (${c.tag})`, c.capLat, c.capLng);
      this.createUnit(c.code, 'tank', `1-я танковая (${c.tag})`, c.capLat + 0.8, c.capLng + 1.0);
      if (c.gdp > 500) {
        this.createUnit(c.code, 'air', `1-я эскадрилья (${c.tag})`, c.capLat - 0.7, c.capLng - 0.8);
      }
    }
  }

  private _ensureUnitFields(u: MilitaryUnit): void {
    if (u.maxManpower === undefined || u.maxManpower <= 0) {
      const meta = UNIT_META[u.type];
      u.maxManpower = Math.max(0.1, meta.manpower * 10 * ECHELON_META[u.echelon ?? 'battalion'].mult);
    }
    if (u.manpower === undefined || u.manpower <= 0) {
      u.manpower = u.maxManpower * (Math.max(0, u.strength) / 1000);
    }
    u.entrenchment = u.entrenchment ?? 0;
    u.organization = u.organization ?? 0.85;
    u.stance = u.stance ?? 'front';
  }

  private _syncManpower(u: MilitaryUnit): void {
    const ratio = Math.max(0, Math.min(1, u.strength / 1000));
    u.manpower = Math.round(u.maxManpower * ratio * 10) / 10;
  }

  private _onDayTick(): void {
    const unitList = Array.from(this.units.values());
    for (const u of unitList) {
      this._ensureUnitFields(u);
      const c = countrySystem.getCountry(u.countryCode);
      if (!c) continue;
      const bonuses = technologySystem.getCountryBonuses(u.countryCode);

      // Линия наступления: последовательно ведём соединение по точкам.
      if (u.stance === 'attack' && u.offensiveLine && u.offensiveLine.length > 0) {
        const next = u.offensiveLine[0]!;
        const atPoint = Math.hypot(next.lat - u.lat, next.lng - u.lng) < 0.15;
        if (atPoint) {
          u.offensiveLine.shift();
          if (u.offensiveLine.length === 0) {
            u.offensiveLine = undefined;
            u.stance = 'front';
          }
        } else if (u.targetLat === undefined || u.targetLng === undefined) {
          this.orderMove(u.id, next.lat, next.lng);
        }
      }

      const hasTarget = u.targetLat !== undefined && u.targetLng !== undefined;
      if (hasTarget) {
        const dLat = u.targetLat! - u.lat;
        const dLng = u.targetLng! - u.lng;
        const dist = Math.hypot(dLat, dLng);
        const cmdBonus = u.commander ? (COMMANDER_TRAITS[u.commander]?.speedBonus ?? 0) : 0;
        const orgSpeed = 0.45 + u.organization * 0.55;
        const supplySpeedMod = 0.4 + u.supply * 0.6;
        const stanceMod = u.stance === 'reserve' ? 0.7 : u.stance === 'attack' ? 1.15 : 1;
        const speed = (UNIT_META[u.type]?.speed ?? 0.8) * 0.32
          * (1 + bonuses.unitSpeed + cmdBonus) * supplySpeedMod * orgSpeed * stanceMod;
        if (dist <= speed) {
          u.lat = u.targetLat!;
          u.lng = u.targetLng!;
          u.targetLat = undefined;
          u.targetLng = undefined;
          eventBus.emit(GameEvents.UNIT_MOVED, { unitId: u.id, lat: u.lat, lng: u.lng });
        } else {
          u.lat += (dLat / dist) * speed;
          u.lng += (dLng / dist) * speed;
        }
        // Марш изматывает соединение и срывает подготовленные позиции.
        u.organization = Math.max(0.15, u.organization - 0.012);
        u.entrenchment = Math.max(0, u.entrenchment - 0.08);
      } else {
        // Окопы и восстановление на месте.
        const digRate = u.stance === 'defend' ? 0.035 : u.stance === 'front' ? 0.02 : u.stance === 'reserve' ? 0 : 0.008;
        u.entrenchment = Math.min(1, u.entrenchment + digRate);
        u.organization = Math.min(1, u.organization + 0.018 * (1 + bonuses.orgBonus) * (0.5 + u.supply * 0.5));
        if (u.stance !== 'reserve') {
          u.morale = Math.min(1, u.morale + 0.006 * (1 + bonuses.moraleRecovery));
        }
      }

      // Снабжение: чем дальше от столицы и хуже логистика страны, тем ниже.
      const distCap = Math.hypot(u.lat - c.capLat, u.lng - c.capLng);
      const distMod = Math.max(0.25, 1 - distCap / 70);
      const targetSupply = Math.max(0.12, Math.min(1, c.supplyLevel * distMod));
      u.supply = Math.min(1, Math.max(0.08, u.supply + (targetSupply - u.supply) * 0.16));

      // Пополнение людьми из резерва страны.
      if (!hasTarget && u.stance !== 'reserve' && u.supply > 0.45 && c.manpower > 0 && u.strength < 1000) {
        const need = Math.min(u.maxManpower * 0.015, ((1000 - u.strength) / 1000) * u.maxManpower);
        const available = Math.min(need, c.manpower);
        if (available > 0.0001) {
          c.manpower = Math.max(0, c.manpower - available);
          u.strength = Math.min(1000, u.strength + (available / Math.max(0.001, u.maxManpower)) * 1000);
        }
      }

      // Резерв восстанавливается быстрее.
      if (u.stance === 'reserve') {
        u.morale = Math.min(1, u.morale + 0.012 * (1 + bonuses.moraleRecovery));
        u.organization = Math.min(1, u.organization + 0.01);
      }

      this._syncManpower(u);
    }

    // Проверка столкновений враждующих подразделений -> создание/обновление активных битв
    const assigned = new Set<string>();
    for (const b of this.battles.values()) {
      if (b.inTactical) {
        b.attackerUnits.forEach(id => assigned.add(id));
        b.defenderUnits.forEach(id => assigned.add(id));
        continue;
      }
      b.attackerUnits = b.attackerUnits.filter(id => (this.units.get(id)?.strength ?? 0) > 0);
      b.defenderUnits = b.defenderUnits.filter(id => (this.units.get(id)?.strength ?? 0) > 0);
      if (b.attackerUnits.length === 0 || b.defenderUnits.length === 0) {
        this._finishBattle(b);
        continue;
      }
      b.ticks++;
      const uA = this.units.get(b.attackerUnits[0]!)!;
      const uB = this.units.get(b.defenderUnits[0]!)!;
      b.lat = (uA.lat + uB.lat) / 2;
      b.lng = (uA.lng + uB.lng) / 2;
      this._resolveSkirmish(uA, uB, 0.38);
      b.attackerUnits.forEach(id => assigned.add(id));
      b.defenderUnits.forEach(id => assigned.add(id));
    }

    for (let i = 0; i < unitList.length; i++) {
      const a = unitList[i]!;
      if (a.strength <= 0 || assigned.has(a.id)) continue;
      const ca = countrySystem.getCountry(a.countryCode);
      if (!ca || ca.warWith.length === 0) continue;

      for (let j = i + 1; j < unitList.length; j++) {
        const b = unitList[j]!;
        if (b.strength <= 0 || assigned.has(b.id) || !ca.warWith.includes(b.countryCode)) continue;
        const dist = Math.hypot(a.lat - b.lat, a.lng - b.lng);
        if (dist < 1.25) {
          const bid = `battle_${++this.battleCounter}`;
          const atkUnits = unitList.filter(u => u.countryCode === a.countryCode && u.strength > 0 && Math.hypot(u.lat - a.lat, u.lng - a.lng) < 4).map(u => u.id);
          const defUnits = unitList.filter(u => u.countryCode === b.countryCode && u.strength > 0 && Math.hypot(u.lat - b.lat, u.lng - b.lng) < 4).map(u => u.id);
          const battle: ActiveBattle = {
            id: bid,
            lat: (a.lat + b.lat) / 2,
            lng: (a.lng + b.lng) / 2,
            attackerCode: a.countryCode,
            defenderCode: b.countryCode,
            attackerUnits: atkUnits.length ? atkUnits : [a.id],
            defenderUnits: defUnits.length ? defUnits : [b.id],
            ticks: 0,
            inTactical: false
          };
          this.battles.set(bid, battle);
          battle.attackerUnits.forEach(id => assigned.add(id));
          battle.defenderUnits.forEach(id => assigned.add(id));
          eventBus.emit(GameEvents.BATTLE_STARTED, { battle });
          break;
        }
      }
    }

    this._processOccupationAndCapitulation(unitList);
  }

  private _processOccupationAndCapitulation(unitList: MilitaryUnit[]): void {
    const capitulatedPairs = new Set<string>();
    for (const c of countrySystem.getAll()) {
      if (c.warWith.length === 0) {
        if (c.occupationProgress > 0) c.occupationProgress = 0;
        continue;
      }

      // Ключевые точки страны c: её столица + города из WORLD_CITIES
      const points: { key: string; name: string; lat: number; lng: number; isCapital: boolean }[] = [
        { key: `${c.code}:${c.capital}`, name: c.capital, lat: c.capLat, lng: c.capLng, isCapital: true }
      ];
      for (const wc of WORLD_CITIES) {
        if (wc.countryCode === c.code && wc.name !== c.capital) {
          points.push({ key: `${c.code}:${wc.name}`, name: wc.name, lat: wc.lat, lng: wc.lng, isCapital: !!wc.isCapital });
        }
      }

      const defenders = unitList.filter(u => u.strength > 0 && (u.countryCode === c.code || c.allies.includes(u.countryCode)));
      const attackers = unitList.filter(u => u.strength > 0 && c.warWith.includes(u.countryCode));

      for (const pt of points) {
        const enemyNear = attackers.find(u => Math.hypot(u.lat - pt.lat, u.lng - pt.lng) < 0.95);
        const defNear = defenders.some(u => Math.hypot(u.lat - pt.lat, u.lng - pt.lng) < 1.1);

        if (enemyNear && !defNear) {
          const prev = this.occupiedCities.get(pt.key);
          if (prev !== enemyNear.countryCode) {
            this.occupiedCities.set(pt.key, enemyNear.countryCode);
            eventBus.emit(GameEvents.CITY_CAPTURED, {
              city: pt.name,
              countryCode: c.code,
              occupierCode: enemyNear.countryCode,
              isCapital: pt.isCapital
            });
          }
        } else if (defNear && !enemyNear && this.occupiedCities.has(pt.key)) {
          this.occupiedCities.delete(pt.key);
        }
      }

      // Подсчёт прогресса оккупации
      let capCapturedBy: string | null = null;
      let otherCaptured = 0;
      const otherCount = Math.max(0, points.length - 1);
      const occupierCounts = new Map<string, number>();

      for (const pt of points) {
        const occ = this.occupiedCities.get(pt.key);
        if (!occ) continue;
        occupierCounts.set(occ, (occupierCounts.get(occ) ?? 0) + (pt.isCapital ? 3 : 1));
        if (pt.isCapital) capCapturedBy = occ;
        else otherCaptured++;
      }

      let prog = 0;
      if (capCapturedBy) prog += 0.55;
      if (otherCount > 0) prog += 0.45 * (otherCaptured / otherCount);
      else if (capCapturedBy && defenders.length === 0) prog = 1.0;
      else if (capCapturedBy) prog = 0.75;

      // Линия фронта даёт основной вклад: доля потерянных клеток страны.
      prog = Math.max(prog, this.territoryProgress.get(c.code) ?? 0);
      c.occupationProgress = Math.min(1, prog);

      // Проверка капитуляции (>= 65% оккупации или захвачена столица при отсутствии живых войск)
      if ((c.occupationProgress >= 0.65 || (capCapturedBy && defenders.length === 0)) && occupierCounts.size > 0) {
        let topOccupier = capCapturedBy ?? '';
        let bestScore = -1;
        for (const [occ, score] of occupierCounts.entries()) {
          if (score > bestScore) { bestScore = score; topOccupier = occ; }
        }
        const pairKey = `${c.code}:${topOccupier}`;
        if (topOccupier && c.warWith.includes(topOccupier) && !capitulatedPairs.has(pairKey)) {
          capitulatedPairs.add(pairKey);
          eventBus.emit(GameEvents.COUNTRY_CAPITULATED, { loser: c.code, winner: topOccupier });
        }
      }
    }
  }

  private _finishBattle(b: ActiveBattle): void {
    this.battles.delete(b.id);
    const winner = b.attackerUnits.length > 0 ? b.attackerCode : b.defenderCode;
    eventBus.emit(GameEvents.BATTLE_ENDED, { battleId: b.id, winner, attackerCode: b.attackerCode, defenderCode: b.defenderCode });
  }

  private _resolveSkirmish(a: MilitaryUnit, b: MilitaryUnit, intensity = 1.0): void {
    this._ensureUnitFields(a);
    this._ensureUnitFields(b);
    const bonA = technologySystem.getCountryBonuses(a.countryCode);
    const bonB = technologySystem.getCountryBonuses(b.countryCode);
    const techMultA = 1 + (a.type === 'air' ? bonA.airPower : a.type === 'naval' ? bonA.navalPower : bonA.groundPower);
    const techMultB = 1 + (b.type === 'air' ? bonB.airPower : b.type === 'naval' ? bonB.navalPower : bonB.groundPower);

    const echA = ECHELON_META[a.echelon ?? 'battalion'].mult;
    const echB = ECHELON_META[b.echelon ?? 'battalion'].mult;
    const cmdA = 1 + (a.commander ? (COMMANDER_TRAITS[a.commander]?.powerBonus ?? 0) : 0);
    const cmdB = 1 + (b.commander ? (COMMANDER_TRAITS[b.commander]?.powerBonus ?? 0) : 0);
    const orgA = 0.4 + a.organization * 0.6;
    const orgB = 0.4 + b.organization * 0.6;
    const entA = 1 + a.entrenchment * 0.55;
    const entB = 1 + b.entrenchment * 0.55;

    const powA = (UNIT_META[a.type]?.power ?? 10) * echA * cmdA * entA
      * (a.strength / 1000) * (0.5 + a.morale * 0.5) * (0.4 + a.supply * 0.6) * orgA * techMultA;
    const powB = (UNIT_META[b.type]?.power ?? 10) * echB * cmdB * entB
      * (b.strength / 1000) * (0.5 + b.morale * 0.5) * (0.4 + b.supply * 0.6) * orgB * techMultB;
    const dmgToB = Math.round(Math.max(10, powA * 4 * intensity * (0.85 + Math.random() * 0.3)));
    const dmgToA = Math.round(Math.max(10, powB * 4 * intensity * (0.85 + Math.random() * 0.3)));

    a.strength = Math.max(0, a.strength - dmgToA);
    b.strength = Math.max(0, b.strength - dmgToB);
    a.morale = Math.max(0.1, a.morale - dmgToA / 4500);
    b.morale = Math.max(0.1, b.morale - dmgToB / 4500);
    a.organization = Math.max(0.1, a.organization - 0.025);
    b.organization = Math.max(0.1, b.organization - 0.025);
    a.entrenchment = Math.max(0, a.entrenchment - 0.12);
    b.entrenchment = Math.max(0, b.entrenchment - 0.12);
    a.experience = Math.min(1, a.experience + 0.02);
    b.experience = Math.min(1, b.experience + 0.02);
    this._syncManpower(a);
    this._syncManpower(b);

    if (a.strength <= 0) this.units.delete(a.id);
    if (b.strength <= 0) this.units.delete(b.id);
  }

  createUnit(countryCode: string, type: UnitType, name: string, lat: number, lng: number): MilitaryUnit {
    const c = countrySystem.getCountry(countryCode);
    const id = `unit_${++this.idCounter}`;
    const maxManpower = Math.max(0.1, (UNIT_META[type]?.manpower ?? 1) * 10 * ECHELON_META.battalion.mult);
    const unit: MilitaryUnit = {
      id,
      countryCode,
      type,
      name,
      strength: 1000,
      manpower: maxManpower,
      maxManpower,
      morale: 0.85,
      experience: 0.25,
      supply: 1.0,
      organization: 0.9,
      entrenchment: 0,
      techLevel: c ? Math.min(1, c.militaryTech * 0.7) : 0.7,
      lat,
      lng,
      echelon: 'battalion',
      stance: 'front'
    };
    this.units.set(id, unit);
    eventBus.emit(GameEvents.UNIT_CREATED, { unit });
    return unit;
  }

  recruitUnit(countryCode: string, type: UnitType): { ok: boolean; unit?: MilitaryUnit; reason?: string } {
    const c = countrySystem.getCountry(countryCode);
    if (!c) return { ok: false, reason: 'Страна не найдена' };
    const meta = UNIT_META[type];
    const discount = c.laws.includes('martial_readiness') ? 0.8 : 1.0;
    const cost = Math.round(meta.cost * discount * 10) / 10;
    if (c.money < cost) return { ok: false, reason: `Недостаточно средств (нужно ${cost} млрд)` };
    if (c.manpower < meta.manpower) return { ok: false, reason: 'Недостаточно резервистов' };

    c.changeMoney(-cost, `формирование: ${meta.label}`);
    c.manpower -= meta.manpower;
    const count = this.getUnitsByCountry(countryCode).length + 1;
    const jitterLat = (Math.random() - 0.5) * 1.6;
    const jitterLng = (Math.random() - 0.5) * 1.6;
    const unit = this.createUnit(
      countryCode,
      type,
      `${count}-й ${meta.label} (${c.tag})`,
      c.capLat + jitterLat,
      c.capLng + jitterLng
    );
    return { ok: true, unit };
  }

  orderMove(unitId: string, lat: number, lng: number): boolean {
    const u = this.units.get(unitId);
    if (!u) return false;
    this._ensureUnitFields(u);
    u.targetLat = lat;
    u.targetLng = lng;
    u.entrenchment = 0;
    if (u.stance !== 'reserve') u.stance = 'attack';
    return true;
  }

  setStance(unitId: string, stance: UnitStance): boolean {
    const u = this.units.get(unitId);
    if (!u) return false;
    this._ensureUnitFields(u);
    if (u.stance === stance) return true;
    u.stance = stance;
    if (stance === 'reserve' || stance === 'defend') {
      u.offensiveLine = undefined;
      u.targetLat = undefined;
      u.targetLng = undefined;
    }
    eventBus.emit(GameEvents.UNIT_STANCE_CHANGED, { unitId, stance });
    return true;
  }

  setOffensiveLine(unitId: string, points: { lat: number; lng: number }[]): boolean {
    const u = this.units.get(unitId);
    if (!u || points.length === 0) return false;
    this._ensureUnitFields(u);
    u.offensiveLine = points.map(p => ({ lat: p.lat, lng: p.lng }));
    u.stance = 'attack';
    const first = u.offensiveLine[0]!;
    u.targetLat = first.lat;
    u.targetLng = first.lng;
    u.entrenchment = 0;
    eventBus.emit(GameEvents.OFFENSIVE_LINE_SET, { unitId, points: u.offensiveLine });
    eventBus.emit(GameEvents.UNIT_STANCE_CHANGED, { unitId, stance: u.stance });
    return true;
  }

  clearOffensiveLine(unitId: string): boolean {
    const u = this.units.get(unitId);
    if (!u) return false;
    u.offensiveLine = undefined;
    if (u.stance === 'attack') u.stance = 'front';
    eventBus.emit(GameEvents.UNIT_STANCE_CHANGED, { unitId, stance: u.stance });
    return true;
  }

  getStanceCounts(countryCode: string): Record<UnitStance, number> {
    const counts: Record<UnitStance, number> = { front: 0, attack: 0, defend: 0, reserve: 0 };
    for (const u of this.units.values()) {
      if (u.countryCode !== countryCode) continue;
      counts[u.stance ?? 'front']++;
    }
    return counts;
  }

  moveUnit(unitId: string, lat: number, lng: number): boolean {
    return this.orderMove(unitId, lat, lng);
  }

  promoteUnit(unitId: string): { ok: boolean; echelon?: Echelon; reason?: string } {
    const u = this.units.get(unitId);
    if (!u) return { ok: false, reason: 'Подразделение не найдено' };
    const c = countrySystem.getCountry(u.countryCode);
    if (!c) return { ok: false, reason: 'Страна не найдена' };
    const cur = u.echelon ?? 'battalion';
    const idx = ECHELON_ORDER.indexOf(cur);
    if (idx === -1 || idx >= ECHELON_ORDER.length - 1) return { ok: false, reason: 'Максимальный уровень (Армия)' };
    const next = ECHELON_ORDER[idx + 1]!;
    const cost = 6 + idx * 2;
    if (c.money < cost) return { ok: false, reason: `Недостаточно средств (${cost} млрд $)` };
    c.changeMoney(-cost, `укрупнение соединения до: ${ECHELON_META[next].label}`);
    this._ensureUnitFields(u);
    const oldMax = u.maxManpower;
    u.echelon = next;
    const newMax = Math.max(0.1, (UNIT_META[u.type]?.manpower ?? 1) * 10 * ECHELON_META[next].mult);
    const ratio = oldMax > 0 ? u.manpower / oldMax : 1;
    u.maxManpower = newMax;
    u.manpower = Math.min(newMax, newMax * Math.max(0.5, ratio));
    u.strength = Math.min(1000, u.strength + 150);
    this._syncManpower(u);
    return { ok: true, echelon: next };
  }

  assignCommander(unitId: string, commander: string): boolean {
    const u = this.units.get(unitId);
    if (!u) return false;
    u.commander = commander;
    return true;
  }

  mergeUnits(idA: string, idB: string): { ok: boolean; reason?: string } {
    const a = this.units.get(idA);
    const b = this.units.get(idB);
    if (!a || !b || a.id === b.id || a.countryCode !== b.countryCode) {
      return { ok: false, reason: 'Невозможно объединить эти подразделения' };
    }
    this._ensureUnitFields(a);
    this._ensureUnitFields(b);
    a.maxManpower = Math.max(a.maxManpower, b.maxManpower);
    a.manpower = Math.min(a.maxManpower, a.manpower + b.manpower * 0.75);
    a.strength = Math.min(1000, Math.round((a.strength + b.strength) * 0.75));
    a.morale = (a.morale + b.morale) / 2;
    a.experience = Math.max(a.experience, b.experience);
    a.entrenchment = Math.max(a.entrenchment, b.entrenchment);
    this._syncManpower(a);
    this.units.delete(b.id);
    eventBus.emit(GameEvents.UNIT_MERGED, { kept: a.id, removed: b.id });
    return { ok: true };
  }

  getUnit(unitId: string): MilitaryUnit | undefined {
    return this.units.get(unitId);
  }
  getUnitsByCountry(countryCode: string): MilitaryUnit[] {
    return Array.from(this.units.values()).filter((u) => u.countryCode === countryCode);
  }
  getAllUnits(): MilitaryUnit[] {
    return Array.from(this.units.values());
  }
  getActiveBattles(): ActiveBattle[] {
    return Array.from(this.battles.values());
  }
  getBattle(battleId: string): ActiveBattle | undefined {
    return this.battles.get(battleId);
  }
  setBattleTactical(battleId: string, inTactical: boolean): void {
    const b = this.battles.get(battleId);
    if (b) b.inTactical = inTactical;
  }
  removeBattle(battleId: string): void {
    this.battles.delete(battleId);
  }
  getCityOccupier(countryCode: string, cityName: string): string | undefined {
    return this.occupiedCities.get(`${countryCode}:${cityName}`);
  }
  clearOccupiedCities(countryCode: string): void {
    for (const k of Array.from(this.occupiedCities.keys())) {
      if (k.startsWith(`${countryCode}:`)) this.occupiedCities.delete(k);
    }
  }
  disbandCountryUnits(countryCode: string): void {
    for (const [id, u] of this.units.entries()) {
      if (u.countryCode === countryCode) this.units.delete(id);
    }
  }

  getState(): Record<string, any> {
    return {
      units: Array.from(this.units.values()),
      idCounter: this.idCounter,
      occupiedCities: Array.from(this.occupiedCities.entries())
    };
  }

  setState(s: Record<string, any>): void {
    if (!Array.isArray(s.units)) return;
    this.units.clear();
    for (const u of s.units as MilitaryUnit[]) {
      this._ensureUnitFields(u);
      this.units.set(u.id, { ...u });
    }
    this.idCounter = typeof s.idCounter === 'number' ? s.idCounter : this.units.size;
    this.occupiedCities.clear();
    if (Array.isArray(s.occupiedCities)) {
      for (const [k, v] of s.occupiedCities as [string, string][]) {
        this.occupiedCities.set(k, v);
      }
    }
  }
}

export const militarySystem = MilitarySystem.getInstance();
