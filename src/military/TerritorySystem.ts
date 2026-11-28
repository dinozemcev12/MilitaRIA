/* ============================================================
   military/TerritorySystem.ts — пошаговый захват территории и линия фронта.
   Сетка оперативных клеток (~1°), контроль над клетками, продвижение фронта
   под давлением войск, оккупация и данные для отрисовки линии фронта.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { militarySystem, UNIT_META, ECHELON_META, COMMANDER_TRAITS, UnitType } from './MilitarySystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';
import { WORLD_CITIES } from '../data/worldGeoFeatures.js';
import { getCountryBBox, getCountryPolygons, LatLngRing } from '../world/WorldGeometry.js';

export const TERRITORY_CELL_DEG = 0.5;
const LAT_MIN = -62;
const LAT_MAX = 84;
const LNG_MIN = -180;
const LNG_MAX = 180;
const ROWS = Math.ceil((LAT_MAX - LAT_MIN) / TERRITORY_CELL_DEG);
const COLS = Math.ceil((LNG_MAX - LNG_MIN) / TERRITORY_CELL_DEG);
const CELL_COUNT = ROWS * COLS;

/** Радиус проекции контроля подразделения в клетках (1 клетка = 0.5° ≈ 55 км). */
const UNIT_RADIUS: Record<UnitType, number> = {
  infantry: 3.0,
  motorized: 3.5,
  mechanized: 3.8,
  tank: 3.8,
  artillery: 5.0,
  recon: 4.5,
  engineer: 2.8,
  aa: 3.0,
  air: 8.0,
  naval: 6.0,
  airborne: 3.5
};

export interface TerritoryCellInfo {
  index: number;
  row: number;
  col: number;
  lat: number;
  lng: number;
  owner: string;
  controller: string;
}

export interface CountryTerritoryStats {
  code: string;
  total: number;
  controlled: number;
  lost: number;
  progress: number;
  capitalCaptured: boolean;
}

export interface CapturedGroup {
  owner: string;
  controller: string;
  cells: number[];
}

export interface FrontSegment {
  lat1: number;
  lng1: number;
  lat2: number;
  lng2: number;
  a: string;
  b: string;
}

export interface FrontCell extends TerritoryCellInfo {
  defense: number;
}

export interface TerritoryRenderData {
  version: number;
  captured: CapturedGroup[];
  fronts: FrontSegment[];
}

function cellLat(row: number): number {
  return LAT_MAX - (row + 0.5) * TERRITORY_CELL_DEG;
}
function cellLng(col: number): number {
  return LNG_MIN + (col + 0.5) * TERRITORY_CELL_DEG;
}

export class TerritorySystem implements IGameSystem {
  readonly name = 'Territory';
  readonly priority = 58;

  private ownerIdx = new Int16Array(CELL_COUNT).fill(-1);
  private controllerIdx = new Int16Array(CELL_COUNT).fill(-1);
  private contestCode = new Int16Array(CELL_COUNT).fill(-1);
  private contestProgress = new Float32Array(CELL_COUNT);
  private cellDefense = new Float32Array(CELL_COUNT);

  private codeToIdx = new Map<string, number>();
  private idxToCode: string[] = [];
  private capitalCell = new Map<string, number>();
  private stats = new Map<string, CountryTerritoryStats>();
  private capturedCities = new Set<string>();

  private renderData: TerritoryRenderData = { version: 0, captured: [], fronts: [] };
  private frontTargets = new Map<string, FrontCell[]>();
  private dirty = true;
  private version = 0;
  private built = false;

  private unsubscribeTick: (() => void) | null = null;
  private unsubscribers: (() => void)[] = [];

  static instance: TerritorySystem;
  static getInstance(): TerritorySystem {
    if (!TerritorySystem.instance) TerritorySystem.instance = new TerritorySystem();
    return TerritorySystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._buildGrid();
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => this._onDayTick()).unsubscribe;
    this.unsubscribers.push(
      eventBus.on(GameEvents.WAR_DECLARED, () => this._invalidate()).unsubscribe,
      eventBus.on(GameEvents.PEACE_SIGNED, () => this._invalidate()).unsubscribe,
      eventBus.on(GameEvents.GAME_LOADED, () => this._invalidate()).unsubscribe
    );
    console.log(`[TerritorySystem] сетка ${COLS}x${ROWS}, сухопутных клеток: ${this._landCellCount()}`);
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

