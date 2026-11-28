/* ============================================================
   world/WorldMapSystem.ts — стратегическая карта мира MilitaRIA
   Natural Earth 110m (166 государств на 2000 год), зум к курсору,
   рельеф (горы/леса/пустыни/реки), города/порты/авиабазы/магистрали,
   NATO-фишки юнитов, маркеры битв с переходом в 3D-тактику и легенда.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { Country } from '../country/Country.js';
import { militarySystem, ECHELON_META, MilitaryUnit } from '../military/MilitarySystem.js';
import { logisticsSystem } from '../logistics/LogisticsSystem.js';
import { intelSystem } from '../intel/IntelSystem.js';
import { getCountryPolygons, getAntarcticaPolygons, getCountryBBox, LatLngRing } from './WorldGeometry.js';
import { TerrainRenderer } from './TerrainRenderer.js';
import { WORLD_CITIES, WORLD_RIVERS, TRANSPORT_CORRIDORS } from '../data/worldGeoFeatures.js';

const LAT_MIN = -62;
const LAT_MAX = 84;
const LNG_MIN = -180;
const LNG_MAX = 180;

export type MapMode =
  | 'political'
  | 'terrain'
  | 'diplomacy'
  | 'economy'
  | 'military'
  | 'population'
  | 'supply'
  | 'resources'
  | 'infrastructure'
  | 'intel';

interface Vec { x: number; y: number; }

const MAP_MODE_LEGENDS: Record<MapMode, { title: string; items: { color: string; label: string }[] }> = {
  political:      { title: 'Политическая', items: [{ color: '#3fb950', label: 'Ваша страна' }, { color: '#fbc02d', label: 'Выбрано' }] },
  terrain:        { title: 'Рельеф', items: [{ color: '#cbd5e1', label: 'Хребты и пики' }, { color: '#475569', label: 'Горы' }, { color: '#166534', label: 'Леса/тайга' }, { color: '#ca8a04', label: 'Пустыни' }, { color: '#38bdf8', label: 'Реки' }] },
  diplomacy:      { title: 'Дипломатия', items: [{ color: '#1f6feb', label: 'Союзники' }, { color: '#3fb950', label: 'Дружеств.' }, { color: '#d97706', label: 'Враждебн.' }, { color: '#c62828', label: 'Война' }] },
  economy:        { title: 'Экономика (ВВП)', items: [{ color: '#1ce14e', label: 'Сверхдержавы' }, { color: '#1c8c4e', label: 'Средний' }, { color: '#1c464e', label: 'Низкий' }] },
  military:       { title: 'Военная мощь', items: [{ color: '#e13434', label: 'Крупная армия' }, { color: '#8c3434', label: 'Средняя' }, { color: '#4b3434', label: 'Малая' }] },
  population:     { title: 'Население', items: [{ color: '#2ad2e1', label: 'Густонасел.' }, { color: '#2a6ea0', label: 'Умеренное' }] },
  supply:         { title: 'Снабжение', items: [{ color: '#2e7d32', label: 'Норма (>75%)' }, { color: '#d29922', label: 'Дефицит' }, { color: '#c62828', label: 'Критично' }] },
  resources:      { title: 'Ресурсы', items: [{ color: '#dcaa23', label: 'Богатые' }, { color: '#6e7a23', label: 'Средние' }, { color: '#325a23', label: 'Бедные' }] },
  infrastructure: { title: 'Инфраструктура', items: [{ color: '#50d2e6', label: 'Развитая' }, { color: '#2d5082', label: 'Базовая' }] },
  intel:          { title: 'Разведка', items: [{ color: '#1f6feb', label: 'Высокая (>75%)' }, { color: '#d29922', label: 'Частичная' }, { color: '#3a4452', label: 'Слабая' }] }
};

export class WorldMapSystem implements IGameSystem {
  readonly name = 'WorldMap';
  readonly priority = 10;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private scale = 1.15;
  private cx = 0;
  private cy = 0;

  private isDragging = false;
  private didDrag = false;
  private dragStart = { x: 0, y: 0 };
  private camStart = { x: 0, y: 0 };

  private isBoxSelecting = false;
  private boxStart = { x: 0, y: 0 };
  private boxEnd = { x: 0, y: 0 };

  private inspectedCode: string | null = null;
  private hoverCode: string | null = null;
  private hoverCity: string | null = null;
  private hoverUnitId: string | null = null;
  private selectedUnitIds = new Set<string>();
  private unitScreenRects: { id: string; countryCode: string; x: number; y: number; w: number; h: number }[] = [];
  private mapMode: MapMode = 'political';
  private boundResize: () => void;
  private pulsePhase = 0;
  private terrainRenderer = new TerrainRenderer();

  static instance: WorldMapSystem;
  static getInstance(): WorldMapSystem {
    if (!WorldMapSystem.instance) WorldMapSystem.instance = new WorldMapSystem();
    return WorldMapSystem.instance;
  }
  private constructor() {
    this.boundResize = () => this.resize();
  }

  async init(): Promise<void> {
    this.canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    if (!this.canvas || !this.ctx) {
      console.error('[WorldMapSystem] mapCanvas не найден');
      return;
    }
    this.resize();
    window.addEventListener('resize', this.boundResize);
    this._attachInput();
<<<<<<< HEAD
    eventBus.on(GameEvents.GAME_LOADED, () => {
      this.selectedUnitId = null;
      this._render();
    });
    eventBus.on(GameEvents.COUNTRY_SELECTED, () => {
      this._render();
    });
=======
    this.terrainRenderer.load(() => this._render());
>>>>>>> 38be580 (fgsgfdgs)
    this._render();
    console.log('[WorldMapSystem] инициализировано (реальная карта мира + инфраструктура)');
  }

  update(dt: number): void {
    this.pulsePhase += dt * 3.2;
    this._render();
  }

  shutdown(): void {
    window.removeEventListener('resize', this.boundResize);
    this.canvas = null;
    this.ctx = null;
  }

  setMapMode(mode: MapMode): void {
    this.mapMode = mode;
    eventBus.emit(GameEvents.MAP_MODE_CHANGED, { mode });
    this._render();
  }

  getMapMode(): MapMode {
    return this.mapMode;
  }

  setSelectedUnit(unitId: string | null): void {
    this.selectedUnitIds.clear();
    if (unitId) this.selectedUnitIds.add(unitId);
    this._render();
  }

  setSelectedUnits(unitIds: string[]): void {
    this.selectedUnitIds.clear();
    for (const id of unitIds) this.selectedUnitIds.add(id);
    this._render();
  }

  getSelectedUnitIds(): string[] {
    return Array.from(this.selectedUnitIds);
  }

  focusUnit(unitId: string): void {
    const u = militarySystem.getUnit(unitId);
    if (!u || !this.canvas) return;
    this.scale = Math.max(this.scale, 3.0);
    const w = this.canvas.width;
    const h = this.canvas.height;
    const sx = ((u.lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * w;
    const sy = ((LAT_MAX - u.lat) / (LAT_MAX - LAT_MIN)) * h;
    this.cx = w / 2 - (sx - w / 2) * this.scale;
    this.cy = h / 2 - (sy - h / 2) * this.scale;
    this.setSelectedUnit(unitId);
  }

  getInspectedCode(): string | null {
    return this.inspectedCode;
  }

  focusCountry(code: string): void {
    const c = countrySystem.getCountry(code);
    if (!c || !this.canvas) return;
    this.scale = Math.max(this.scale, 2.6);
    const w = this.canvas.width;
    const h = this.canvas.height;
    const sx = ((c.capLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * w;
    const sy = ((LAT_MAX - c.capLat) / (LAT_MAX - LAT_MIN)) * h;
    this.cx = w / 2 - (sx - w / 2) * this.scale;
    this.cy = h / 2 - (sy - h / 2) * this.scale;
    this.inspectCountry(code);
  }

  resize(): void {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement!;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    if (this.cx === 0 && this.cy === 0) {
      this.cx = this.canvas.width / 2;
      this.cy = this.canvas.height / 2;
    }
    this._render();
  }

  private worldToScreen(lat: number, lng: number): Vec {
    const w = this.canvas!.width;
    const h = this.canvas!.height;
    const sx = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * w;
    const sy = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * h;
    return {
      x: this.cx + (sx - w / 2) * this.scale,
      y: this.cy + (sy - h / 2) * this.scale
    };
  }

  private screenToWorld(x: number, y: number): { lat: number; lng: number } {
    const w = this.canvas!.width;
    const h = this.canvas!.height;
    const sx = w / 2 + (x - this.cx) / this.scale;
    const sy = h / 2 + (y - this.cy) / this.scale;
    const lng = LNG_MIN + (sx / w) * (LNG_MAX - LNG_MIN);
    const lat = LAT_MAX - (sy / h) * (LAT_MAX - LAT_MIN);
    return { lat, lng };
  }

  private _pickPlayerUnitsAt(sx: number, sy: number): string[] {
    const player = countrySystem.getPlayer();
    if (!player) return [];
    const hits: string[] = [];
    for (let i = this.unitScreenRects.length - 1; i >= 0; i--) {
      const r = this.unitScreenRects[i]!;
      if (r.countryCode !== player.code) continue;
      if (
        sx >= r.x - r.w / 2 - 6 &&
        sx <= r.x + r.w / 2 + 6 &&
        sy >= r.y - r.h / 2 - 8 &&
        sy <= r.y + r.h / 2 + 8
      ) {
        hits.push(r.id);
      }
    }
    return hits;
  }

  private _emitSelectionChanged(): void {
    const ids = Array.from(this.selectedUnitIds);
    eventBus.emit(GameEvents.TACTICAL_UNIT_SELECTED, {
      unitId: ids[0] ?? null,
      unitIds: ids
    });
  }

  private _attachInput(): void {
    const c = this.canvas!;
    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.shiftKey) {
        this.isBoxSelecting = true;
        this.didDrag = false;
        this.boxStart = { x: mx, y: my };
        this.boxEnd = { x: mx, y: my };
        return;
      }
      this.isDragging = true;
      this.didDrag = false;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.camStart = { x: this.cx, y: this.cy };
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isBoxSelecting) {
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (Math.hypot(mx - this.boxStart.x, my - this.boxStart.y) > 4) this.didDrag = true;
        this.boxEnd = { x: mx, y: my };
        this._render();
        return;
      }
      if (this.isDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 4) this.didDrag = true;
        this.cx = this.camStart.x + dx;
        this.cy = this.camStart.y + dy;
        this._render();
        return;
      }
      if (e.target === c) {
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const unitHits = this._pickPlayerUnitsAt(mx, my);
        const unitHover = unitHits[0] ?? null;

        const { lat, lng } = this.screenToWorld(mx, my);
        const hovered = this._pickCountry(lat, lng);

        let cityHit: string | null = null;
        if (this.scale >= 1.8) {
          for (const city of WORLD_CITIES) {
            const p = this.worldToScreen(city.lat, city.lng);
            if (Math.hypot(p.x - mx, p.y - my) < 9) {
              cityHit = `${city.name}${city.isPort ? ' (Порт)' : ''}${city.isAirbase ? ' (Авиабаза)' : ''}`;
              break;
            }
          }
        }

        if (hovered !== this.hoverCode || cityHit !== this.hoverCity || unitHover !== this.hoverUnitId) {
          this.hoverCode = hovered;
          this.hoverCity = cityHit;
          this.hoverUnitId = unitHover;
          c.style.cursor = unitHover ? 'pointer' : hovered ? 'pointer' : 'grab';
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isBoxSelecting) {
        this.isBoxSelecting = false;
        if (this.didDrag) {
          const minX = Math.min(this.boxStart.x, this.boxEnd.x);
          const maxX = Math.max(this.boxStart.x, this.boxEnd.x);
          const minY = Math.min(this.boxStart.y, this.boxEnd.y);
          const maxY = Math.max(this.boxStart.y, this.boxEnd.y);
          const player = countrySystem.getPlayer();
          if (player) {
            this.selectedUnitIds.clear();
            for (const r of this.unitScreenRects) {
              if (r.countryCode !== player.code) continue;
              if (r.x >= minX && r.x <= maxX && r.y >= minY && r.y <= maxY) {
                this.selectedUnitIds.add(r.id);
              }
            }
            this._emitSelectionChanged();
          }
        }
        this._render();
      }
      this.isDragging = false;
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.selectedUnitIds.size > 0) {
        this.selectedUnitIds.clear();
        this._emitSelectionChanged();
        this._render();
      }
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      const newScale = Math.min(Math.max(this.scale * factor, 0.75), 14);
      if (newScale === this.scale) return;

      const ratio = newScale / this.scale;
      this.cx = mx - (mx - this.cx) * ratio;
      this.cy = my - (my - this.cy) * ratio;
      this.scale = newScale;
      this._render();
    }, { passive: false });

    c.addEventListener('click', (e) => {
      if (this.didDrag) {
        this.didDrag = false;
        return;
      }
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // 1. Клик ЛКМ по дивизии игрока
      const hits = this._pickPlayerUnitsAt(sx, sy);
      if (hits.length > 0) {
        if (e.shiftKey) {
          const targetId = hits[0]!;
          if (this.selectedUnitIds.has(targetId)) {
            this.selectedUnitIds.delete(targetId);
          } else {
            this.selectedUnitIds.add(targetId);
          }
        } else {
          // Если кликнули по стопке, где одна из дивизий уже выбрана — переключаемся на следующую в стопке
          let chosen = hits[0]!;
          if (hits.length > 1 && this.selectedUnitIds.size === 1) {
            const cur = Array.from(this.selectedUnitIds)[0]!;
            const idx = hits.indexOf(cur);
            if (idx !== -1) chosen = hits[(idx + 1) % hits.length]!;
          }
          this.selectedUnitIds.clear();
          this.selectedUnitIds.add(chosen);
        }
        this._emitSelectionChanged();
        this._render();
        return;
      }

      // 2. Клик по стране / пустому месту — снимаем выделение дивизий и инспектируем страну
      if (this.selectedUnitIds.size > 0) {
        this.selectedUnitIds.clear();
        this._emitSelectionChanged();
      }
      const { lat, lng } = this.screenToWorld(sx, sy);
      const code = this._pickCountry(lat, lng);
      this.inspectCountry(code);
    });

    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.selectedUnitIds.size === 0) return;
      const rect = c.getBoundingClientRect();
      const { lat, lng } = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const ids = Array.from(this.selectedUnitIds);
      const cols = Math.ceil(Math.sqrt(ids.length));
      const spread = 0.35;
      ids.forEach((uid, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const dLat = ids.length === 1 ? 0 : (row - (Math.ceil(ids.length / cols) - 1) / 2) * spread;
        const dLng = ids.length === 1 ? 0 : (col - (cols - 1) / 2) * spread;
        if (militarySystem.orderMove(uid, lat + dLat, lng + dLng)) {
          eventBus.emit(GameEvents.UNIT_MOVED, { unitId: uid, lat: lat + dLat, lng: lng + dLng });
        }
      });
      this._render();
    });
  }

  inspectCountry(code: string | null): void {
    this.inspectedCode = code;
    eventBus.emit(GameEvents.PROVINCE_CLICK, { code });
    this._render();
  }

  private _pickCountry(lat: number, lng: number): string | null {
    for (const c of countrySystem.getAll()) {
      const bbox = getCountryBBox(c.code);
      if (bbox && (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng)) {
        continue;
      }
      const polys = getCountryPolygons(c.code);
      for (const poly of polys) {
        const outer = poly[0];
        if (outer && this._pointInRing(lat, lng, outer)) return c.code;
      }
    }
    return null;
  }

  private _pointInRing(lat: number, lng: number, ring: LatLngRing): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i]![0], xi = ring[i]![1];
      const yj = ring[j]![0], xj = ring[j]![1];
      if ((yi > lat) !== (yj > lat)) {
        const intersectX = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (lng < intersectX) inside = !inside;
      }
    }
    return inside;
  }

  /* ---------- рендер ---------- */
  private _getCountryFillColor(c: Country): string {
    const player = countrySystem.getPlayer();
    switch (this.mapMode) {
      case 'diplomacy': {
        if (!player || c.code === player.code) return '#2e7d32';
        if (player.warWith.includes(c.code)) return '#c62828';
        if (player.allies.includes(c.code)) return '#1f6feb';
        const rel = player.getRelation(c.code);
        if (rel >= 0.3) return '#3fb950';
        if (rel <= -0.3) return '#d97706';
        return '#485665';
      }
      case 'economy': {
        const t = Math.min(1, Math.log10(Math.max(1, c.gdp)) / 4.1);
        const g = Math.round(70 + t * 155);
        return `rgb(28, ${g}, 78)`;
      }
      case 'military': {
        const units = militarySystem.getUnitsByCountry(c.code).length;
        const t = Math.min(1, units / 8);
        return `rgb(${Math.round(75 + t * 150)}, 52, 52)`;
      }
      case 'population': {
        const t = Math.min(1, Math.log10(Math.max(0.5, c.population)) / 3.2);
        return `rgb(42, ${Math.round(75 + t * 135)}, ${Math.round(125 + t * 100)})`;
      }
      case 'supply': {
        const s = c.supplyLevel;
        return s > 0.75 ? '#2e7d32' : s > 0.45 ? '#d29922' : '#c62828';
      }
      case 'resources': {
        const total = c.resources.oil + c.resources.steel + c.resources.energy;
        const t = Math.min(1, total / 350);
        return `rgb(${Math.round(50 + t * 170)}, ${Math.round(90 + t * 80)}, 35)`;
      }
      case 'infrastructure': {
        const infra = logisticsSystem.getLogistics(c.code).infraLevel;
        const t = Math.min(1, Math.max(0, (infra - 0.3) / 1.7));
        return `rgb(${Math.round(45 + t * 35)}, ${Math.round(80 + t * 130)}, ${Math.round(130 + t * 100)})`;
      }
      case 'intel': {
        if (!player || c.code === player.code) return '#2e7d32';
        const lvl = intelSystem.getIntelLevel(player.code, c.code);
        return lvl >= 0.75 ? '#1f6feb' : lvl >= 0.45 ? '#d29922' : '#3a4452';
      }
      case 'terrain':
        return 'rgba(0,0,0,0)';
      case 'political':
      default:
        return c.color;
    }
  }

  private _render(): void {
    if (!this.ctx || !this.canvas) return;
    const { ctx, canvas } = this;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#06101c');
    grad.addColorStop(0.5, '#0b1c2e');
    grad.addColorStop(1, '#06101c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this._drawGraticule();

<<<<<<< HEAD
    // 1. Физическая подложка суши и биомов (как в HOI4)
=======
    // 1. Физическая подложка суши и рельефа (спутниковый рельеф + береговой шельф)
>>>>>>> 38be580 (fgsgfdgs)
    const countries = countrySystem.getAll();
    this._drawCoastalShelf(countries);
    this._drawAntarctica();
    this._drawLandBase(countries);
<<<<<<< HEAD
    this._drawHoIBaseTerrain();
=======
    this._drawRivers();
>>>>>>> 38be580 (fgsgfdgs)

    // 2. Политическая заливка стран и чёткие границы
    const player = countrySystem.getPlayer();
    for (const c of countries) {
      this._drawCountry(c);
    }

    // 3. Рельефные хребты, затенение склонов (hillshading), пики и реки поверх заливки
    this._drawHoIReliefShading(this.mapMode === 'terrain');
    this._drawRivers();
    this._drawTerrainLabels();

    this._drawTransportCorridors();

    if (this.hoverCode && this.hoverCode !== this.inspectedCode) {
      const hov = countrySystem.getCountry(this.hoverCode);
      if (hov) this._drawOutline(hov, 'rgba(255,255,255,0.55)', 1.5);
    }
    if (player) {
      this._drawOutline(player, '#3fb950', 2.2);
    }
    if (this.inspectedCode && this.inspectedCode !== player?.code) {
      const insp = countrySystem.getCountry(this.inspectedCode);
      if (insp) this._drawOutline(insp, '#fbc02d', 2.2);
    }

    this._drawCities();
    this._drawLabels();
    this._drawUnits();
    this._drawSelectionBox();
    this._drawLegend();
    this._drawHoverTooltip();
  }

  private _drawGraticule(): void {
    const ctx = this.ctx!;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 80; lat += 20) {
      const p1 = this.worldToScreen(lat, LNG_MIN);
      const p2 = this.worldToScreen(lat, LNG_MAX);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let lng = -180; lng <= 180; lng += 30) {
      const p1 = this.worldToScreen(LAT_MIN, lng);
      const p2 = this.worldToScreen(LAT_MAX, lng);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();
  }

  private _drawAntarctica(): void {
    const ctx = this.ctx!;
    const polys = getAntarcticaPolygons();
    if (!polys.length) return;
    ctx.save();
    ctx.fillStyle = '#1b2836';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.8;
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 3) continue;
      ctx.beginPath();
      const first = this.worldToScreen(ring[0]![0], ring[0]![1]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < ring.length; i++) {
        const p = this.worldToScreen(ring[i]![0], ring[i]![1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private _traceCountryPath(ctx: CanvasRenderingContext2D, c: Country): void {
    const polys = getCountryPolygons(c.code);
    ctx.beginPath();
    this._appendCountryPath(ctx, c, polys);
  }

  /** Добавляет полигоны страны в ТЕКУЩИЙ путь (без beginPath) — нужно для clip. */
  private _appendCountryPath(
    ctx: CanvasRenderingContext2D,
    _c: Country,
    polys = getCountryPolygons(_c.code)
  ): void {
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 3) continue;
      const first = this.worldToScreen(ring[0]![0], ring[0]![1]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < ring.length; i++) {
        const p = this.worldToScreen(ring[i]![0], ring[i]![1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    }
  }

  /** Береговой шельф — мягкое голубоватое свечение вокруг суши */
  private _drawCoastalShelf(countries: Country[]): void {
    const ctx = this.ctx!;
    ctx.save();
<<<<<<< HEAD
    // В режиме 'terrain' базовая суша имеет сочный тон низменностей, в других режимах — приглушённый
    ctx.fillStyle = this.mapMode === 'terrain' ? '#223824' : '#273429';
=======
    ctx.shadowColor = 'rgba(56,110,160,0.35)';
    ctx.shadowBlur = Math.max(6, this.scale * 5);
    ctx.fillStyle = 'rgba(56,110,160,0.18)';
>>>>>>> 38be580 (fgsgfdgs)
    for (const c of countries) {
      if (!getCountryPolygons(c.code).length) continue;
      this._traceCountryPath(ctx, c);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private _drawLandBase(countries: Country[]): void {
    const ctx = this.ctx!;

    // Шаг 1: базовый фолбэк-цвет суши (если текстура ещё не загружена)
    ctx.save();
    ctx.fillStyle = '#2c3d2e';
    for (const c of countries) {
      if (!getCountryPolygons(c.code).length) continue;
      this._traceCountryPath(ctx, c);
      ctx.fill();
    }
    ctx.restore();

    // Шаг 2: спутниковый рельеф, обрезанный по ОБЪЕДИНЁННОМУ силуэту суши
    if (!this.terrainRenderer.isReady()) return;

    // Экранный прямоугольник, покрывающий весь мир [-62..84 lat, -180..180 lng]
    const topLeft  = this.worldToScreen(84,  -180);
    const botRight = this.worldToScreen(-62,  180);
    const rX = topLeft.x;
    const rY = topLeft.y;
    const rW = botRight.x - rX;
    const rH = botRight.y - rY;

    if (rW <= 0 || rH <= 0) return;

    ctx.save();
    // Строим ОДИН общий clip-путь для всей суши.
    // ВАЖНО: beginPath() только один раз снаружи цикла,
    // внутри используем _appendCountryPath (без beginPath внутри).
    ctx.beginPath();
    for (const c of countries) {
      const polys = getCountryPolygons(c.code);
      if (!polys.length) continue;
      this._appendCountryPath(ctx, c, polys);
    }
    ctx.clip();

    this.terrainRenderer.drawRelief(ctx, rX, rY, rW, rH);
    ctx.restore();
  }

  private _drawCountry(c: Country): void {
    const ctx = this.ctx!;
    const polys = getCountryPolygons(c.code);
    if (!polys.length) return;

    ctx.save();
    const isInspected = this.inspectedCode === c.code;
    const isHovered = this.hoverCode === c.code;
    const isTerrainMode = this.mapMode === 'terrain';
    const fillColor = this._getCountryFillColor(c);

    // Заливка территории страны
    if (!isTerrainMode) {
      ctx.fillStyle = fillColor;
      // В HoI4 полупрозрачные цвета наций: рельеф пробивается сквозь цвет
      ctx.globalAlpha = isInspected ? 0.48 : isHovered ? 0.40 : 0.30;
      this._traceCountryPath(ctx, c);
      ctx.fill();
    } else if (isInspected || isHovered) {
      // В режиме рельефа земля открыта на 100%, при наведении — деликатная подсветка
      ctx.fillStyle = isInspected ? 'rgba(251, 191, 36, 0.20)' : 'rgba(255, 255, 255, 0.10)';
      ctx.globalAlpha = 1;
      this._traceCountryPath(ctx, c);
      ctx.fill();
    }

    // Визуальная штриховка оккупированной страны цветом оккупанта
    if (c.occupiedBy) {
      const occ = countrySystem.getCountry(c.occupiedBy);
      ctx.save();
      this._traceCountryPath(ctx, c);
      ctx.clip();
      ctx.strokeStyle = occ?.color ?? '#ef4444';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2.2;
      const step = 12;
      for (let x = -this.canvas!.height; x < this.canvas!.width + this.canvas!.height; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + this.canvas!.height, this.canvas!.height);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Внутренний цветной контур границы (стиль HOI4) + внешняя чёткая обводка
    ctx.globalAlpha = isTerrainMode ? 0.95 : 0.78;
    ctx.strokeStyle = isTerrainMode ? c.color : fillColor;
    ctx.lineWidth = Math.max(1.2, Math.min(2.8, this.scale * (isTerrainMode ? 1.1 : 0.9)));
    ctx.stroke();

    ctx.globalAlpha = isTerrainMode ? 0.85 : 0.90;
    ctx.strokeStyle = 'rgba(9, 13, 18, 0.85)';
    ctx.lineWidth = Math.max(0.6, Math.min(1.4, this.scale * 0.45));
    ctx.stroke();
    ctx.restore();
  }

<<<<<<< HEAD
  private _drawHoIBaseTerrain(): void {
    const ctx = this.ctx!;
    const isTerrain = this.mapMode === 'terrain';
    ctx.save();
    for (const z of TERRAIN_ZONES) {
      const p = this.worldToScreen(z.lat, z.lng);
      const pEdge = this.worldToScreen(z.lat + z.rx, z.lng + z.ry);
      const rx = Math.abs(pEdge.x - p.x);
      const ry = Math.abs(pEdge.y - p.y);
      if (rx < 4 || ry < 4) continue;

      ctx.save();
      ctx.translate(p.x, p.y);
      if (z.angle) ctx.rotate(z.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);

      if (z.type === 'desert') {
        ctx.fillStyle = isTerrain ? 'rgba(217, 119, 6, 0.45)' : 'rgba(180, 100, 20, 0.32)';
        ctx.fill();
        // Дюны / песчаные волны
        if (this.scale >= 1.0) {
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
          ctx.lineWidth = 1;
          const lines = Math.min(8, Math.max(3, Math.floor(ry / 10)));
          for (let i = -lines; i <= lines; i++) {
            const yy = (i / (lines + 1)) * ry * 0.8;
            const w = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2)) * 0.75;
            ctx.beginPath();
            ctx.moveTo(-w, yy);
            ctx.bezierCurveTo(-w * 0.3, yy - 3, w * 0.3, yy + 3, w, yy);
            ctx.stroke();
          }
        }
      } else if (z.type === 'forest') {
        ctx.fillStyle = isTerrain ? 'rgba(21, 128, 61, 0.46)' : 'rgba(20, 83, 45, 0.35)';
        ctx.fill();
        // Текстура крон деревьев (тайга / сельва в стиле HoI)
        if (this.scale >= 1.1) {
          ctx.fillStyle = isTerrain ? 'rgba(15, 90, 42, 0.55)' : 'rgba(12, 60, 30, 0.45)';
          const count = Math.min(18, Math.max(4, Math.floor((rx * ry) / 450)));
          for (let i = 0; i < count; i++) {
            const seed = (i * 9301 + 49297) % 233280;
            const rnd1 = (seed / 233280) * 2 - 1;
            const rnd2 = (((seed * 9301 + 49297) % 233280) / 233280) * 2 - 1;
            if (rnd1 * rnd1 + rnd2 * rnd2 <= 0.75) {
              const cx = rnd1 * rx * 0.75;
              const cy = rnd2 * ry * 0.75;
              const rad = Math.min(8, 2.5 + this.scale * 0.8);
              ctx.beginPath();
              ctx.arc(cx, cy, rad, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else if (z.type === 'marsh') {
        ctx.fillStyle = isTerrain ? 'rgba(14, 116, 144, 0.42)' : 'rgba(21, 94, 117, 0.32)';
        ctx.fill();
      } else if (z.type === 'mountain') {
        // Подложка горного массива
        ctx.fillStyle = isTerrain ? 'rgba(51, 65, 85, 0.52)' : 'rgba(40, 52, 68, 0.35)';
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private _drawHoIReliefShading(isTerrainMode: boolean): void {
    const ctx = this.ctx!;
    const w = this.canvas!.width;
    const h = this.canvas!.height;
    ctx.save();

    for (const z of TERRAIN_ZONES) {
      if (z.type !== 'mountain') continue;

      if (z.ridgePoints && z.ridgePoints.length >= 2) {
        const pts = z.ridgePoints.map(([lat, lng]) => this.worldToScreen(lat, lng));
        // Быстрый отсев невидимых за экраном хребтов
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        if (maxX < -60 || minX > w + 60 || maxY < -60 || minY > h + 60) continue;

        const elev = z.elevation ?? 0.75;
        const widthScale = Math.min(2.4, Math.max(0.7, this.scale));

        // 1. Основание горного массива (эшелонированное расширение)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.lineWidth = Math.max(7, elev * 24 * widthScale);
        ctx.strokeStyle = isTerrainMode ? 'rgba(38, 48, 60, 0.70)' : 'rgba(25, 33, 44, 0.45)';
        ctx.stroke();

        ctx.lineWidth = Math.max(4, elev * 14 * widthScale);
        ctx.strokeStyle = isTerrainMode ? 'rgba(55, 68, 85, 0.85)' : 'rgba(40, 52, 68, 0.60)';
        ctx.stroke();

        // 2. Hillshading: Затенение склонов с Юго-Востока (свет с Северо-Запада под 315°)
        const off = Math.max(1.8, elev * 3.8 * widthScale);
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x + off, pts[0]!.y + off * 1.2);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x + off, pts[i]!.y + off * 1.2);
        ctx.lineWidth = Math.max(3, elev * 9 * widthScale);
        ctx.strokeStyle = isTerrainMode ? 'rgba(10, 16, 26, 0.88)' : 'rgba(2, 6, 20, 0.68)';
        ctx.stroke();

        // 3. Hillshading: Освещённый склон с Северо-Запада (гребень в лучах солнца)
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x - off, pts[0]!.y - off * 1.2);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x - off, pts[i]!.y - off * 1.2);
        ctx.lineWidth = Math.max(2, elev * 6.5 * widthScale);
        ctx.strokeStyle = isTerrainMode ? 'rgba(248, 250, 252, 0.88)' : 'rgba(255, 255, 255, 0.72)';
        ctx.stroke();

        // 4. Острый контрастный гребень хребта
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.lineWidth = Math.max(1.2, 1.8 * widthScale);
        ctx.strokeStyle = isTerrainMode ? '#f1f5f9' : 'rgba(255, 255, 255, 0.90)';
        ctx.stroke();

        // 5. Поперечные отроги (горные штрихи в стиле картографии Paradox)
        ctx.lineWidth = 1;
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i]!, p2 = pts[i + 1]!;
          const ddx = p2.x - p1.x, ddy = p2.y - p1.y;
          const len = Math.hypot(ddx, ddy);
          if (len < 8) continue;
          const nx = -ddy / len, ny = ddx / len;
          const steps = Math.floor(len / 12);
          for (let s = 1; s <= steps; s++) {
            const t = s / (steps + 1);
            const mx = p1.x + ddx * t, my = p1.y + ddy * t;
            const spurLen = (4 + ((s % 2) * 3)) * elev * widthScale;
            // Светлый отрог на СЗ
            ctx.strokeStyle = isTerrainMode ? 'rgba(241, 245, 249, 0.60)' : 'rgba(255, 255, 255, 0.45)';
            ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + nx * spurLen, my + ny * spurLen); ctx.stroke();
            // Теневой отрог на ЮВ
            ctx.strokeStyle = isTerrainMode ? 'rgba(15, 23, 42, 0.70)' : 'rgba(2, 6, 23, 0.55)';
            ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - nx * spurLen * 1.2, my - ny * spurLen * 1.2); ctx.stroke();
          }
        }

        // 6. 3D-пики вершин со снежными шапками
        if (this.scale >= 0.95) {
          for (let i = 0; i < pts.length; i++) {
            const pt = pts[i]!;
            const peakH = (6 + (i % 2) * 3) * elev * Math.min(2.0, this.scale);
            const peakW = peakH * 0.9;
            // Левая грань (свет)
            ctx.fillStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - peakH);
            ctx.lineTo(pt.x - peakW, pt.y + peakH * 0.3);
            ctx.lineTo(pt.x, pt.y + peakH * 0.3);
            ctx.closePath();
            ctx.fill();
            // Правая грань (тень)
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - peakH);
            ctx.lineTo(pt.x, pt.y + peakH * 0.3);
            ctx.lineTo(pt.x + peakW, pt.y + peakH * 0.3);
            ctx.closePath();
            ctx.fill();
            // Снежная шапка на вершине (для высоких гор)
            if (elev >= 0.70) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.moveTo(pt.x, pt.y - peakH);
              ctx.lineTo(pt.x - peakW * 0.45, pt.y - peakH * 0.4);
              ctx.lineTo(pt.x + peakW * 0.45, pt.y - peakH * 0.4);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      } else {
        // Одиночный горный массив (если нет ridgePoints)
        const p = this.worldToScreen(z.lat, z.lng);
        const pEdge = this.worldToScreen(z.lat + z.rx, z.lng + z.ry);
        const rx = Math.abs(pEdge.x - p.x), ry = Math.abs(pEdge.y - p.y);
        if (rx < 4 || ry < 4) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        if (z.angle) ctx.rotate(z.angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = isTerrainMode ? 'rgba(71, 85, 105, 0.65)' : 'rgba(51, 65, 85, 0.45)';
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

=======
>>>>>>> 38be580 (fgsgfdgs)
  private _drawRivers(): void {
    const ctx = this.ctx!;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of WORLD_RIVERS) {
      if (r.points.length < 2) continue;
      const pts = r.points.map(([lat, lng]) => this.worldToScreen(lat, lng));

      // 1. Русло и тёмный берег (контраст на фоне суши и границ)
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.strokeStyle = 'rgba(2, 132, 199, 0.45)';
      ctx.lineWidth = Math.min(3.8, 1.4 + this.scale * 0.65);
      ctx.stroke();

      // 2. Водная гладь реки (светло-голубой чистый цвет)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
      ctx.lineWidth = Math.min(2.6, 0.8 + this.scale * 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }

  private _drawTerrainLabels(): void {
    const isTerrain = this.mapMode === 'terrain';
    if (!isTerrain && this.scale < 1.35) return;
    if (isTerrain && this.scale < 0.9) return;
    const ctx = this.ctx!;
    ctx.save();
    ctx.font = 'italic 700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isTerrain ? 'rgba(241, 245, 249, 0.85)' : 'rgba(255, 255, 255, 0.72)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;

    const majorRanges = [
      'Альпы', 'Карпаты', 'Кавказ', 'Пиренеи', 'Урал', 'Гималаи и Каракорум',
      'Скалистые горы', 'Анды', 'Атласские горы', 'Скандинавские горы', 'Сахара', 'Сибирская тайга'
    ];

    for (const z of TERRAIN_ZONES) {
      if (!majorRanges.includes(z.name)) continue;
      const p = this.worldToScreen(z.lat, z.lng);
      if (p.x < -40 || p.x > this.canvas!.width + 40 || p.y < -40 || p.y > this.canvas!.height + 40) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (z.angle) ctx.rotate(z.angle * 0.6);
      // Картографическое разряженное написание
      const spaced = z.name.split('').join(' ').toUpperCase();
      ctx.fillText(spaced, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  private _drawTransportCorridors(): void {
    const showInfra = this.mapMode === 'infrastructure' || this.mapMode === 'supply' || this.scale >= 2.0;
    if (!showInfra) return;
    const ctx = this.ctx!;
    ctx.save();
    for (const tc of TRANSPORT_CORRIDORS) {
      const p1 = this.worldToScreen(tc.from[0], tc.from[1]);
      const p2 = this.worldToScreen(tc.to[0], tc.to[1]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      if (tc.kind === 'rail') {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.2;
      } else {
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
        ctx.setLineDash([]);
        ctx.lineWidth = 1.0;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private _drawCities(): void {
    if (this.scale < 1.35) return;
    const ctx = this.ctx!;
    ctx.save();
    for (const city of WORLD_CITIES) {
      if (!city.isCapital && this.scale < 2.1 && city.importance < 3) continue;
      const p = this.worldToScreen(city.lat, city.lng);
      if (p.x < -10 || p.x > this.canvas!.width + 10 || p.y < -10 || p.y > this.canvas!.height + 10) continue;

      const occCode = militarySystem.getCityOccupier(city.countryCode, city.name);
      if (occCode) {
        const occ = countrySystem.getCountry(occCode);
        ctx.strokeStyle = occ?.color ?? '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (city.isCapital) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0d1117';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = city.isPort ? '#38bdf8' : '#cbd5e1';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.scale >= 2.6) {
        ctx.font = city.isCapital ? '600 10px sans-serif' : '500 9px sans-serif';
        ctx.fillStyle = 'rgba(230, 237, 243, 0.85)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const suffix = (city.isPort ? ' ⚓' : '') + (city.isAirbase ? ' ✈' : '');
        ctx.fillText(city.name + suffix, p.x + 6, p.y);
      }
    }
    ctx.restore();
  }

  private _drawOutline(c: Country, color: string, width: number): void {
    const ctx = this.ctx!;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    this._traceCountryPath(ctx, c);
    ctx.stroke();
    ctx.restore();
  }

  private _drawLabels(): void {
    const ctx = this.ctx!;
    const player = countrySystem.getPlayer();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const c of countrySystem.getAll()) {
      const isKey = player?.code === c.code || this.inspectedCode === c.code || this.hoverCode === c.code;
      if (!isKey && this.scale < 2.2 && c.gdp < 180 && c.population < 40) continue;

      const { capLat, capLng, tag } = c.baseData;
      const p = this.worldToScreen(capLat, capLng);
      if (p.x < 0 || p.x > this.canvas!.width || p.y < 0 || p.y > this.canvas!.height) continue;

      ctx.font = isKey ? '700 11px sans-serif' : '600 9px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(tag, p.x + 1, p.y - 9);
      ctx.fillStyle = player?.code === c.code ? '#7ee787' : '#e6edf3';
      ctx.fillText(tag, p.x, p.y - 10);
    }
    ctx.restore();
  }

  private _drawUnitSymbol(ctx: CanvasRenderingContext2D, u: MilitaryUnit, x: number, y: number, w: number, h: number): void {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.7;
    if (u.type === 'infantry' || u.type === 'motorized' || u.type === 'airborne') {
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 4, y - h / 2 + 4);
      ctx.lineTo(x + w / 2 - 4, y + h / 2 - 4);
      ctx.moveTo(x + w / 2 - 4, y - h / 2 + 4);
      ctx.lineTo(x - w / 2 + 4, y + h / 2 - 4);
      ctx.stroke();
    } else if (u.type === 'tank' || u.type === 'mechanized') {
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.28, h * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (u.type === 'artillery') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (u.type === 'air') {
      ctx.beginPath();
      ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y);
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
      ctx.stroke();
    } else if (u.type === 'naval') {
      ctx.beginPath();
      ctx.arc(x, y - 1, 4.5, 0, Math.PI);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 4);
      ctx.lineTo(x + 6, y - 4);
      ctx.stroke();
    }
  }

  private _drawUnits(): void {
    const ctx = this.ctx!;
    const player = countrySystem.getPlayer();
    this.unitScreenRects = [];

    // Набор юнитов, участвующих в текущих боях (для аккуратной пометки на фишке)
    const fightingUnitIds = new Set<string>();
    for (const b of militarySystem.getActiveBattles()) {
      for (const id of b.attackerUnits) fightingUnitIds.add(id);
      for (const id of b.defenderUnits) fightingUnitIds.add(id);
    }

    const k = Math.min(1.25, Math.max(0.95, 0.85 + this.scale * 0.08));
    const w = Math.round(32 * k);
    const h = Math.round(21 * k);

    const placed: { x: number; y: number; count: number }[] = [];

    ctx.save();
    for (const u of militarySystem.getAllUnits()) {
      if (u.strength <= 0) continue;
      const isPlayer = u.countryCode === player?.code;
      const isEnemy = player?.warWith.includes(u.countryCode) ?? false;
      const isAlly = player?.allies.includes(u.countryCode) ?? false;
      if (!isPlayer && !isEnemy && !isAlly && this.scale < 2.2) continue;

      const baseP = this.worldToScreen(u.lat, u.lng);
      if (baseP.x < -40 || baseP.x > this.canvas!.width + 40 || baseP.y < -40 || baseP.y > this.canvas!.height + 40) continue;

      // Разводим перекрывающиеся дивизии лесенкой, чтобы по каждой было удобно кликать ЛКМ
      let ux = baseP.x;
      let uy = baseP.y;
      let stackIdx = 0;
      for (const pl of placed) {
        if (Math.abs(pl.x - baseP.x) < w * 0.7 && Math.abs(pl.y - baseP.y) < h * 0.7) {
          stackIdx = pl.count++;
          const col = stackIdx % 3;
          const row = Math.floor(stackIdx / 3);
          ux = baseP.x + col * 8 - row * 4;
          uy = baseP.y - stackIdx * 7;
          break;
        }
      }
      if (stackIdx === 0) {
        placed.push({ x: baseP.x, y: baseP.y, count: 1 });
      }

      this.unitScreenRects.push({ id: u.id, countryCode: u.countryCode, x: ux, y: uy, w, h });

      // Линия приказа движения
      if (u.targetLat !== undefined && u.targetLng !== undefined) {
        const tp = this.worldToScreen(u.targetLat, u.targetLng);
        ctx.strokeStyle = isPlayer ? 'rgba(63, 185, 80, 0.85)' : isEnemy ? 'rgba(248, 81, 73, 0.7)' : 'rgba(255,255,255,0.28)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ux, uy);
        ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      const isSelected = this.selectedUnitIds.has(u.id);
      const isHovered = this.hoverUnitId === u.id;
      const isFighting = fightingUnitIds.has(u.id);

      // Подсветка выделения / наведения
      if (isSelected) {
        ctx.strokeStyle = 'rgba(251, 192, 45, 0.65)';
        ctx.lineWidth = 5;
        ctx.strokeRect(ux - w / 2 - 2, uy - h / 2 - 2, w + 4, h + 4);
      } else if (isHovered) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 3;
        ctx.strokeRect(ux - w / 2 - 1, uy - h / 2 - 1, w + 2, h + 2);
      }

      // Тень под фишкой для чёткого контраста на рельефе
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(ux - w / 2 + 2, uy - h / 2 + 2, w, h);

      ctx.fillStyle = isPlayer ? '#1b6e3c' : isEnemy ? '#a61b1b' : isAlly ? '#1d4ed8' : '#30363d';
      ctx.strokeStyle = isSelected ? '#fbc02d' : isFighting ? '#f85149' : '#e6edf3';
      ctx.lineWidth = isSelected ? 2.2 : isFighting ? 1.8 : 1.2;
      ctx.fillRect(ux - w / 2, uy - h / 2, w, h);
      ctx.strokeRect(ux - w / 2, uy - h / 2, w, h);

      this._drawUnitSymbol(ctx, u, ux, uy, w, h);

      // Индикатор боя (маленький красный значок в углу фишки без кринжовых кругов)
      if (isFighting) {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(ux + w / 2 - 1, uy - h / 2 + 1, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Полосы боеспособности и морали под фишкой
      const hpRatio = Math.max(0, Math.min(1, u.strength / 1000));
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(ux - w / 2, uy + h / 2 + 2, w, 4);
      ctx.fillStyle = hpRatio > 0.6 ? '#3fb950' : hpRatio > 0.3 ? '#d29922' : '#f85149';
      ctx.fillRect(ux - w / 2, uy + h / 2 + 2, w * hpRatio, 4);

      // Эшелон над фишкой
      if (u.echelon && (this.scale >= 1.25 || isSelected)) {
        const echShort = ECHELON_META[u.echelon]?.label.slice(0, 3).toUpperCase() ?? '';
        ctx.fillStyle = isSelected ? '#fde047' : '#e2e8f0';
        ctx.font = '700 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(echShort, ux, uy - h / 2 - 4);
      }
    }
    ctx.restore();
  }

  private _drawSelectionBox(): void {
    if (!this.isBoxSelecting || !this.didDrag) return;
    const ctx = this.ctx!;
    const x = Math.min(this.boxStart.x, this.boxEnd.x);
    const y = Math.min(this.boxStart.y, this.boxEnd.y);
    const w = Math.abs(this.boxEnd.x - this.boxStart.x);
    const h = Math.abs(this.boxEnd.y - this.boxStart.y);
    ctx.save();
    ctx.fillStyle = 'rgba(63, 185, 80, 0.16)';
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  private _drawLegend(): void {
    const ctx = this.ctx!;
    const leg = MAP_MODE_LEGENDS[this.mapMode];
    if (!leg || !this.canvas) return;
    const x = 318; // справа от левой панели
    const y = this.canvas.height - 84;
    const itemW = 92;
    const w = Math.max(170, leg.items.length * itemW + 20);
    ctx.save();
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 34, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(leg.title.toUpperCase(), x + 10, y + 10);

    let ox = x + 10;
    for (const it of leg.items) {
      ctx.fillStyle = it.color;
      ctx.fillRect(ox, y + 20, 8, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 10px sans-serif';
      ctx.fillText(it.label, ox + 12, y + 24);
      ox += itemW;
    }
    ctx.restore();
  }

  private _drawHoverTooltip(): void {
    if (!this.hoverCode || !this.ctx || !this.canvas) return;
    const c = countrySystem.getCountry(this.hoverCode);
    if (!c) return;
    const ctx = this.ctx;
    const cityPart = this.hoverCity ? ` · 📍 ${this.hoverCity}` : '';
    const occPart = c.occupiedBy
      ? ` · 🏳 Оккуп.: ${countrySystem.getCountry(c.occupiedBy)?.nameRu ?? c.occupiedBy}`
      : c.occupationProgress > 0
        ? ` · ⚔ Захват: ${Math.round(c.occupationProgress * 100)}%`
        : '';
    const text = `${c.nameRu} (${c.code}) · ВВП $${Math.round(c.gdp)} млрд · Армия: ${militarySystem.getUnitsByCountry(c.code).length}${occPart}${cityPart}`;
    ctx.save();
    ctx.font = '600 12px sans-serif';
    const w = ctx.measureText(text).width + 20;
    const x = Math.round(this.canvas.width / 2 - w / 2);
    const y = this.canvas.height - 84;
    ctx.fillStyle = 'rgba(22, 27, 34, 0.92)';
    ctx.strokeStyle = '#3d4652';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6edf3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.canvas.width / 2, y + 13);
    ctx.restore();
  }
}

export const worldMapSystem = WorldMapSystem.getInstance();
