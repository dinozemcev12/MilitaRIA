/* ============================================================
   core/SaveSystem.ts — сохранения (Этап 8)
   Несколько слотов, автосохранение, localStorage + экспорт JSON.
   ============================================================ */
import { eventBus, GameEvents } from './EventBus.js';
import { gameTime } from './GameTime.js';
import { countrySystem } from '../country/CountrySystem.js';
import { militarySystem } from '../military/MilitarySystem.js';
import { diplomacySystem } from '../diplomacy/DiplomacySystem.js';
import { eventsSystem } from '../events/EventsSystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';
import { logisticsSystem } from '../logistics/LogisticsSystem.js';
import { productionSystem } from '../production/ProductionSystem.js';
import { intelSystem } from '../intel/IntelSystem.js';
import { aiSystem } from '../ai/AISystem.js';
import { uiSystem } from '../ui/UISystem.js';

const SAVE_VERSION = 3;
const AUTOSAVE_KEY = 'militaria_autosave';
const SLOT_PREFIX = 'militaria_slot_';
const MAX_SLOTS = 5;

export interface SaveData {
  version: number;
  timestamp: number;
  slot: number;
  playerCountry: string;
  gameDate: { year: number; month: number; day: number };
  countries: Record<string, any>;
  military: any;
  diplomacy?: any;
  events: any;
  tech?: any;
  logistics?: any;
  production?: any;
  intel?: any;
  ai?: any;
  ui: any;
}

class SaveSystem {
  private static instance: SaveSystem;
  private autosaveInterval = 0;
  private lastAutosaveDay = -1;
  private memoryStorage = new Map<string, string>();

  static getInstance(): SaveSystem {
    if (!SaveSystem.instance) SaveSystem.instance = new SaveSystem();
    return SaveSystem.instance;
  }

  private constructor() {}

  private _getItem(key: string): string | null {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage.getItem(key);
    } catch {}
    return this.memoryStorage.get(key) ?? null;
  }

  private _setItem(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(key, value);
        return;
      }
    } catch {}
    this.memoryStorage.set(key, value);
  }

  init(): void {
    // Автосохранение при смене дня (каждые 30 игровых дней)
    eventBus.on(GameEvents.TIME_TICK, () => {
      const day = gameTime.date.year * 365 + (gameTime.date.month - 1) * 30 + gameTime.date.day;
      if (day - this.lastAutosaveDay >= 30) {
        this.lastAutosaveDay = day;
        this.autosave();
      }
    });
  }

  /* ---------- SAVE ---------- */
  save(slot: number): boolean {
    try {
      const data = this._collectData(slot);
      this._setItem(`${SLOT_PREFIX}${slot}`, JSON.stringify(data));
      eventBus.emit(GameEvents.GAME_SAVED, { slot, timestamp: data.timestamp });
      console.log(`[SaveSystem] сохранено в слот ${slot}`);
      return true;
    } catch (e) {
      console.error('[SaveSystem] ошибка сохранения:', e);
      return false;
    }
  }

  autosave(): void {
    try {
      const data = this._collectData(-1);
      this._setItem(AUTOSAVE_KEY, JSON.stringify(data));
      console.log('[SaveSystem] автосохранение');
    } catch (e) {
      console.error('[SaveSystem] ошибка автосохранения:', e);
    }
  }

  /* ---------- LOAD ---------- */
  load(slot: number): boolean {
    try {
      const key = slot === -1 ? AUTOSAVE_KEY : `${SLOT_PREFIX}${slot}`;
      const raw = this._getItem(key);
      if (!raw) return false;
      const data: SaveData = JSON.parse(raw);
      if (data.version !== SAVE_VERSION) {
        console.warn(`[SaveSystem] версия сохранения ${data.version} != ${SAVE_VERSION}, загрузка может быть неполной`);
      }
      this._applyData(data);
      eventBus.emit(GameEvents.GAME_LOADED, { slot, timestamp: data.timestamp });
      console.log(`[SaveSystem] загружено из слота ${slot}, дата: ${data.gameDate.year}-${data.gameDate.month}-${data.gameDate.day}`);
      return true;
    } catch (e) {
      console.error('[SaveSystem] ошибка загрузки:', e);
      return false;
    }
  }

  /* ---------- LIST ---------- */
  listSlots(): { slot: number; label: string; timestamp: number; date: string; country: string }[] {
    const result = [];
    const keys = [{ slot: -1, key: AUTOSAVE_KEY }];
    for (let i = 1; i <= MAX_SLOTS; i++) keys.push({ slot: i, key: `${SLOT_PREFIX}${i}` });

    for (const { slot, key } of keys) {
      const raw = this._getItem(key);
      if (!raw) continue;
      try {
        const d: SaveData = JSON.parse(raw);
        const dt = d.gameDate;
        result.push({
          slot,
          label: slot === -1 ? 'Автосохранение' : `Слот ${slot}`,
          timestamp: d.timestamp,
          date: `${dt.day}.${dt.month}.${dt.year}`,
          country: d.playerCountry
        });
      } catch {}
    }
    return result;
  }

  /* ---------- HELPERS ---------- */
  private _collectData(slot: number): SaveData {
    const player = countrySystem.getPlayer();
    const countriesState: Record<string, any> = {};
    for (const c of countrySystem.getAll()) {
      countriesState[c.code] = c.getSnapshot();
    }
    return {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      slot,
      playerCountry: player?.code ?? 'USA',
      gameDate: { ...gameTime.date },
      countries: countriesState,
      military: militarySystem.getState(),
      diplomacy: diplomacySystem.getState(),
      events: eventsSystem.getState(),
      tech: technologySystem.getState(),
      logistics: logisticsSystem.getState(),
      production: productionSystem.getState(),
      intel: intelSystem.getState(),
      ai: aiSystem.getState(),
      ui: uiSystem.getState()
    };
  }

  private _applyData(data: SaveData): void {
    // Страны
    countrySystem.setState(data.countries);
    if (data.playerCountry) countrySystem.setPlayer(data.playerCountry);

    // Военные и дипломатия
    if (data.military) militarySystem.setState(data.military);
    if (data.diplomacy) diplomacySystem.setState(data.diplomacy);

    // События
    if (data.events) eventsSystem.setState(data.events);

    // Этап 7: Технологии, логистика, ВПК, разведка
    if (data.tech) technologySystem.setState(data.tech);
    if (data.logistics) logisticsSystem.setState(data.logistics);
    if (data.production) productionSystem.setState(data.production);
    if (data.intel) intelSystem.setState(data.intel);

    // ИИ
    if (data.ai) aiSystem.setState(data.ai);

    // UI
    if (data.ui) uiSystem.setState(data.ui);

    // Время
    if (data.gameDate) {
      gameTime.setDate(data.gameDate);
    }
  }

  /* ---------- экспорт/импорт ---------- */
  exportToJSON(): string {
    const data = this._collectData(0);
    return JSON.stringify(data, null, 2);
  }

  updateAutosave(_days: number): void {
    // legacy compat
  }
}

export const saveSystem = SaveSystem.getInstance();
