import { describe, it, expect, beforeEach } from 'vitest';
import { initCountryData } from '../data/countries.js';
import { countrySystem } from '../country/CountrySystem.js';
import { eventBus } from '../core/EventBus.js';
import { diplomacySystem } from './DiplomacySystem.js';
import { militarySystem } from '../military/MilitarySystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';

describe('Stage 8: Diplomacy Orgs/Disputes & Military Echelons/Commanders', () => {
  beforeEach(async () => {
    eventBus.clear();
    initCountryData();
    await countrySystem.init();
    await technologySystem.init();
    await diplomacySystem.init();
    await militarySystem.init();
  });

  it('manages international organizations and territorial disputes', () => {
    const uk = countrySystem.getCountry('GBR')!;
    expect(diplomacySystem.getCountryOrgs('GBR').some(o => o.id === 'nato')).toBe(true);

    const ukr = countrySystem.getCountry('UKR')!;
    ukr.money = 100;
    diplomacySystem.setRelation('UKR', 'USA', 0.5);
    for (const m of diplomacySystem.getOrganizations().find(o => o.id === 'nato')!.members) {
      diplomacySystem.setRelation('UKR', m, 0.4);
    }
    const joinRes = diplomacySystem.joinOrganization('UKR', 'nato');
    expect(joinRes.ok).toBe(true);
    expect(diplomacySystem.getCountryOrgs('UKR').some(o => o.id === 'nato')).toBe(true);

    const argDisputes = diplomacySystem.getDisputes('ARG');
    expect(argDisputes.length).toBeGreaterThan(0);
    const arg = countrySystem.getCountry('ARG')!;
    arg.money = 50;
    const negRes = diplomacySystem.resolveDispute(argDisputes[0]!.id, 'ARG', 'negotiate');
    expect(negRes.ok).toBe(true);
    expect(diplomacySystem.getDisputes('ARG').length).toBe(0);
    expect(uk).toBeDefined();
  });

  it('promotes unit echelons, assigns commanders, and merges units', () => {
    const usa = countrySystem.getCountry('USA')!;
    usa.money = 200;
    const units = militarySystem.getUnitsByCountry('USA');
    expect(units.length).toBeGreaterThanOrEqual(2);

    const u1 = units[0]!;
    const u2 = units[1]!;
    const prom = militarySystem.promoteUnit(u1.id);
    expect(prom.ok).toBe(true);
    expect(prom.echelon).toBe('regiment');

    expect(militarySystem.assignCommander(u1.id, 'Ген.-м. Волков (Штурмовик)')).toBe(true);
    expect(u1.commander).toBe('Ген.-м. Волков (Штурмовик)');

    const merge = militarySystem.mergeUnits(u1.id, u2.id);
    expect(merge.ok).toBe(true);
    expect(militarySystem.getUnit(u2.id)).toBeUndefined();
  });
});
