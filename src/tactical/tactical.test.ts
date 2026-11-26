import { describe, it, expect, beforeEach } from 'vitest';
import { initCountryData } from '../data/countries.js';
import { countrySystem } from '../country/CountrySystem.js';
import { eventBus } from '../core/EventBus.js';
import { technologySystem } from '../tech/TechnologySystem.js';
import { militarySystem } from '../military/MilitarySystem.js';
import { tacticalSystem } from './TacticalSystem.js';

describe('Tactical 3D Combat System', () => {
  beforeEach(async () => {
    eventBus.clear();
    initCountryData();
    await countrySystem.init();
    await technologySystem.init();
    await militarySystem.init();
    await tacticalSystem.init();
    countrySystem.setPlayer('USA');
  });

  it('enters battle, simulates combat/visibility/fatigue, and exits with report', () => {
    const atkIds = militarySystem.getUnitsByCountry('USA').map(u => u.id);
    const defIds = militarySystem.getUnitsByCountry('IRQ').map(u => u.id);
    expect(atkIds.length).toBeGreaterThan(0);
    expect(defIds.length).toBeGreaterThan(0);

    tacticalSystem.enterBattle('test_battle', atkIds, defIds);
    const units = tacticalSystem.getUnits();
    expect(units.length).toBe(atkIds.length + defIds.length);

    // Friendly units must be spotted, far enemy units hidden by fog of war initially
    const playerUnits = units.filter(u => u.countryCode === 'USA');
    const enemyUnits = units.filter(u => u.countryCode === 'IRQ');
    expect(playerUnits.every(u => u.spotted)).toBe(true);
    expect(enemyUnits.some(u => !u.spotted)).toBe(true);

    // Issue tactical order
    tacticalSystem.issueOrder(playerUnits[0]!.id, 'attack', 600, 350);
    expect(playerUnits[0]!.order).toBe('attack');

    // Run simulation steps
    for (let i = 0; i < 15; i++) {
      tacticalSystem.update(0.5);
    }
    expect(playerUnits[0]!.fatigue).toBeGreaterThan(0);

    const report = tacticalSystem.exitBattle();
    expect(report).not.toBeNull();
    expect(['attacker', 'defender', 'draw']).toContain(report!.winner);
  });
});
