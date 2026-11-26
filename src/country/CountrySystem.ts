/* ============================================================
   country/CountrySystem.ts — управление странами (Этап 1)
   Singleton, регистрируется в GameLoop.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { gameTime } from '../core/GameTime.js';
import { getRegisteredCountries, getRegisteredCountry, CountryData } from '../data/countries.js';
import { Country } from './Country.js';

export class CountrySystem implements IGameSystem {
  readonly name = 'Country';
  readonly priority = 20;

  private countries = new Map<string, Country>();
  private playerCountry: Country | null = null;

  getInstance(): CountrySystem { return CountrySystem.instance; }
  private static instance: CountrySystem;
  static getInstance(): CountrySystem {
    if (!CountrySystem.instance) CountrySystem.instance = new CountrySystem();
    return CountrySystem.instance;
  }

  private constructor() {}

  async init(): Promise<void> {
    this.countries.clear();
    getRegisteredCountries().forEach((data) => {
      this.countries.set(data.code, new Country(data));
    });
    // по умолчанию игрок за США
    this.setPlayer('USA');
    eventBus.emit(GameEvents.COUNTRY_SELECTED, { code: this.playerCountry!.code });
    console.log('[CountrySystem] инициализировано стран:', this.countries.size);
  }

  update(dt: number): void {
    // базовая инерция ВВП (заглушка Этапа 1, детальная экономика — Этап 2)
    gameTime;
    void dt;
  }

  shutdown(): void {
    this.countries.clear();
    this.playerCountry = null;
  }

  /* ---------- доступ ---------- */
  getCountry(code: string): Country | undefined {
    return this.countries.get(code);
  }
  getAll(): Country[] {
    return Array.from(this.countries.values());
  }
  getPlayer(): Country | null {
    return this.playerCountry;
  }

  setPlayer(code: string): void {
    const c = this.countries.get(code);
    if (!c) return;
    if (this.playerCountry) {
      this.playerCountry.selected = false;
      this.playerCountry.aiControlled = true;
    }
    this.playerCountry = c;
    c.selected = true;
    c.aiControlled = false;
    eventBus.emit(GameEvents.COUNTRY_SELECTED, { code: c.code });
  }

  /* ---------- сохранение / загрузка ---------- */
  getState(): Record<string, any> {
    const states: Record<string, any> = {};
    this.countries.forEach((c) => { states[c.code] = c.getSnapshot(); });
    return states;
  }

  setState(states: Record<string, any>): void {
    Object.entries(states).forEach(([code, snap]) => {
      const c = this.countries.get(code);
      if (c && snap) c.applySnapshot(snap as any);
    });
  }
}

export const countrySystem = CountrySystem.getInstance();