  /* ================================================================ GRID */
  private _buildGrid(): void {
    this.ownerIdx.fill(-1);
    this.controllerIdx.fill(-1);
    this.contestCode.fill(-1);
    this.contestProgress.fill(0);
    this.cellDefense.fill(0);
    this.codeToIdx.clear();
    this.idxToCode = [];
    this.capitalCell.clear();
    this.capturedCities.clear();

    const countries = countrySystem.getAll();
    // Мелкие страны размечаем первыми, чтобы анклавы не «съедались» соседями.
    const sorted = [...countries].sort((a, b) => this._bboxArea(a.code) - this._bboxArea(b.code));
    sorted.forEach((c, i) => {
      this.codeToIdx.set(c.code, i);
      this.idxToCode[i] = c.code;
    });

    for (const c of sorted) {
      const ci = this.codeToIdx.get(c.code)!;
      const polys = getCountryPolygons(c.code);
      for (const poly of polys) {
        const outer = poly[0];
        if (outer && outer.length >= 3) this._rasterizeRing(outer, ci);
      }
    }

    // Гарантируем каждой стране хотя бы столичную клетку.
    for (const c of countries) {
      const ci = this.codeToIdx.get(c.code)!;
      const idx = this._cellIndex(c.capLat, c.capLng);
      if (idx < 0) continue;
      this.capitalCell.set(c.code, idx);
      if (this.ownerIdx[idx] === -1) this.ownerIdx[idx] = ci;
    }

    // Карликовые государства, не попавшие в сетку, получают 3×3 вокруг столицы.
    const counts = new Map<number, number>();
    for (let i = 0; i < CELL_COUNT; i++) {
      const oi = this.ownerIdx[i]!;
      if (oi >= 0) counts.set(oi, (counts.get(oi) ?? 0) + 1);
    }
    for (const c of countries) {
      const ci = this.codeToIdx.get(c.code)!;
      if ((counts.get(ci) ?? 0) > 0) continue;
      const capIdx = this.capitalCell.get(c.code);
      if (capIdx === undefined) continue;
      const r0 = Math.floor(capIdx / COLS);
      const c0 = capIdx % COLS;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = r0 + dr;
          const col = c0 + dc;
          if (r < 0 || r >= ROWS || col < 0 || col >= COLS) continue;
          const idx = r * COLS + col;
          if (this.ownerIdx[idx] === -1) this.ownerIdx[idx] = ci;
        }
      }
    }

    this.controllerIdx.set(this.ownerIdx);
    this.built = true;
    this._recomputeStats();
    this._invalidate();
  }

  private _bboxArea(code: string): number {
    const b = getCountryBBox(code);
    if (!b) return 0;
    return Math.abs((b.maxLat - b.minLat) * (b.maxLng - b.minLng));
  }

  /** Растеризация внешнего кольца полигона по центрам клеток. */
  private _rasterizeRing(ring: LatLngRing, owner: number): void {
    if (ring.length < 3) return;
    let minLat = 90;
    let maxLat = -90;
    for (const pt of ring) {
      const lat = pt[0];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const rStart = Math.max(0, Math.floor((LAT_MAX - maxLat) / TERRITORY_CELL_DEG));
    const rEnd = Math.min(ROWS - 1, Math.floor((LAT_MAX - minLat) / TERRITORY_CELL_DEG));

    for (let r = rStart; r <= rEnd; r++) {
      const lat = cellLat(r);
      const xs: number[] = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const p1 = ring[i]!;
        const p2 = ring[j]!;
        const y1 = p1[0];
        const y2 = p2[0];
        if ((y1 > lat) === (y2 > lat)) continue;
        const x1 = p1[1];
        const x2 = p2[1];
        xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = xs[k]!;
        const xb = xs[k + 1]!;
        const cStart = Math.max(0, Math.floor((xa - LNG_MIN) / TERRITORY_CELL_DEG));
        const cEnd = Math.min(COLS - 1, Math.floor((xb - LNG_MIN) / TERRITORY_CELL_DEG));
        for (let col = cStart; col <= cEnd; col++) {
          const idx = r * COLS + col;
          if (this.ownerIdx[idx] === -1) this.ownerIdx[idx] = owner;
        }
      }
    }
  }

  private _landCellCount(): number {
    let n = 0;
    for (let i = 0; i < CELL_COUNT; i++) if (this.ownerIdx[i]! >= 0) n++;
    return n;
  }

  private _cellIndex(lat: number, lng: number): number {
    if (lat > LAT_MAX || lat < LAT_MIN || lng < LNG_MIN || lng >= LNG_MAX) return -1;
    const r = Math.floor((LAT_MAX - lat) / TERRITORY_CELL_DEG);
    const c = Math.floor((lng - LNG_MIN) / TERRITORY_CELL_DEG);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
    return r * COLS + c;
  }

  /* ================================================================ DAILY */
  private _onDayTick(): void {
    if (!this.built) return;
    const anyWar = countrySystem.getAll().some(c => c.warWith.length > 0);
    if (!anyWar) {
      this.contestCode.fill(-1);
      this.contestProgress.fill(0);
      return;
    }

    const powers = new Map<number, Map<string, number>>();
    const direct = new Map<number, Set<string>>();
    const units = militarySystem.getAllUnits().filter(u => u.strength > 0 && u.manpower > 0);

    for (const u of units) {
      const c = countrySystem.getCountry(u.countryCode);
      if (!c || c.warWith.length === 0) continue;
      const radiusCells = UNIT_RADIUS[u.type] ?? 3.0;
      const radiusDeg = radiusCells * TERRITORY_CELL_DEG;
      const power = this._unitPower(u);
      if (power <= 0) continue;

      const r0 = Math.max(0, Math.floor((LAT_MAX - (u.lat + radiusDeg)) / TERRITORY_CELL_DEG));
      const r1 = Math.min(ROWS - 1, Math.floor((LAT_MAX - (u.lat - radiusDeg)) / TERRITORY_CELL_DEG));
      const c0 = Math.max(0, Math.floor((u.lng - radiusDeg - LNG_MIN) / TERRITORY_CELL_DEG));
      const c1 = Math.min(COLS - 1, Math.floor((u.lng + radiusDeg - LNG_MIN) / TERRITORY_CELL_DEG));

      for (let r = r0; r <= r1; r++) {
        const dLat = cellLat(r) - u.lat;
        for (let col = c0; col <= c1; col++) {
          const dLng = cellLng(col) - u.lng;
          const dist = Math.hypot(dLat, dLng);
          if (dist > radiusDeg + TERRITORY_CELL_DEG * 0.5) continue;
          const idx = r * COLS + col;
          if (this.ownerIdx[idx]! < 0) continue;
          const falloff = 1 - 0.5 * (dist / (radiusDeg + TERRITORY_CELL_DEG * 0.5));
          this._addPower(powers, idx, u.countryCode, power * falloff);
          if (dist <= TERRITORY_CELL_DEG * 1.5) this._addDirect(direct, idx, u.countryCode);
        }
      }
    }

    this.cellDefense.fill(0);
    let capturedAny = false;

    for (const [idx, map] of powers) {
      const ci = this.controllerIdx[idx]!;
      if (ci < 0) continue;
      const controllerCode = this.idxToCode[ci];
      if (!controllerCode) continue;
      const controller = countrySystem.getCountry(controllerCode);
      if (!controller) continue;

      let defPower = 0;
      let bestAtk: string | null = null;
      let bestPower = 0;

      for (const [code, p] of map) {
        if (code === controllerCode || controller.allies.includes(code)) {
          defPower += p;
        } else if (this._isAtWar(controllerCode, code) && p > bestPower) {
          bestPower = p;
          bestAtk = code;
        }
      }
      this.cellDefense[idx] = defPower;

      if (!bestAtk || bestPower <= 0) {
        this._decayContest(idx);
        continue;
      }

      const directHit = direct.get(idx)?.has(bestAtk) ?? false;
      if (!directHit && !this._hasAdjacentControl(idx, bestAtk)) {
        this._decayContest(idx);
        continue;
      }

      const atkIdx = this.codeToIdx.get(bestAtk);
      if (atkIdx === undefined) continue;
      if (this.contestCode[idx] !== atkIdx) {
        this.contestCode[idx] = atkIdx;
        this.contestProgress[idx] = 0;
      }

      const ratio = bestPower / Math.max(1, defPower);
      if (ratio > 1.08) {
        const gain = 0.05 + 0.12 * Math.min(2, ratio - 1);
        this.contestProgress[idx] = Math.min(1, this.contestProgress[idx]! + gain);
      } else {
        this.contestProgress[idx] = Math.max(0, this.contestProgress[idx]! - 0.08);
      }

      if (this.contestProgress[idx]! >= 1) {
        this._captureCell(idx, bestAtk);
        capturedAny = true;
      }
    }

    // Даже без захвата обновляем оценки обороны для ИИ.
    this.dirty = true;
    if (capturedAny) {
      this._recomputeStats();
      this._invalidate();
      eventBus.emit(GameEvents.TERRITORY_UPDATED, { stats: this.getStatsRecord() });
      eventBus.emit(GameEvents.FRONT_CHANGED, { version: this.version });
    }
  }

  private _unitPower(u: ReturnType<typeof militarySystem.getUnit>): number {
    if (!u) return 0;
    const meta = UNIT_META[u.type];
    const ech = ECHELON_META[u.echelon ?? 'battalion'].mult;
    const cmd = 1 + (u.commander ? (COMMANDER_TRAITS[u.commander]?.powerBonus ?? 0) : 0);
    const bonuses = technologySystem.getCountryBonuses(u.countryCode);
    const techMult = 1 + (u.type === 'air' ? bonuses.airPower : u.type === 'naval' ? bonuses.navalPower : bonuses.groundPower);
    const manRatio = u.maxManpower > 0 ? u.manpower / u.maxManpower : u.strength / 1000;
    const org = 0.4 + (u.organization ?? 0.8) * 0.6;
    const sup = 0.4 + u.supply * 0.6;
    const mor = 0.5 + u.morale * 0.5;
    const ent = 1 + (u.entrenchment ?? 0) * 0.5;
    return meta.power * ech * cmd * techMult * manRatio * org * sup * mor * ent;
  }

  private _addPower(map: Map<number, Map<string, number>>, idx: number, code: string, value: number): void {
    let entry = map.get(idx);
    if (!entry) {
      entry = new Map();
      map.set(idx, entry);
    }
    entry.set(code, (entry.get(code) ?? 0) + value);
  }

  private _addDirect(map: Map<number, Set<string>>, idx: number, code: string): void {
    let entry = map.get(idx);
    if (!entry) {
      entry = new Set();
      map.set(idx, entry);
    }
    entry.add(code);
  }

  private _decayContest(idx: number): void {
    const progress = this.contestProgress[idx]!;
    if (progress <= 0) return;
    const next = Math.max(0, progress - 0.05);
    this.contestProgress[idx] = next;
    if (next <= 0) this.contestCode[idx] = -1;
  }

  private _isAtWar(a: string, b: string): boolean {
    if (a === b) return false;
    const ca = countrySystem.getCountry(a);
    const cb = countrySystem.getCountry(b);
    return !!ca?.warWith.includes(b) || !!cb?.warWith.includes(a);
  }

  private _hasAdjacentControl(idx: number, code: string): boolean {
    const ci = this.codeToIdx.get(code);
    if (ci === undefined) return false;
    const country = countrySystem.getCountry(code);
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const neighbours: number[] = [];
    if (c > 0) neighbours.push(idx - 1);
    if (c < COLS - 1) neighbours.push(idx + 1);
    if (r > 0) neighbours.push(idx - COLS);
    if (r < ROWS - 1) neighbours.push(idx + COLS);
    for (const n of neighbours) {
      const nci = this.controllerIdx[n]!;
      if (nci === ci) return true;
      const ncode = this.idxToCode[nci];
      if (ncode && country?.allies.includes(ncode)) return true;
    }
    return false;
  }

  private _captureCell(idx: number, to: string): void {
    const toIdx = this.codeToIdx.get(to);
    if (toIdx === undefined) return;
    const fromIdx = this.controllerIdx[idx]!;
    if (fromIdx === toIdx) return;
    this.controllerIdx[idx] = toIdx;
    this.contestCode[idx] = -1;
    this.contestProgress[idx] = 0;
    this.dirty = true;

    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const ownerIdx = this.ownerIdx[idx]!;
    const owner = ownerIdx >= 0 ? this.idxToCode[ownerIdx] ?? '' : '';
    const from = fromIdx >= 0 ? this.idxToCode[fromIdx] ?? '' : '';

    eventBus.emit(GameEvents.TERRITORY_CAPTURED, {
      lat: cellLat(r),
      lng: cellLng(c),
      row: r,
      col: c,
      cellIndex: idx,
      from,
      to,
      owner
    });

    // Города, оказавшиеся в захваченной клетке.
    for (const city of WORLD_CITIES) {
      if (city.countryCode !== owner) continue;
      if (this._cellIndex(city.lat, city.lng) !== idx) continue;
      const key = `${owner}:${city.name}`;
      if (this.capturedCities.has(key)) continue;
      this.capturedCities.add(key);
      eventBus.emit(GameEvents.CITY_CAPTURED, {
        city: city.name,
        countryCode: owner,
        occupierCode: to,
        isCapital: !!city.isCapital
      });
    }
  }

  /* ================================================================ STATS */
  private _recomputeStats(): void {
    this.stats.clear();
    for (const c of countrySystem.getAll()) {
      this.stats.set(c.code, {
        code: c.code,
        total: 0,
        controlled: 0,
        lost: 0,
        progress: 0,
        capitalCaptured: false
      });
    }

    for (let i = 0; i < CELL_COUNT; i++) {
      const oi = this.ownerIdx[i]!;
      if (oi < 0) continue;
      const owner = this.idxToCode[oi];
      if (!owner) continue;
      const st = this.stats.get(owner);
      if (!st) continue;
      st.total++;

      const ci = this.controllerIdx[i]!;
      if (ci >= 0) {
        const controller = this.idxToCode[ci];
        if (controller) {
          const cst = this.stats.get(controller);
          if (cst) cst.controlled++;
        }
      }

      if (ci !== oi) {
        const controller = this.idxToCode[ci];
        const ownerCountry = countrySystem.getCountry(owner);
        if (controller && ownerCountry?.warWith.includes(controller)) st.lost++;
      }
    }

    for (const st of this.stats.values()) {
      st.progress = st.total > 0 ? Math.min(1, st.lost / st.total) : 0;
    }

    for (const [code, capIdx] of this.capitalCell) {
      const st = this.stats.get(code);
      if (!st) continue;
      const oi = this.ownerIdx[capIdx]!;
      const ci = this.controllerIdx[capIdx]!;
      if (oi < 0 || ci < 0 || oi === ci) continue;
      const controller = this.idxToCode[ci];
      const country = countrySystem.getCountry(code);
      if (controller && country?.warWith.includes(controller)) st.capitalCaptured = true;
    }
  }

  private getStatsRecord(): Record<string, CountryTerritoryStats> {
    const out: Record<string, CountryTerritoryStats> = {};
    for (const [code, st] of this.stats) out[code] = { ...st };
    return out;
  }

  getCountryStats(code: string): CountryTerritoryStats {
    return this.stats.get(code) ?? { code, total: 0, controlled: 0, lost: 0, progress: 0, capitalCaptured: false };
  }

  getOccupationProgress(code: string): number {
    return this.getCountryStats(code).progress;
  }

  /* ================================================================ RENDER DATA */
  private _invalidate(): void {
    this.dirty = true;
    this.version++;
  }

  private _ensureRenderCache(): void {
    if (!this.dirty && this.renderData.version === this.version) return;
    this.dirty = false;
    this.renderData = { version: this.version, captured: [], fronts: [] };
    this.frontTargets.clear();

    const groups = new Map<string, CapturedGroup>();
    const fronts: FrontSegment[] = [];
    const targetSets = new Map<string, Set<number>>();

    const addTarget = (code: string, cellIdx: number): void => {
      if (!this._isAtWar(code, this.idxToCode[this.controllerIdx[cellIdx]!] ?? '')) return;
      let set = targetSets.get(code);
      if (!set) {
        set = new Set();
        targetSets.set(code, set);
      }
      if (!set.has(cellIdx)) set.add(cellIdx);
    };

    const checkPair = (a: number, b: number, lat1: number, lng1: number, lat2: number, lng2: number): void => {
      const oa = this.ownerIdx[a]!;
      const ob = this.ownerIdx[b]!;
      if (oa < 0 || ob < 0) return;
      const ca = this.controllerIdx[a]!;
      const cb = this.controllerIdx[b]!;
      if (ca < 0 || cb < 0 || ca === cb) return;
      const codeA = this.idxToCode[ca];
      const codeB = this.idxToCode[cb];
      if (!codeA || !codeB) return;
      const atWar = this._isAtWar(codeA, codeB);
      const captured = ca !== oa || cb !== ob;
      if (!atWar && !captured) return;
      fronts.push({ lat1, lng1, lat2, lng2, a: codeA, b: codeB });
      addTarget(codeA, b);
      addTarget(codeB, a);
    };

    for (let r = 0; r < ROWS; r++) {
      const latTop = LAT_MAX - r * TERRITORY_CELL_DEG;
      const latBottom = latTop - TERRITORY_CELL_DEG;
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const oi = this.ownerIdx[idx]!;
        if (oi < 0) continue;
        const ci = this.controllerIdx[idx]!;
        if (ci < 0) continue;
        const owner = this.idxToCode[oi];
        const controller = this.idxToCode[ci];
        if (!owner || !controller) continue;

        if (ci !== oi) {
          const key = `${owner}|${controller}`;
          let group = groups.get(key);
          if (!group) {
            group = { owner, controller, cells: [] };
            groups.set(key, group);
          }
          group.cells.push(idx);
        }

        const lngLeft = LNG_MIN + c * TERRITORY_CELL_DEG;
        const lngRight = lngLeft + TERRITORY_CELL_DEG;
        if (c < COLS - 1) checkPair(idx, idx + 1, latTop, lngRight, latBottom, lngRight);
        if (r < ROWS - 1) checkPair(idx, idx + COLS, latBottom, lngLeft, latBottom, lngRight);
      }
    }

    this.renderData.captured = Array.from(groups.values());
    this.renderData.fronts = fronts;

    for (const [code, set] of targetSets) {
      const cells: FrontCell[] = [];
      for (const idx of set) {
        const r = Math.floor(idx / COLS);
        const c = idx % COLS;
        const oi = this.ownerIdx[idx]!;
        const ci = this.controllerIdx[idx]!;
        const owner = oi >= 0 ? this.idxToCode[oi] : '';
        const controller = ci >= 0 ? this.idxToCode[ci] : '';
        if (!owner || !controller) continue;
        cells.push({
          index: idx,
          row: r,
          col: c,
          lat: cellLat(r),
          lng: cellLng(c),
          owner,
          controller,
          defense: this.cellDefense[idx] ?? 0
        });
      }
      this.frontTargets.set(code, cells);
    }
  }

  getRenderData(): TerritoryRenderData {
    this._ensureRenderCache();
    return this.renderData;
  }

  /** Вражеские клетки на линии фронта, пригодные для атаки страной code. */
  getFrontCells(code: string): FrontCell[] {
    this._ensureRenderCache();
    return this.frontTargets.get(code) ?? [];
  }

  getFrontLength(code: string): number {
    const data = this.getRenderData();
    let n = 0;
    for (const f of data.fronts) {
      if (f.a === code || f.b === code) n++;
    }
    return n;
  }

  getCellBounds(index: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
    if (index < 0 || index >= CELL_COUNT) return null;
    const r = Math.floor(index / COLS);
    const c = index % COLS;
    const maxLat = LAT_MAX - r * TERRITORY_CELL_DEG;
    const minLat = maxLat - TERRITORY_CELL_DEG;
    const minLng = LNG_MIN + c * TERRITORY_CELL_DEG;
    return { minLat, maxLat, minLng, maxLng: minLng + TERRITORY_CELL_DEG };
  }

  getCellAt(lat: number, lng: number): TerritoryCellInfo | null {
    const idx = this._cellIndex(lat, lng);
    if (idx < 0) return null;
    const oi = this.ownerIdx[idx]!;
    const ci = this.controllerIdx[idx]!;
    if (oi < 0 || ci < 0) return null;
    const owner = this.idxToCode[oi];
    const controller = this.idxToCode[ci];
    if (!owner || !controller) return null;
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    return { index: idx, row: r, col: c, lat: cellLat(r), lng: cellLng(c), owner, controller };
  }

  /* ================================================================ SAVE */
  getState(): Record<string, any> {
    const controllers: [number, string][] = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      const oi = this.ownerIdx[i]!;
      const ci = this.controllerIdx[i]!;
      if (oi < 0 || ci < 0 || oi === ci) continue;
      const code = this.idxToCode[ci];
      if (code) controllers.push([i, code]);
    }
    return {
      version: 1,
      controllers,
      capturedCities: Array.from(this.capturedCities)
    };
  }

  setState(s: Record<string, any>): void {
    if (!this.built) this._buildGrid();
    this.controllerIdx.set(this.ownerIdx);
    this.contestCode.fill(-1);
    this.contestProgress.fill(0);
    this.capturedCities.clear();
    if (Array.isArray(s.controllers)) {
      for (const pair of s.controllers as [number, string][]) {
        if (!Array.isArray(pair)) continue;
        const idx = pair[0];
        const code = pair[1];
        if (typeof idx !== 'number' || idx < 0 || idx >= CELL_COUNT) continue;
        const ci = this.codeToIdx.get(code);
        if (ci === undefined) continue;
        if (this.ownerIdx[idx]! < 0) continue;
        this.controllerIdx[idx] = ci;
      }
    }
    if (Array.isArray(s.capturedCities)) {
      for (const key of s.capturedCities as string[]) this.capturedCities.add(key);
    }
    this._recomputeStats();
    this._invalidate();
  }
}

export const territorySystem = TerritorySystem.getInstance();
