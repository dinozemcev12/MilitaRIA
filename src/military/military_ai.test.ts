import { describe, it, expect, beforeEach } from 'vitest';
import { initCountryData } from '../data/countries.js';
import { countrySystem } from '../country/CountrySystem.js';
import { militarySystem } from './MilitarySystem.js';
import { aiSystem } from '../ai/AISystem.js';
import { diplomacySystem } from '../diplomacy/DiplomacySystem.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { tacticalSystem } from '../tactical/TacticalSystem.js';

describe('Military Battles & AI War Maneuvers', () => {
  beforeEach(async () => {
    initCountryData();
    await countrySystem.init();
    await militarySystem.init();
    await diplomacySystem.init();
    await aiSystem.init();
    await tacticalSystem.init();
  });

  it('creates an ActiveBattle when warring units clash and AI moves units in war', () => {
    countrySystem.setPlayer('UKR');
    const rus = countrySystem.getCountry('RUS')!;
    const pol = countrySystem.getCountry('POL')!;

    diplomacySystem.declareWar('RUS', 'POL');
    expect(rus.warWith).toContain('POL');

    // Триггерим 3 тика времени, чтобы ИИ отдал приказы
    eventBus.emit(GameEvents.TIME_TICK, {});
    eventBus.emit(GameEvents.TIME_TICK, {});
    eventBus.emit(GameEvents.TIME_TICK, {});

    const rusUnits = militarySystem.getUnitsByCountry('RUS');
    const moving = rusUnits.some(u => u.targetLat !== undefined && u.targetLng !== undefined);
    expect(moving).toBe(true);

    // Ставим два вражеских отряда рядом и проверяем создание активного сражения
    const uA = rusUnits[0]!;
    const uB = militarySystem.getUnitsByCountry('POL')[0]!;
    uA.lat = 51.0; uA.lng = 25.0;
    uB.lat = 51.5; uB.lng = 25.5;

    eventBus.emit(GameEvents.TIME_TICK, {});
    const battles = militarySystem.getActiveBattles();
    expect(battles.length).toBeGreaterThan(0);
    expect(battles[0]!.attackerCode === 'RUS' || battles[0]!.defenderCode === 'RUS').toBe(true);
  });

  it('supports new tactical orders and formations', () => {
    countrySystem.setPlayer('UKR');
    const atk = militarySystem.getUnitsByCountry('UKR').slice(0, 1).map(u => u.id);
    const def = militarySystem.getUnitsByCountry('RUS').slice(0, 1).map(u => u.id);

    tacticalSystem.enterBattle('test_tac_2', atk, def);
    const u = tacticalSystem.getUnits().find(x => x.countryCode === 'UKR')!;
    tacticalSystem.setFormation(u.id, 'wedge');
    tacticalSystem.issueOrder(u.id, 'occupy');
    expect(u.formation).toBe('wedge');
    expect(u.order).toBe('occupy');

    const rep = tacticalSystem.exitBattle();
    expect(rep).not.toBeNull();
    expect(tacticalSystem.isActive()).toBe(false);
  });

  it('captures enemy capital, tracks occupation progress, and executes capitulation', () => {
    countrySystem.setPlayer('RUS');
    const ukr = countrySystem.getCountry('UKR')!;
    const rus = countrySystem.getCountry('RUS')!;
    diplomacySystem.declareWar('RUS', 'UKR');

    // Убираем защитников от Киева и ставим российский юнит на Киев
    for (const u of militarySystem.getUnitsByCountry('UKR')) {
      u.lat = 0; u.lng = 0;
    }
    const rusUnit = militarySystem.getUnitsByCountry('RUS')[0]!;
    rusUnit.lat = ukr.capLat;
    rusUnit.lng = ukr.capLng;

    let capEvents = 0;
    const sub = eventBus.on(GameEvents.CITY_CAPTURED, () => { capEvents++; });

    eventBus.emit(GameEvents.TIME_TICK, {});
    sub.unsubscribe();

    expect(capEvents).toBeGreaterThan(0);
    expect(militarySystem.getCityOccupier('UKR', ukr.capital)).toBe('RUS');
    expect(ukr.occupationProgress).toBeGreaterThanOrEqual(0.55);

    const res = diplomacySystem.capitulate('UKR', 'RUS', 'occupy');
    expect(res.ok).toBe(true);
    expect(ukr.occupiedBy).toBe('RUS');
    expect(rus.warWith).not.toContain('UKR');
    expect(militarySystem.getUnitsByCountry('UKR').length).toBe(0);
  });
});
