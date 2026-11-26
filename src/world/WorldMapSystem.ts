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
import { tacticalSystem } from '../tactical/TacticalSystem.js';
import { getCountryPolygons, getAntarcticaPolygons, getCountryBBox, LatLngRing } from './WorldGeometry.js';
import { WORLD_CITIES, WORLD_RIVERS, TERRAIN_ZONES, TRANSPORT_CORRIDORS } from '../data/worldGeoFeatures.js';

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

  private inspectedCode: string | null = null;
  private hoverCode: string | null = null;
  private hoverCity: string | null = null;
  private selectedUnitId: string | null = null;
  private mapMode: MapMode = 'political';
  private boundResize: () => void;
  private pulsePhase = 0;

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
    eventBus.on(GameEvents.GAME_LOADED, () => {
      this.selectedUnitId = null;
      this._render();
    });
    eventBus.on(GameEvents.COUNTRY_SELECTED, () => {
      this._render();
    });
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
    this.selectedUnitId = unitId;
    this._render();
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

  private _attachInput(): void {
    const c = this.canvas!;
    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.didDrag = false;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.camStart = { x: this.cx, y: this.cy };
    });

    window.addEventListener('mousemove', (e) => {
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

        if (hovered !== this.hoverCode || cityHit !== this.hoverCity) {
          this.hoverCode = hovered;
          this.hoverCity = cityHit;
          c.style.cursor = hovered ? 'pointer' : 'grab';
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
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

      // 1. Клик по маркеру активного сражения -> вход в 3D тактический режим
      const player = countrySystem.getPlayer();
      for (const b of militarySystem.getActiveBattles()) {
        const p = this.worldToScreen(b.lat, b.lng);
        if (Math.hypot(p.x - sx, p.y - sy) < 16) {
          if (player && (b.attackerCode === player.code || b.defenderCode === player.code)) {
            militarySystem.setBattleTactical(b.id, true);
            tacticalSystem.enterBattle(b.id, b.attackerUnits, b.defenderUnits);
            return;
          }
        }
      }

      // 2. Клик по юниту игрока
      if (player) {
        for (const u of militarySystem.getUnitsByCountry(player.code)) {
          const p = this.worldToScreen(u.lat, u.lng);
          if (Math.hypot(p.x - sx, p.y - sy) < 14) {
            this.selectedUnitId = u.id;
            eventBus.emit(GameEvents.TACTICAL_UNIT_SELECTED, { unitId: u.id });
            this._render();
            return;
          }
        }
      }

      // 3. Клик по стране
      this.selectedUnitId = null;
      const { lat, lng } = this.screenToWorld(sx, sy);
      const code = this._pickCountry(lat, lng);
      this.inspectCountry(code);
    });

    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.selectedUnitId) return;
      const rect = c.getBoundingClientRect();
      const { lat, lng } = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (militarySystem.orderMove(this.selectedUnitId, lat, lng)) {
        eventBus.emit(GameEvents.UNIT_MOVED, { unitId: this.selectedUnitId, lat, lng });
        this._render();
      }
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
    grad.addColorStop(0, '#091521');
    grad.addColorStop(0.5, '#0c1d2e');
    grad.addColorStop(1, '#08121c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this._drawGraticule();
    this._drawAntarctica();

    // 1. Физическая подложка суши и биомов (как в HOI4)
    const countries = countrySystem.getAll();
    this._drawLandBase(countries);
    this._drawHoIBaseTerrain();

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
    this._drawBattles();
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

  private _drawLandBase(countries: Country[]): void {
    const ctx = this.ctx!;
    ctx.save();
    // В режиме 'terrain' базовая суша имеет сочный тон низменностей, в других режимах — приглушённый
    ctx.fillStyle = this.mapMode === 'terrain' ? '#223824' : '#273429';
    for (const c of countries) {
      const polys = getCountryPolygons(c.code);
      if (!polys.length) continue;
      this._traceCountryPath(ctx, c);
      ctx.fill();
    }
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
    ctx.lineWidth = 1.1;
    if (u.type === 'infantry' || u.type === 'motorized' || u.type === 'airborne') {
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 2, y - h / 2 + 2);
      ctx.lineTo(x + w / 2 - 2, y + h / 2 - 2);
      ctx.moveTo(x + w / 2 - 2, y - h / 2 + 2);
      ctx.lineTo(x - w / 2 + 2, y + h / 2 - 2);
      ctx.stroke();
    } else if (u.type === 'tank' || u.type === 'mechanized') {
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.28, h * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (u.type === 'artillery') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (u.type === 'air') {
      ctx.beginPath();
      ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
      ctx.stroke();
    } else if (u.type === 'naval') {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 3);
      ctx.lineTo(x + 4, y - 3);
      ctx.stroke();
    }
  }

  private _drawUnits(): void {
    const ctx = this.ctx!;
    const player = countrySystem.getPlayer();
    ctx.save();
    for (const u of militarySystem.getAllUnits()) {
      if (u.strength <= 0) continue;
      const isPlayer = u.countryCode === player?.code;
      const isEnemy = player?.warWith.includes(u.countryCode) ?? false;
      const isAlly = player?.allies.includes(u.countryCode) ?? false;
      if (!isPlayer && !isEnemy && !isAlly && this.scale < 2.2) continue;

      const p = this.worldToScreen(u.lat, u.lng);
      if (p.x < -25 || p.x > this.canvas!.width + 25 || p.y < -25 || p.y > this.canvas!.height + 25) continue;

      if (u.targetLat !== undefined && u.targetLng !== undefined) {
        const tp = this.worldToScreen(u.targetLat, u.targetLng);
        ctx.strokeStyle = isPlayer ? 'rgba(63, 185, 80, 0.8)' : isEnemy ? 'rgba(248, 81, 73, 0.65)' : 'rgba(255,255,255,0.25)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const isSelected = u.id === this.selectedUnitId;
      const w = 20, h = 13;

      if (isSelected) {
        ctx.strokeStyle = 'rgba(251, 192, 45, 0.55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(p.x - w / 2 - 2, p.y - h / 2 - 2, w + 4, h + 4);
      }

      ctx.fillStyle = isPlayer ? '#1f6f3d' : isEnemy ? '#b91c1c' : isAlly ? '#1d4ed8' : '#30363d';
      ctx.strokeStyle = isSelected ? '#fbc02d' : '#e6edf3';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);

      this._drawUnitSymbol(ctx, u, p.x, p.y, w, h);

      // Полоса боеспособности под фишкой
      const hpRatio = Math.max(0, Math.min(1, u.strength / 1000));
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(p.x - w / 2, p.y + h / 2 + 2, w, 3);
      ctx.fillStyle = hpRatio > 0.6 ? '#3fb950' : hpRatio > 0.3 ? '#d29922' : '#f85149';
      ctx.fillRect(p.x - w / 2, p.y + h / 2 + 2, w * hpRatio, 3);

      // Эшелон над фишкой
      if (u.echelon && this.scale >= 1.6) {
        const echShort = ECHELON_META[u.echelon]?.label.slice(0, 3).toUpperCase() ?? '';
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '700 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(echShort, p.x, p.y - h / 2 - 4);
      }
    }
    ctx.restore();
  }

  private _drawBattles(): void {
    const battles = militarySystem.getActiveBattles();
    if (!battles.length) return;
    const ctx = this.ctx!;
    const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase);
    ctx.save();
    for (const b of battles) {
      const p = this.worldToScreen(b.lat, b.lng);
      const r = 12 + pulse * 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${0.22 + pulse * 0.18})`;
      ctx.fill();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚔', p.x, p.y + 0.5);
    }
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
