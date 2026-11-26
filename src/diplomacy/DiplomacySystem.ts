/* ============================================================
   diplomacy/DiplomacySystem.ts — дипломатия (Этап 3)
   Исторические отношения 2000 года, союзы, санкции, торговля, война/мир.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { militarySystem } from '../military/MilitarySystem.js';

export interface InternationalOrg {
  id: string;
  name: string;
  type: 'military' | 'economic' | 'political';
  members: string[];
  desc: string;
}

export interface TerritorialDispute {
  id: string;
  regionName: string;
  claimant: string; // претендент
  holder: string;   // текущий владелец
  tension: number;  // 0..1
}

export class DiplomacySystem implements IGameSystem {
  readonly name = 'Diplomacy';
  readonly priority = 50;

  private orgs: InternationalOrg[] = [];
  private disputes: TerritorialDispute[] = [];
  private disputeCounter = 0;

  static instance: DiplomacySystem;
  static getInstance(): DiplomacySystem {
    if (!DiplomacySystem.instance) DiplomacySystem.instance = new DiplomacySystem();
    return DiplomacySystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._initHistorical2000();
    console.log('[DiplomacySystem] инициализировано');
  }

  update(dt: number): void {
    void dt;
  }

  shutdown(): void {}

  private _initHistorical2000(): void {
    const all = countrySystem.getAll();
    for (const a of all) {
      for (const b of all) {
        if (a.code === b.code) continue;
        a.relations[b.code] = a.ideology === b.ideology ? 0.15 : -0.05;
      }
    }

    // НАТО и западные союзники на 2000 год
    const nato = ['USA', 'GBR', 'FRA', 'DEU', 'POL', 'TUR', 'CAN', 'ESP', 'ITA'];
    for (let i = 0; i < nato.length; i++) {
      for (let j = i + 1; j < nato.length; j++) {
        this._seedAlliance(nato[i]!, nato[j]!, 0.72);
      }
    }
    this._seedAlliance('USA', 'JPN', 0.75);
    this._seedAlliance('USA', 'KOR', 0.75);
    this._seedAlliance('USA', 'AUS', 0.78);
    this._seedAlliance('USA', 'ISR', 0.80);
    this._seedAlliance('RUS', 'KZK', 0.65);

    // Историческая напряжённость 2000 года
    this._seedTension('USA', 'IRQ', -0.85);
    this._seedTension('USA', 'IRN', -0.75);
    this._seedTension('USA', 'PRK', -0.80);
    this._seedTension('PRK', 'KOR', -0.85);
    this._seedTension('ISR', 'IRN', -0.90);
    this._seedTension('ISR', 'IRQ', -0.85);
    this._seedTension('IND', 'CHN', -0.25);
    this._seedTension('RUS', 'USA', -0.20);
    this._seedTension('CHN', 'USA', -0.15);
    this._seedTension('UKR', 'RUS', 0.25);

    // Международные организации (2000 год)
    this.orgs = [
      { id: 'un_sc', name: 'Совбез ООН', type: 'political', members: ['USA', 'RUS', 'CHN', 'GBR', 'FRA'], desc: 'Постоянные члены Совета Безопасности ООН' },
      { id: 'nato', name: 'НАТО', type: 'military', members: ['USA', 'GBR', 'FRA', 'DEU', 'POL', 'TUR', 'CAN', 'ESP', 'ITA'], desc: 'Североатлантический альянс коллективной обороны' },
      { id: 'eu', name: 'Европейский Союз', type: 'economic', members: ['DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'SWE', 'AUT', 'PRT', 'GRC', 'FIN', 'IRL', 'DNK'], desc: 'Единый европейский рынок и политический союз' },
      { id: 'csto', name: 'ОДКБ', type: 'military', members: ['RUS', 'BLR', 'KZK', 'ARM', 'KGZ', 'TJK'], desc: 'Организация Договора о коллективной безопасности' },
      { id: 'arab_league', name: 'ЛАГ', type: 'political', members: ['EGY', 'SAU', 'IRQ', 'SYR', 'JOR', 'DZA', 'MAR', 'TUN', 'LBY'], desc: 'Лига арабских государств' },
      { id: 'apec', name: 'АТЭС', type: 'economic', members: ['USA', 'CHN', 'JPN', 'KOR', 'AUS', 'CAN', 'RUS', 'IDN', 'MEX'], desc: 'Азиатско-Тихоокеанское экономическое сотрудничество' }
    ];

    // Территориальные споры (2000 год)
    this.disputes = [
      { id: 'disp_1', regionName: 'Кашмир', claimant: 'PAK', holder: 'IND', tension: 0.75 },
      { id: 'disp_2', regionName: 'Голанские высоты', claimant: 'SYR', holder: 'ISR', tension: 0.70 },
      { id: 'disp_3', regionName: 'Курильские острова', claimant: 'JPN', holder: 'RUS', tension: 0.40 },
      { id: 'disp_4', regionName: 'Фолклендские острова', claimant: 'ARG', holder: 'GBR', tension: 0.35 },
      { id: 'disp_5', regionName: 'Тайваньский пролив', claimant: 'CHN', holder: 'TWN', tension: 0.65 }
    ];
    this.disputeCounter = 5;
  }

  private _seedAlliance(codeA: string, codeB: string, rel: number): void {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return;
    if (!a.allies.includes(codeB)) a.allies.push(codeB);
    if (!b.allies.includes(codeA)) b.allies.push(codeA);
    a.relations[codeB] = rel;
    b.relations[codeA] = rel;
  }

  private _seedTension(codeA: string, codeB: string, rel: number): void {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return;
    a.relations[codeB] = rel;
    b.relations[codeA] = rel;
  }

  setRelation(codeA: string, codeB: string, value: number): void {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return;
    a.setRelation(codeB, value);
    b.setRelation(codeA, value);
  }

  improveRelations(codeA: string, codeB: string): boolean {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b || a.money < 5 || a.warWith.includes(codeB)) return false;
    a.changeMoney(-5, `дипломатическая миссия в ${b.nameRu}`);
    const next = Math.min(1, a.getRelation(codeB) + 0.15);
    this.setRelation(codeA, codeB, next);
    return true;
  }

  signTradeDeal(codeA: string, codeB: string): { ok: boolean; reason?: string } {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return { ok: false, reason: 'Страна не найдена' };
    if (a.warWith.includes(codeB)) return { ok: false, reason: 'Невозможно при войне' };
    if (a.tradePartners.includes(codeB)) return { ok: false, reason: 'Соглашение уже действует' };
    if (a.getRelation(codeB) < -0.1) return { ok: false, reason: 'Отношения слишком плохие (нужно ≥ -10%)' };

    a.tradePartners.push(codeB);
    b.tradePartners.push(codeA);
    this.setRelation(codeA, codeB, Math.min(1, a.getRelation(codeB) + 0.1));
    eventBus.emit(GameEvents.TRADE_DEAL_SIGNED, { countryA: codeA, countryB: codeB });
    return { ok: true };
  }

  imposeSanctions(codeA: string, codeB: string): { ok: boolean; reason?: string } {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return { ok: false, reason: 'Страна не найдена' };
    if (b.sanctionsFrom.includes(codeA)) return { ok: false, reason: 'Санкции уже действуют' };

    b.sanctionsFrom.push(codeA);
    a.tradePartners = a.tradePartners.filter((x) => x !== codeB);
    b.tradePartners = b.tradePartners.filter((x) => x !== codeA);
    this.setRelation(codeA, codeB, Math.max(-1, a.getRelation(codeB) - 0.3));
    eventBus.emit(GameEvents.SANCTIONS_IMPOSED, { from: codeA, target: codeB });
    return { ok: true };
  }

  liftSanctions(codeA: string, codeB: string): boolean {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return false;
    b.sanctionsFrom = b.sanctionsFrom.filter((x) => x !== codeA);
    this.setRelation(codeA, codeB, Math.min(1, a.getRelation(codeB) + 0.1));
    return true;
  }

  declareWar(codeA: string, codeB: string): { ok: boolean; reason?: string } {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return { ok: false, reason: 'Страна не найдена' };
    if (a.warWith.includes(codeB)) return { ok: false, reason: 'Война уже идёт' };

    a.warWith.push(codeB);
    b.warWith.push(codeA);
    a.allies = a.allies.filter((x) => x !== codeB);
    b.allies = b.allies.filter((x) => x !== codeA);
    a.tradePartners = a.tradePartners.filter((x) => x !== codeB);
    b.tradePartners = b.tradePartners.filter((x) => x !== codeA);
    a.setRelation(codeB, -1);
    b.setRelation(codeA, -1);
    a.changeStability(-0.08, `война с ${b.nameRu}`);
    b.changeStability(-0.05, `нападение ${a.nameRu}`);

    eventBus.emit(GameEvents.WAR_DECLARED, { attacker: codeA, defender: codeB });
    return { ok: true };
  }

  signPeace(codeA: string, codeB: string): void {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return;
    a.warWith = a.warWith.filter((c) => c !== codeB);
    b.warWith = b.warWith.filter((c) => c !== codeA);
    a.occupationProgress = 0;
    b.occupationProgress = 0;
    militarySystem.clearOccupiedCities(codeA);
    militarySystem.clearOccupiedCities(codeB);
    this.setRelation(codeA, codeB, -0.2);
    a.changeStability(0.05, `мир с ${b.nameRu}`);
    b.changeStability(0.05, `мир с ${a.nameRu}`);
    eventBus.emit(GameEvents.PEACE_SIGNED, { countryA: codeA, countryB: codeB });
  }

  capitulate(loserCode: string, winnerCode: string, mode: 'occupy' | 'regime_change' = 'occupy'): { ok: boolean; reparations: number } {
    const loser = countrySystem.getCountry(loserCode);
    const winner = countrySystem.getCountry(winnerCode);
    if (!loser || !winner) return { ok: false, reparations: 0 };

    // Завершаем войну со всеми или с победителем
    loser.warWith = loser.warWith.filter(c => c !== winnerCode);
    winner.warWith = winner.warWith.filter(c => c !== loserCode);
    loser.occupationProgress = 0;
    militarySystem.clearOccupiedCities(loserCode);

    const reparations = Math.max(5, Math.round(Math.max(0, loser.money) * (mode === 'occupy' ? 0.4 : 0.25)));
    loser.changeMoney(-reparations, `репарации в пользу ${winner.nameRu}`);
    winner.changeMoney(reparations, `репарации от ${loser.nameRu}`);

    if (mode === 'occupy') {
      loser.occupiedBy = winnerCode;
      loser.ideology = winner.ideology;
      loser.changeStability(-0.18, `оккупация (${winner.nameRu})`);
      winner.changeStability(0.06, `победа над ${loser.nameRu}`);
      militarySystem.disbandCountryUnits(loserCode);
      this.setRelation(loserCode, winnerCode, -0.5);
    } else {
      loser.occupiedBy = null;
      loser.ideology = winner.ideology;
      loser.government = winner.government;
      loser.changeStability(-0.08, `смена режима (${winner.nameRu})`);
      winner.changeStability(0.05, `победа над ${loser.nameRu}`);
      this.setRelation(loserCode, winnerCode, 0.35);
    }

    eventBus.emit(GameEvents.PEACE_SIGNED, { countryA: winnerCode, countryB: loserCode, capitulation: mode });
    return { ok: true, reparations };
  }

  liberateCountry(code: string): boolean {
    const c = countrySystem.getCountry(code);
    if (!c || !c.occupiedBy) return false;
    c.occupiedBy = null;
    c.occupationProgress = 0;
    militarySystem.clearOccupiedCities(code);
    c.changeStability(0.12, 'освобождение от оккупации');
    return true;
  }

  formAlliance(codeA: string, codeB: string): { ok: boolean; reason?: string } {
    const a = countrySystem.getCountry(codeA);
    const b = countrySystem.getCountry(codeB);
    if (!a || !b) return { ok: false, reason: 'Страна не найдена' };
    if (a.warWith.includes(codeB)) return { ok: false, reason: 'Идёт война' };
    if (a.allies.includes(codeB)) return { ok: false, reason: 'Союз уже заключён' };
    if (a.getRelation(codeB) < 0.25) return { ok: false, reason: 'Нужны отношения ≥ +25%' };

    a.allies.push(codeB);
    b.allies.push(codeA);
    this.setRelation(codeA, codeB, Math.max(0.8, a.getRelation(codeB)));
    eventBus.emit(GameEvents.ALLIANCE_FORMED, { countryA: codeA, countryB: codeB });
    return { ok: true };
  }

  /* ---------- Международные организации ---------- */
  getOrganizations(): InternationalOrg[] {
    return this.orgs;
  }

  getCountryOrgs(code: string): InternationalOrg[] {
    return this.orgs.filter(o => o.members.includes(code));
  }

  joinOrganization(code: string, orgId: string): { ok: boolean; reason?: string } {
    const c = countrySystem.getCountry(code);
    const org = this.orgs.find(o => o.id === orgId);
    if (!c || !org) return { ok: false, reason: 'Организация не найдена' };
    if (org.members.includes(code)) return { ok: false, reason: 'Государство уже состоит в организации' };
    if (org.id === 'un_sc') return { ok: false, reason: 'Состав постоянных членов Совбеза ООН фиксирован' };

    const avgRel = org.members.reduce((sum, m) => sum + c.getRelation(m), 0) / Math.max(1, org.members.length);
    if (avgRel < 0.05) return { ok: false, reason: 'Недостаточно хорошие отношения с членами организации' };
    if (c.money < 10) return { ok: false, reason: 'Требуется 10 млрд $ на вступление' };

    c.changeMoney(-10, `вступление в ${org.name}`);
    org.members.push(code);
    if (org.type === 'economic') {
      for (const m of org.members.slice(0, 4)) {
        if (m !== code && !c.tradePartners.includes(m)) c.tradePartners.push(m);
      }
    }
    return { ok: true };
  }

  leaveOrganization(code: string, orgId: string): boolean {
    const org = this.orgs.find(o => o.id === orgId);
    if (!org || !org.members.includes(code)) return false;
    org.members = org.members.filter(m => m !== code);
    return true;
  }

  /* ---------- Территориальные споры ---------- */
  getDisputes(code?: string): TerritorialDispute[] {
    if (!code) return this.disputes;
    return this.disputes.filter(d => d.claimant === code || d.holder === code);
  }

  createDispute(claimant: string, holder: string, regionName: string): { ok: boolean; reason?: string } {
    const a = countrySystem.getCountry(claimant);
    const b = countrySystem.getCountry(holder);
    if (!a || !b || claimant === holder) return { ok: false, reason: 'Некорректные стороны' };
    const clean = regionName.trim() || `Приграничный регион (${b.tag})`;
    this.disputes.push({
      id: `disp_${++this.disputeCounter}`,
      regionName: clean,
      claimant,
      holder,
      tension: 0.55
    });
    this.setRelation(claimant, holder, Math.max(-1, a.getRelation(holder) - 0.25));
    return { ok: true };
  }

  resolveDispute(disputeId: string, actorCode: string, mode: 'negotiate' | 'escalate'): { ok: boolean; reason?: string } {
    const idx = this.disputes.findIndex(d => d.id === disputeId);
    if (idx === -1) return { ok: false, reason: 'Спор не найден' };
    const d = this.disputes[idx]!;
    const other = d.claimant === actorCode ? d.holder : d.claimant;
    const actor = countrySystem.getCountry(actorCode);
    if (!actor) return { ok: false, reason: 'Страна не найдена' };

    if (mode === 'negotiate') {
      if (actor.money < 6) return { ok: false, reason: 'Недостаточно средств (6 млрд $)' };
      actor.changeMoney(-6, `урегулирование спора: ${d.regionName}`);
      this.setRelation(actorCode, other, Math.min(1, actor.getRelation(other) + 0.2));
      this.disputes.splice(idx, 1);
      return { ok: true };
    } else {
      d.tension = Math.min(1, d.tension + 0.25);
      this.setRelation(actorCode, other, Math.max(-1, actor.getRelation(other) - 0.3));
      if (d.tension >= 0.95 && !actor.warWith.includes(other)) {
        this.declareWar(actorCode, other);
      }
      return { ok: true };
    }
  }

  getState(): Record<string, any> {
    const relations: Record<string, any> = {};
    countrySystem.getAll().forEach((c) => {
      relations[c.code] = c.relations;
    });
    return {
      relations,
      orgs: this.orgs.map(o => ({ ...o, members: [...o.members] })),
      disputes: this.disputes.map(d => ({ ...d })),
      disputeCounter: this.disputeCounter
    };
  }

  setState(s: Record<string, any>): void {
    if (!s) return;
    if (Array.isArray(s.orgs)) this.orgs = s.orgs;
    if (Array.isArray(s.disputes)) this.disputes = s.disputes;
    if (typeof s.disputeCounter === 'number') this.disputeCounter = s.disputeCounter;
  }
}

export const diplomacySystem = DiplomacySystem.getInstance();
