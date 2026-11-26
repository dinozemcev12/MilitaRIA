import { describe, it, expect, beforeEach } from 'vitest';
import { initCountryData } from '../data/countries.js';
import { countrySystem } from '../country/CountrySystem.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { technologySystem } from './TechnologySystem.js';
import { logisticsSystem } from '../logistics/LogisticsSystem.js';
import { productionSystem } from '../production/ProductionSystem.js';
import { militarySystem } from '../military/MilitarySystem.js';
import { intelSystem } from '../intel/IntelSystem.js';

describe('Stage 7: Tech, Logistics, Production & Intel', () => {
  beforeEach(async () => {
    eventBus.clear();
    initCountryData();
    await countrySystem.init();
    await technologySystem.init();
    await logisticsSystem.init();
    await militarySystem.init();
    await productionSystem.init();
    await intelSystem.init();
  });

  it('researches a technology over days and applies bonuses', () => {
    const ukr = countrySystem.getCountry('UKR')!;
    ukr.money = 200;

    // Tier 2 without Tier 1 should fail
    const failTier2 = technologySystem.startResearch('UKR', 'ground_2');
    expect(failTier2.ok).toBe(false);

    // Tier 1 should succeed
    const start = technologySystem.startResearch('UKR', 'medicine_1');
    expect(start.ok).toBe(true);

    for (let i = 0; i < 40; i++) {
      eventBus.emit(GameEvents.TIME_TICK, { date: { year: 2000, month: 1, day: i + 1 } });
    }

    expect(technologySystem.isResearched('UKR', 'medicine_1')).toBe(true);
    const bonuses = technologySystem.getCountryBonuses('UKR');
    expect(bonuses.moraleRecovery).toBeGreaterThan(0);
    expect(bonuses.supplyEff).toBeGreaterThan(0);
  });

  it('builds factories and completes production queue orders', () => {
    const usa = countrySystem.getCountry('USA')!;
    usa.money = 500;
    const beforeUnits = militarySystem.getUnitsByCountry('USA').length;
    const beforeFac = productionSystem.getIndustry('USA').militaryFactories;

    expect(productionSystem.buildFactory('USA', 'military').ok).toBe(true);
    expect(productionSystem.getIndustry('USA').militaryFactories).toBe(beforeFac + 1);

    expect(productionSystem.queueOrder('USA', 'unit', 'infantry').ok).toBe(true);
    for (let i = 0; i < 20; i++) {
      eventBus.emit(GameEvents.TIME_TICK, { date: { year: 2000, month: 1, day: i + 1 } });
    }

    expect(militarySystem.getUnitsByCountry('USA').length).toBe(beforeUnits + 1);
  });

  it('updates logistics stockpiles, depots, and infrastructure', () => {
    const deu = countrySystem.getCountry('DEU')!;
    deu.money = 200;
    const logBefore = { ...logisticsSystem.getLogistics('DEU') };

    expect(logisticsSystem.buildDepot('DEU').ok).toBe(true);
    expect(logisticsSystem.upgradeInfrastructure('DEU').ok).toBe(true);
    expect(logisticsSystem.buySupplies('DEU', 'fuel', 100).ok).toBe(true);

    const logAfter = logisticsSystem.getLogistics('DEU');
    expect(logAfter.depots).toBe(logBefore.depots + 1);
    expect(logAfter.railHubs).toBe(logBefore.railHubs + 1);
    expect(logAfter.fuel).toBeGreaterThan(logBefore.fuel);

    eventBus.emit(GameEvents.TIME_TICK, { date: { year: 2000, month: 1, day: 1 } });
    expect(deu.supplyLevel).toBeGreaterThanOrEqual(0.15);
    expect(deu.supplyLevel).toBeLessThanOrEqual(1.0);
  });

  it('performs intelligence gathering and supply sabotage', () => {
    const gbr = countrySystem.getCountry('GBR')!;
    gbr.money = 200;
    const beforeFuel = logisticsSystem.getLogistics('IRQ').fuel;

    const intelRes = intelSystem.gatherIntel('GBR', 'IRQ');
    expect(intelRes.ok).toBe(true);
    expect(intelSystem.getIntelLevel('GBR', 'IRQ')).toBeGreaterThan(0.4);

    const sabRes = intelSystem.sabotageSupply('GBR', 'IRQ');
    expect(sabRes.ok).toBe(true);
    expect(logisticsSystem.getLogistics('IRQ').fuel).toBeLessThan(beforeFuel);
  });
});
