import { describe, it, expect, beforeEach } from 'vitest';
import { initCountryData } from '../data/countries.js';
import { countrySystem } from '../country/CountrySystem.js';
import { eventBus, GameEvents } from './EventBus.js';
import { gameTime } from './GameTime.js';
import { saveSystem } from './SaveSystem.js';
import { aiSystem } from '../ai/AISystem.js';
import { militarySystem } from '../military/MilitarySystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';

describe('Save and Load System', () => {
  beforeEach(async () => {
    eventBus.clear();
    initCountryData();
    await countrySystem.init();
    await technologySystem.init();
    await militarySystem.init();
    await aiSystem.init();
  });

  it('saves state, advances time, and restores state and date correctly', () => {
    countrySystem.setPlayer('DEU');
    const deu = countrySystem.getCountry('DEU')!;
    deu.money = 777;

    gameTime.setDate({ year: 2001, month: 5, day: 15 });

    let gameLoadedFired = false;
    let timeTickFired = false;
    let restoredDay = 0;

    eventBus.on(GameEvents.GAME_LOADED, () => {
      gameLoadedFired = true;
    });

    const saved = saveSystem.save(1);
    expect(saved).toBe(true);

    // Изменяем состояние и дату после сохранения
    deu.money = 100;
    countrySystem.setPlayer('USA');
    gameTime.setDate({ year: 2005, month: 12, day: 31 });

    eventBus.on(GameEvents.TIME_TICK, (d: any) => {
      timeTickFired = true;
      restoredDay = d?.date?.day;
    });

    // Загружаем
    const loaded = saveSystem.load(1);
    expect(loaded).toBe(true);
    expect(gameLoadedFired).toBe(true);
    expect(timeTickFired).toBe(true);
    expect(restoredDay).toBe(15);
    expect(gameTime.date.year).toBe(2001);
    expect(gameTime.date.month).toBe(5);
    expect(gameTime.date.day).toBe(15);

    expect(countrySystem.getPlayer()?.code).toBe('DEU');
    expect(countrySystem.getCountry('DEU')?.money).toBe(777);
  });
});
