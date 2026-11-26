/* ============================================================
   tactical/TacticalSystem.ts — 3D тактические сражения (MilitaRIA)
   Three.js 3D-карта: рельеф, река с водой, мост, дорога, леса, здания,
   ключевые точки, построения, выделение рамкой, туман войны, погода и отчёт.
   ============================================================ */
import * as THREE from 'three';
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { militarySystem, UNIT_META } from '../military/MilitarySystem.js';
import { technologySystem } from '../tech/TechnologySystem.js';
import { gameTime } from '../core/GameTime.js';

export type TacticalOrder = 'move' | 'hold' | 'retreat' | 'attack' | 'recon' | 'guard' | 'regroup' | 'occupy';
export type TacticalFormation = 'line' | 'column' | 'wedge';
export type TacticalWeather = 'clear' | 'rain' | 'fog' | 'snow';

const WEATHER_META: Record<TacticalWeather, { label: string; visMult: number; speedMult: number; fogDensity: number; skyColor: number }> = {
  clear: { label: 'Ясно', visMult: 1.0, speedMult: 1.0, fogDensity: 0.0020, skyColor: 0x101824 },
  rain:  { label: 'Дождь', visMult: 0.78, speedMult: 0.85, fogDensity: 0.0042, skyColor: 0x0d141d },
  fog:   { label: 'Туман', visMult: 0.55, speedMult: 0.92, fogDensity: 0.0090, skyColor: 0x1a222c },
  snow:  { label: 'Снег', visMult: 0.72, speedMult: 0.78, fogDensity: 0.0052, skyColor: 0x18202b }
};

export interface TacUnit {
  id: string;
  stratId: string;
  countryCode: string;
  side: 'attacker' | 'defender';
  name: string;
  type: string;
  x: number; y: number;   // логические координаты 0..1200 x 0..700
  tx: number; ty: number; // цель
  hp: number;             // 0..100
  morale: number;         // 0..1
  fatigue: number;        // 0..1
  supply: number;         // 0..1
  order: TacticalOrder;
  formation: TacticalFormation;
  experience: number;
  selected: boolean;
  spotted: boolean;
  inCover: boolean;
  onRoad: boolean;
}

export interface TacObjective {
  id: string;
  name: string;
  x: number;
  y: number;
  owner: 'attacker' | 'defender' | 'neutral';
}

export interface BattleReport {
  winner: 'attacker' | 'defender' | 'draw';
  attackerLosses: number;
  defenderLosses: number;
  territoryCaptured: boolean;
  objectivesHeld: number;
  expGained: number;
  weather: TacticalWeather;
}

interface Tracer {
  line: THREE.Line;
  ttl: number;
}

const WORLD_W = 240;
const WORLD_D = 140;
const LOGICAL_W = 1200;
const LOGICAL_H = 700;

export class TacticalSystem implements IGameSystem {
  readonly name = 'Tactical';
  readonly priority = 70;

  private active = false;
  private battleId: string | null = null;
  private overlay: HTMLDivElement | null = null;
  private tacUnits: TacUnit[] = [];
  private objectives: TacObjective[] = [];
  private selectedId: string | null = null;
  private terrain: number[][] = [];
  private forestZones: { x: number; y: number; r: number }[] = [];
  private buildingZones: { x: number; y: number; r: number }[] = [];

  private weather: TacticalWeather = 'clear';
  private tacSpeed: 0 | 1 | 2 | 4 = 1;
  private animRaf = 0;
  private tickTimer = 0;
  private battleEndedTimeout: ReturnType<typeof setTimeout> | null = null;

  private attackerCode = '';
  private defenderCode = '';

  // Three.js state
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private unitMeshes = new Map<string, THREE.Group>();
  private objMeshes = new Map<string, THREE.Mesh>();
  private orderLine: THREE.Line | null = null;
  private orderMarker: THREE.Mesh | null = null;
  private rangeCircle: THREE.Line | null = null;
  private tracers: Tracer[] = [];
  private weatherPoints: THREE.Points | null = null;

  // Camera orbit/pan
  private camTarget = new THREE.Vector3(0, 0, 0);
  private camYaw = 0;
  private camPitch = 0.85;
  private camDist = 145;
  private keysPressed = new Set<string>();
  private cleanupInput: (() => void) | null = null;

  static instance: TacticalSystem;
  static getInstance(): TacticalSystem {
    if (!TacticalSystem.instance) TacticalSystem.instance = new TacticalSystem();
    return TacticalSystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('tactical-overlay') as HTMLDivElement | null;
      if (!this.overlay) {
        const div = document.createElement('div');
        div.id = 'tactical-overlay';
        div.className = 'hidden';
        div.style.cssText = 'position:fixed;inset:0;z-index:900;background:#0d1117;';
        document.body.appendChild(div);
        this.overlay = div;
      }
    }
    console.log('[TacticalSystem] инициализировано (3D Three.js)');
  }

  update(dt: number): void {
    if (!this.active || this.tacSpeed === 0) return;
    this.tickTimer += dt * this.tacSpeed;
    while (this.tickTimer >= 0.45) {
      this.tickTimer -= 0.45;
      this._simulateStep();
    }
  }

  shutdown(): void {
    this.exitBattle();
  }

  isActive(): boolean {
    return this.active;
  }

  /* ============================================================ PUBLIC API */
  enterBattle(battleId: string, attackerUnits: string[], defenderUnits: string[]): void {
    if (this.active) return;
    this.active = true;
    this.battleId = battleId;
    this.selectedId = null;
    this.tacSpeed = 1;
    this.tickTimer = 0;
    if (this.battleEndedTimeout) {
      clearTimeout(this.battleEndedTimeout);
      this.battleEndedTimeout = null;
    }

    const weathers: TacticalWeather[] = ['clear', 'clear', 'rain', 'fog', 'snow'];
    this.weather = weathers[Math.floor(Math.random() * weathers.length)] ?? 'clear';

    const firstAtk = militarySystem.getUnit(attackerUnits[0] ?? '');
    const firstDef = militarySystem.getUnit(defenderUnits[0] ?? '');
    this.attackerCode = firstAtk?.countryCode ?? '';
    this.defenderCode = firstDef?.countryCode ?? '';

    this._generateTerrain();
    this._buildTacUnits(attackerUnits, 'attacker');
    this._buildTacUnits(defenderUnits, 'defender');
    this._updateVisibility();

    this._showOverlay();

    gameTime.pause();
    eventBus.emit(GameEvents.TACTICAL_MODE_ENTER, { battleId, attackerUnits, defenderUnits, weather: this.weather });
    console.log(`[Tactical 3D] битва "${battleId}" началась (погода: ${this.weather})`);
  }

  exitBattle(): BattleReport | null {
    if (!this.active) return null;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.animRaf);
    if (this.battleEndedTimeout) {
      clearTimeout(this.battleEndedTimeout);
      this.battleEndedTimeout = null;
    }
    this.cleanupInput?.();
    this.cleanupInput = null;
    this.keysPressed.clear();

    const report = this._generateReport();
    this._applyReport(report);

    if (this.battleId) {
      militarySystem.removeBattle(this.battleId);
    }

    this._disposeThree();
    this.active = false;
    this.battleId = null;
    this.tacUnits = [];
    this.objectives = [];
    this.terrain = [];
    this.forestZones = [];
    this.buildingZones = [];
    this._hideOverlay();

    gameTime.resume();
    eventBus.emit(GameEvents.TACTICAL_MODE_EXIT, { report });
    console.log('[Tactical 3D] битва завершена', report);
    return report;
  }

  issueOrder(unitId: string, order: TacticalOrder, tx?: number, ty?: number): void {
    const u = this.tacUnits.find(x => x.id === unitId);
    if (!u || u.countryCode !== countrySystem.getPlayer()?.code) return;
    u.order = order;
    if (order === 'retreat') {
      u.tx = u.side === 'attacker' ? 40 : LOGICAL_W - 40;
      u.ty = u.y;
    } else if (order === 'regroup') {
      const friendlies = this.tacUnits.filter(f => f.side === u.side && f.hp > 0);
      const avgX = friendlies.reduce((s, f) => s + f.x, 0) / Math.max(1, friendlies.length);
      const avgY = friendlies.reduce((s, f) => s + f.y, 0) / Math.max(1, friendlies.length);
      u.tx = avgX;
      u.ty = avgY;
    } else if (order === 'occupy') {
      const nearestObj = this.objectives.find(o => o.owner !== u.side) ?? this.objectives[0];
      if (nearestObj) {
        u.tx = nearestObj.x;
        u.ty = nearestObj.y;
      }
    } else if (tx !== undefined && ty !== undefined) {
      u.tx = tx;
      u.ty = ty;
    }
    if (u.selected) this._updateTacStatus(u);
    eventBus.emit(GameEvents.TACTICAL_ORDER_ISSUED, { unitId, order });
  }

  setFormation(unitId: string, formation: TacticalFormation): void {
    const u = this.tacUnits.find(x => x.id === unitId);
    if (!u || u.countryCode !== countrySystem.getPlayer()?.code) return;
    u.formation = formation;
    if (u.selected) this._updateTacStatus(u);
  }

  getUnits(): TacUnit[] {
    return this.tacUnits;
  }

  getWeather(): TacticalWeather {
    return this.weather;
  }

  /* ============================================================ SIMULATION */
  private _buildTacUnits(ids: string[], side: 'attacker' | 'defender'): void {
    const count = ids.length;
    const playerCode = countrySystem.getPlayer()?.code;
    for (let i = 0; i < count; i++) {
      const mu = militarySystem.getUnit(ids[i] ?? '');
      if (!mu) continue;
      const startX = side === 'attacker' ? 95 + (i % 2) * 55 : LOGICAL_W - 150 - (i % 2) * 55;
      const startY = 120 + (LOGICAL_H - 240) * ((i + 0.5) / Math.max(1, count));
      this.tacUnits.push({
        id: `tac_${mu.id}`,
        stratId: mu.id,
        countryCode: mu.countryCode,
        side,
        name: mu.name,
        type: mu.type,
        x: startX, y: startY,
        tx: startX, ty: startY,
        hp: Math.max(10, Math.round(mu.strength / 10)),
        morale: mu.morale,
        fatigue: 0,
        supply: mu.supply,
        order: side === 'attacker' ? 'attack' : 'hold',
        formation: 'line',
        experience: mu.experience,
        selected: false,
        spotted: mu.countryCode === playerCode,
        inCover: false,
        onRoad: false
      });
    }
  }

  private _generateTerrain(): void {
    const cols = 48, rows = 28;
    this.terrain = [];
    const phase = Math.random() * Math.PI * 2;
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const nx = c / cols, ny = r / rows;
        let v = Math.sin(nx * 6 + phase) * 0.22 + Math.cos(ny * 5 + phase) * 0.22 + Math.sin((nx + ny) * 10) * 0.14;
        const riverCenter = 0.5 + Math.sin(ny * 5) * 0.05;
        const distRiver = Math.abs(nx - riverCenter);
        if (distRiver < 0.045) v = -0.35;
        row.push(Math.min(1, Math.max(-0.35, (v + 0.45) / 1.1)));
      }
      this.terrain.push(row);
    }

    this.forestZones = [
      { x: 340, y: 180, r: 75 },
      { x: 420, y: 520, r: 85 },
      { x: 780, y: 210, r: 80 },
      { x: 840, y: 490, r: 70 }
    ];
    this.buildingZones = [
      { x: 600, y: 350, r: 52 },
      { x: 280, y: 360, r: 45 },
      { x: 920, y: 340, r: 45 }
    ];
    this.objectives = [
      { id: 'obj_bridge', name: 'Центральный мост', x: 600, y: 350, owner: 'neutral' },
      { id: 'obj_north', name: 'Высота Север', x: 540, y: 150, owner: 'neutral' },
      { id: 'obj_south', name: 'Переправа Юг', x: 660, y: 550, owner: 'neutral' }
    ];
  }

  private _getElevationAt(lx: number, ly: number): number {
    const rows = this.terrain.length;
    const cols = this.terrain[0]?.length ?? 1;
    if (!rows) return 0;
    const c = Math.max(0, Math.min(cols - 1, Math.floor((lx / LOGICAL_W) * (cols - 1))));
    const r = Math.max(0, Math.min(rows - 1, Math.floor((ly / LOGICAL_H) * (rows - 1))));
    return (this.terrain[r]?.[c] ?? 0) * 12;
  }

  private _updateVisibility(): void {
    const playerCode = countrySystem.getPlayer()?.code;
    const wVis = WEATHER_META[this.weather].visMult;
    const friendlies = this.tacUnits.filter(u => u.hp > 0 && u.countryCode === playerCode);

    for (const u of this.tacUnits) {
      if (u.hp <= 0) { u.spotted = false; continue; }
      if (u.countryCode === playerCode) { u.spotted = true; continue; }

      let seen = false;
      for (const f of friendlies) {
        const baseVis = f.type === 'recon' ? 440 : f.type === 'air' ? 500 : 280;
        const orderBonus = f.order === 'recon' ? 1.35 : 1.0;
        const coverPenalty = u.inCover ? 0.72 : 1.0;
        const maxDist = baseVis * orderBonus * wVis * coverPenalty;
        if (Math.hypot(f.x - u.x, f.y - u.y) <= maxDist) {
          seen = true;
          break;
        }
      }
      u.spotted = seen;
    }
  }

  private _simulateStep(): void {
    const wMeta = WEATHER_META[this.weather];
    const playerCode = countrySystem.getPlayer()?.code;

    for (const u of this.tacUnits) {
      if (u.hp <= 0) continue;

      u.inCover = this.forestZones.some(z => Math.hypot(u.x - z.x, u.y - z.y) <= z.r) ||
                  this.buildingZones.some(z => Math.hypot(u.x - z.x, u.y - z.y) <= z.r);
      u.onRoad = Math.abs(u.y - 350) < 28;

      if (u.order === 'hold' || u.order === 'guard') {
        u.fatigue = Math.max(0, u.fatigue - 0.035);
        continue;
      }

      let tx = u.tx, ty = u.ty;
      const isPlayerUnit = u.countryCode === playerCode;
      if (!isPlayerUnit || u.order === 'attack') {
        const enemies = this.tacUnits.filter(e => e.side !== u.side && e.hp > 0 && (!isPlayerUnit || e.spotted));
        if (enemies.length > 0) {
          const nearest = enemies.reduce((a, b) =>
            Math.hypot(b.x - u.x, b.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? b : a
          );
          tx = nearest.x + (Math.random() - 0.5) * 28;
          ty = nearest.y + (Math.random() - 0.5) * 28;
          if (!isPlayerUnit) { u.tx = tx; u.ty = ty; }
        }
      }

      const dx = tx - u.x, dy = ty - u.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 2) {
        const techSpd = 1 + technologySystem.getCountryBonuses(u.countryCode).unitSpeed;
        const baseSpd = UNIT_META[u.type as keyof typeof UNIT_META]?.speed ?? 1;
        const formSpd = u.formation === 'column' ? 1.25 : u.formation === 'wedge' ? 1.1 : 1.0;
        const roadSpd = u.onRoad ? 1.25 : 1.0;
        const fatigueMult = 1 - u.fatigue * 0.4;
        const coverSlow = u.inCover ? 0.82 : 1.0;
        const step = Math.min(baseSpd * 8.5 * techSpd * wMeta.speedMult * fatigueMult * coverSlow * formSpd * roadSpd, dist);
        u.x = Math.max(15, Math.min(LOGICAL_W - 15, u.x + (dx / dist) * step));
        u.y = Math.max(15, Math.min(LOGICAL_H - 15, u.y + (dy / dist) * step));
        u.fatigue = Math.min(1, u.fatigue + 0.011);
      } else {
        u.fatigue = Math.max(0, u.fatigue - 0.02);
      }
    }

    // Захват тактических точек
    for (const obj of this.objectives) {
      const nearAtk = this.tacUnits.some(u => u.side === 'attacker' && u.hp > 0 && Math.hypot(u.x - obj.x, u.y - obj.y) < 42);
      const nearDef = this.tacUnits.some(u => u.side === 'defender' && u.hp > 0 && Math.hypot(u.x - obj.x, u.y - obj.y) < 42);
      if (nearAtk && !nearDef) obj.owner = 'attacker';
      else if (nearDef && !nearAtk) obj.owner = 'defender';
    }

    this._updateVisibility();

    // Бой
    const alive = this.tacUnits.filter(u => u.hp > 0);
    for (const u of alive) {
      if (u.order === 'retreat') continue;
      const enemies = alive.filter(e => e.side !== u.side && e.hp > 0);
      const range = u.type === 'artillery' ? 250 : u.type === 'air' ? 320 : u.type === 'tank' ? 120 : 85;
      let target: TacUnit | null = null;
      let bestDist = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(u.x - e.x, u.y - e.y);
        if (d <= range && d < bestDist) {
          bestDist = d;
          target = e;
        }
      }
      if (target) {
        const bonuses = technologySystem.getCountryBonuses(u.countryCode);
        const techMult = 1 + (u.type === 'air' ? bonuses.airPower : bonuses.groundPower);
        const coverDef = target.inCover ? 0.68 : 1.0;
        const formAtk = u.formation === 'wedge' ? 1.15 : u.formation === 'line' ? 1.08 : 0.85;
        const formDef = target.formation === 'line' ? 0.9 : 1.0;
        const moraleMult = 0.5 + u.morale * 0.5;
        const power = (UNIT_META[u.type as keyof typeof UNIT_META]?.power ?? 10) / 10;
        const dmg = Math.max(1, Math.round(power * u.supply * moraleMult * techMult * coverDef * formAtk * formDef * (1 - u.fatigue * 0.3) * (0.8 + Math.random() * 0.5)));

        target.hp = Math.max(0, target.hp - dmg);
        target.morale = Math.max(0.1, target.morale - 0.015);
        u.experience = Math.min(1, u.experience + 0.006);
        u.fatigue = Math.min(1, u.fatigue + 0.015);

        if (u.spotted || target.spotted) {
          this._spawnTracer(u, target);
        }

        if (target.hp <= 0) {
          const mu = militarySystem.getUnit(target.stratId);
          if (mu) mu.strength = 0;
        }
      }
    }

    if (this.selectedId) {
      const sel = this.tacUnits.find(x => x.id === this.selectedId);
      if (sel) this._updateTacStatus(sel);
    }

    const attackersAlive = this.tacUnits.filter(u => u.side === 'attacker' && u.hp > 0).length;
    const defendersAlive = this.tacUnits.filter(u => u.side === 'defender' && u.hp > 0).length;
    if (attackersAlive === 0 || defendersAlive === 0) {
      if (!this.battleEndedTimeout) {
        this.battleEndedTimeout = setTimeout(() => this.exitBattle(), 1600);
      }
    }
  }

  /* ============================================================ 3D OVERLAY & SCENE */
  private _showOverlay(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';

    const atkC = countrySystem.getCountry(this.attackerCode);
    const defC = countrySystem.getCountry(this.defenderCode);
    const wLabel = WEATHER_META[this.weather].label;

    const header = document.createElement('div');
    header.style.cssText = 'position:absolute;top:0;left:0;right:0;height:48px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;padding:0 12px;gap:8px;z-index:10;overflow-x:auto;';
    header.innerHTML = `
      <span style="font-weight:800;font-size:12px;color:#f1f5f9;letter-spacing:0.5px;white-space:nowrap">3D ТАКТИКА</span>
      <span style="color:#ef4444;font-weight:600;white-space:nowrap">${atkC?.nameRu ?? 'Атака'}</span>
      <span style="color:#8b949e">vs</span>
      <span style="color:#22d3ee;font-weight:600;white-space:nowrap">${defC?.nameRu ?? 'Оборона'}</span>
      <span style="background:#21262d;border:1px solid #30363d;padding:2px 7px;border-radius:4px;font-size:11px;color:#cbd5e1;white-space:nowrap">Погода: ${wLabel}</span>
      <div style="flex:1"></div>
    `;

    const speedWrap = document.createElement('div');
    speedWrap.style.cssText = 'display:flex;gap:3px;margin-right:4px;';
    for (const sp of [0, 1, 2, 4] as const) {
      const sb = document.createElement('button');
      sb.textContent = sp === 0 ? 'Пауза' : `x${sp}`;
      sb.style.cssText = `padding:4px 7px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid #444c56;background:${sp === 1 ? '#1f6feb' : '#22272e'};color:#fff;`;
      sb.addEventListener('click', () => {
        this.tacSpeed = sp;
        speedWrap.querySelectorAll('button').forEach(b => (b as HTMLButtonElement).style.background = '#22272e');
        sb.style.background = '#1f6feb';
      });
      speedWrap.appendChild(sb);
    }
    header.appendChild(speedWrap);

    const orderBtns: { label: string; order: TacticalOrder }[] = [
      { label: 'Атака', order: 'attack' },
      { label: 'Держать', order: 'hold' },
      { label: 'Охрана', order: 'guard' },
      { label: 'Разведка', order: 'recon' },
      { label: 'Занять точку', order: 'occupy' },
      { label: 'Перегрупп.', order: 'regroup' },
      { label: 'Отступить', order: 'retreat' }
    ];
    const ordWrap = document.createElement('div');
    ordWrap.style.cssText = 'display:flex;gap:4px;';
    for (const ob of orderBtns) {
      const btn = document.createElement('button');
      btn.style.cssText = 'padding:4px 8px;background:#22272e;border:1px solid #444c56;color:#cdd9e5;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;';
      btn.textContent = ob.label;
      btn.addEventListener('click', () => {
        const selected = this.tacUnits.filter(u => u.selected);
        selected.forEach(u => this.issueOrder(u.id, ob.order));
      });
      ordWrap.appendChild(btn);
    }

    const formSel = document.createElement('select');
    formSel.style.cssText = 'padding:4px 6px;background:#22272e;border:1px solid #444c56;color:#cdd9e5;border-radius:4px;font-size:11px;';
    formSel.innerHTML = '<option value="line">Строй: Линия</option><option value="column">Строй: Колонна</option><option value="wedge">Строй: Клин</option>';
    formSel.addEventListener('change', () => {
      const f = formSel.value as TacticalFormation;
      this.tacUnits.filter(u => u.selected).forEach(u => this.setFormation(u.id, f));
    });
    ordWrap.appendChild(formSel);

    const exitBtn = document.createElement('button');
    exitBtn.textContent = 'Завершить бой';
    exitBtn.style.cssText = 'padding:4px 10px;background:#2a1215;border:1px solid #ef4444;color:#ef4444;border-radius:4px;cursor:pointer;font-size:11px;margin-left:4px;white-space:nowrap;';
    exitBtn.addEventListener('click', () => this.exitBattle());
    ordWrap.appendChild(exitBtn);
    header.appendChild(ordWrap);
    this.overlay.appendChild(header);

    const viewWrap = document.createElement('div');
    viewWrap.id = 'tac-3d-wrap';
    viewWrap.style.cssText = 'position:absolute;top:48px;left:0;right:0;bottom:52px;overflow:hidden;';
    this.overlay.appendChild(viewWrap);

    const status = document.createElement('div');
    status.id = 'tac-status';
    status.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:52px;background:#161b22;border-top:1px solid #30363d;display:flex;align-items:center;padding:0 16px;gap:14px;font-size:12px;color:#94a3b8;';
    status.textContent = 'ЛКМ / Рамка — выбрать юниты | ПКМ — приказ движения (строем) | Shift+ЛКМ / Средняя — вращение камеры | WASD — панорама | Колёсико — зум';
    this.overlay.appendChild(status);

    this._initThreeScene(viewWrap);
    this._attachTacInput(viewWrap);
    this._startRenderLoop();
  }

  private _toWorldX(lx: number): number { return ((lx / LOGICAL_W) - 0.5) * WORLD_W; }
  private _toWorldZ(ly: number): number { return ((ly / LOGICAL_H) - 0.5) * WORLD_D; }
  private _toLogicalX(wx: number): number { return ((wx / WORLD_W) + 0.5) * LOGICAL_W; }
  private _toLogicalY(wz: number): number { return ((wz / WORLD_D) + 0.5) * LOGICAL_H; }

  private _initThreeScene(container: HTMLElement): void {
    try {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || (window.innerHeight - 100);
      const wMeta = WEATHER_META[this.weather];

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(wMeta.skyColor);
      this.scene.fog = new THREE.FogExp2(wMeta.skyColor, wMeta.fogDensity);

      this.camera = new THREE.PerspectiveCamera(48, w / h, 1, 600);
      this.camTarget.set(0, 0, 0);
      this.camYaw = 0;
      this.camPitch = 0.85;
      this.camDist = 145;
      this._updateCamera();

      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(this.renderer.domElement);

      const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.9);
      this.scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xfffbeb, 1.2);
      dir.position.set(80, 120, 60);
      this.scene.add(dir);

      const cols = (this.terrain[0]?.length ?? 48) - 1;
      const rows = (this.terrain.length || 28) - 1;
      const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, cols, rows);
      geo.rotateX(-Math.PI / 2);

      const pos = geo.attributes.position!;
      const colors: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const lx = this._toLogicalX(vx);
        const ly = this._toLogicalY(vz);
        const elev = this._getElevationAt(lx, ly);
        pos.setY(i, elev);

        const col = new THREE.Color();
        if (Math.abs(ly - 350) < 22) col.setHex(0x475569); // дорога
        else if (elev < 0.2) col.setHex(0x164e63);
        else if (elev > 7.5) col.setHex(0x64748b);
        else if (elev > 4.5) col.setHex(0x3f6212);
        else col.setHex(0x274e2b);
        colors.push(col.r, col.g, col.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05 });
      this.terrainMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.terrainMesh);

      // Водная гладь реки
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(24, WORLD_D),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.65, roughness: 0.2 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.6;
      this.scene.add(water);

      // Мост в центре
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(30, 1.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.8 })
      );
      bridge.position.set(0, 2.2, 0);
      this.scene.add(bridge);

      // Леса
      const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2.5, 5);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
      const crownGeo = new THREE.ConeGeometry(2.2, 5.5, 6);
      const crownMat = new THREE.MeshStandardMaterial({ color: 0x1b4332 });
      for (const fz of this.forestZones) {
        for (let k = 0; k < 14; k++) {
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.random() * (fz.r * 0.75);
          const lx = fz.x + Math.cos(ang) * rad;
          const ly = fz.y + Math.sin(ang) * rad;
          const tree = new THREE.Group();
          const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.y = 1.25;
          const cr = new THREE.Mesh(crownGeo, crownMat); cr.position.y = 4.2;
          tree.add(t, cr);
          tree.position.set(this._toWorldX(lx), this._getElevationAt(lx, ly), this._toWorldZ(ly));
          this.scene.add(tree);
        }
      }

      // Здания
      const bMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.75 });
      for (const bz of this.buildingZones) {
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * Math.PI * 2;
          const rad = 12 + Math.random() * (bz.r * 0.5);
          const lx = bz.x + Math.cos(ang) * rad;
          const ly = bz.y + Math.sin(ang) * rad;
          const bh = 3 + Math.random() * 4;
          const bMesh = new THREE.Mesh(new THREE.BoxGeometry(5, bh, 5), bMat);
          bMesh.position.set(this._toWorldX(lx), this._getElevationAt(lx, ly) + bh / 2, this._toWorldZ(ly));
          this.scene.add(bMesh);
        }
      }

      // Тактические ключевые точки (флаги)
      this.objMeshes.clear();
      for (const obj of this.objectives) {
        const flagMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.6, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        flagMesh.position.set(this._toWorldX(obj.x), this._getElevationAt(obj.x, obj.y) + 6, this._toWorldZ(obj.y));
        this.scene.add(flagMesh);
        this.objMeshes.set(obj.id, flagMesh);
      }

      // Погодные частицы
      if (this.weather === 'rain' || this.weather === 'snow') {
        const pCount = 900;
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(pCount * 3);
        for (let i = 0; i < pCount; i++) {
          pPos[i * 3] = (Math.random() - 0.5) * WORLD_W;
          pPos[i * 3 + 1] = Math.random() * 60;
          pPos[i * 3 + 2] = (Math.random() - 0.5) * WORLD_D;
        }
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        const pMat = new THREE.PointsMaterial({
          color: this.weather === 'snow' ? 0xf8fafc : 0x7dd3fc,
          size: this.weather === 'snow' ? 0.9 : 0.5,
          transparent: true,
          opacity: 0.65
        });
        this.weatherPoints = new THREE.Points(pGeo, pMat);
        this.scene.add(this.weatherPoints);
      }

      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this.orderLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfacc15 }));
      this.orderLine.visible = false;
      this.scene.add(this.orderLine);

      this.orderMarker = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 2.2, 16),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
      );
      this.orderMarker.rotation.x = -Math.PI / 2;
      this.orderMarker.visible = false;
      this.scene.add(this.orderMarker);

      // Круг дальности огня
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }
      this.rangeCircle = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
      );
      this.rangeCircle.visible = false;
      this.scene.add(this.rangeCircle);

      this.unitMeshes.clear();
      for (const u of this.tacUnits) {
        const grp = this._createUnitMesh(u);
        this.scene.add(grp);
        this.unitMeshes.set(u.id, grp);
      }
    } catch (err) {
      console.warn('[Tactical 3D] WebGL недоступен, работа в headless-режиме:', err);
    }
  }

  private _createUnitMesh(u: TacUnit): THREE.Group {
    const grp = new THREE.Group();
    const color = u.side === 'attacker' ? 0xef4444 : 0x3b82f6;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 });

    if (u.type === 'tank' || u.type === 'mechanized') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.5, 3.0), mat);
      hull.position.y = 0.8;
      const turret = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 2.0), mat);
      turret.position.y = 2.0;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 6), mat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(1.9, 2.0, 0);
      grp.add(hull, turret, barrel);
    } else if (u.type === 'air') {
      const body = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5.4, 5), mat);
      body.rotation.z = -Math.PI / 2;
      body.position.y = 14;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 6.4), mat);
      wing.position.y = 14;
      grp.add(body, wing);
    } else if (u.type === 'artillery') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 2.6), mat);
      base.position.y = 0.6;
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 4.2, 6), mat);
      gun.rotation.z = Math.PI / 3;
      gun.position.set(1.0, 2.0, 0);
      grp.add(base, gun);
    } else {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 2.8, 8), mat);
      body.position.y = 1.4;
      grp.add(body);
    }

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.8, 3.5, 20),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
    );
    ring.name = 'selRing';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    ring.visible = false;
    grp.add(ring);

    return grp;
  }

  private _spawnTracer(from: TacUnit, to: TacUnit): void {
    if (!this.scene) return;
    const p1 = new THREE.Vector3(this._toWorldX(from.x), this._getElevationAt(from.x, from.y) + (from.type === 'air' ? 14 : 2), this._toWorldZ(from.y));
    const p2 = new THREE.Vector3(this._toWorldX(to.x), this._getElevationAt(to.x, to.y) + 1.5, this._toWorldZ(to.y));
    const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineBasicMaterial({ color: from.side === 'attacker' ? 0xfca5a5 : 0x93c5fd });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, ttl: 0.25 });
  }

  private _updateCamera(): void {
    if (!this.camera) return;
    const x = this.camTarget.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const y = this.camTarget.y + Math.sin(this.camPitch) * this.camDist;
    const z = this.camTarget.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.camTarget);
  }

  private _attachTacInput(container: HTMLElement): void {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let orbiting = false;
    let boxSelecting = false;
    let boxStart = { x: 0, y: 0 };
    let lastX = 0, lastY = 0;

    const selBox = document.createElement('div');
    selBox.style.cssText = 'position:absolute;border:1px solid #facc15;background:rgba(250,204,21,0.12);pointer-events:none;display:none;z-index:20;';
    container.appendChild(selBox);

    const getHitPoint = (e: MouseEvent): THREE.Vector3 | null => {
      if (!this.camera || !this.terrainMesh || !this.renderer) return null;
      const rect = this.renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      const hits = raycaster.intersectObject(this.terrainMesh);
      return hits[0]?.point ?? null;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        orbiting = true;
        lastX = e.clientX;
        lastY = e.clientY;
      } else if (e.button === 0) {
        boxSelecting = true;
        const rect = container.getBoundingClientRect();
        boxStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        selBox.style.left = `${boxStart.x}px`;
        selBox.style.top = `${boxStart.y}px`;
        selBox.style.width = '0px';
        selBox.style.height = '0px';
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (orbiting) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        this.camYaw -= dx * 0.006;
        this.camPitch = Math.max(0.3, Math.min(1.45, this.camPitch + dy * 0.005));
        this._updateCamera();
      } else if (boxSelecting) {
        const rect = container.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        if (Math.hypot(cx - boxStart.x, cy - boxStart.y) > 8) {
          selBox.style.display = 'block';
          selBox.style.left = `${Math.min(boxStart.x, cx)}px`;
          selBox.style.top = `${Math.min(boxStart.y, cy)}px`;
          selBox.style.width = `${Math.abs(cx - boxStart.x)}px`;
          selBox.style.height = `${Math.abs(cy - boxStart.y)}px`;
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      orbiting = false;
      if (boxSelecting) {
        boxSelecting = false;
        const wasBox = selBox.style.display === 'block';
        selBox.style.display = 'none';
        if (wasBox && this.camera && this.renderer) {
          const rect = container.getBoundingClientRect();
          const ex = e.clientX - rect.left;
          const ey = e.clientY - rect.top;
          const minX = Math.min(boxStart.x, ex), maxX = Math.max(boxStart.x, ex);
          const minY = Math.min(boxStart.y, ey), maxY = Math.max(boxStart.y, ey);
          const player = countrySystem.getPlayer();
          this.tacUnits.forEach(u => u.selected = false);
          this.selectedId = null;
          for (const u of this.tacUnits) {
            if (u.hp <= 0 || u.countryCode !== player?.code) continue;
            const vec = new THREE.Vector3(this._toWorldX(u.x), this._getElevationAt(u.x, u.y), this._toWorldZ(u.y));
            vec.project(this.camera);
            const sx = (vec.x * 0.5 + 0.5) * rect.width;
            const sy = (-vec.y * 0.5 + 0.5) * rect.height;
            if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
              u.selected = true;
              if (!this.selectedId) this.selectedId = u.id;
            }
          }
          const sel = this.tacUnits.find(u => u.id === this.selectedId);
          if (sel) this._updateTacStatus(sel);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.camDist = Math.max(45, Math.min(240, this.camDist + e.deltaY * 0.1));
      this._updateCamera();
    };

    const onClick = (e: MouseEvent) => {
      if (e.shiftKey) return;
      const pt = getHitPoint(e);
      if (!pt) return;
      const lx = this._toLogicalX(pt.x);
      const ly = this._toLogicalY(pt.z);

      this.tacUnits.forEach(u => u.selected = false);
      this.selectedId = null;

      const player = countrySystem.getPlayer();
      let best: TacUnit | null = null;
      let bestD = 38;
      for (const u of this.tacUnits) {
        if (u.hp <= 0 || u.countryCode !== player?.code) continue;
        const d = Math.hypot(u.x - lx, u.y - ly);
        if (d < bestD) { bestD = d; best = u; }
      }
      if (best) {
        best.selected = true;
        this.selectedId = best.id;
        this._updateTacStatus(best);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const selected = this.tacUnits.filter(u => u.selected && u.hp > 0);
      if (!selected.length) return;
      const pt = getHitPoint(e);
      if (!pt) return;
      const lx = Math.max(15, Math.min(LOGICAL_W - 15, this._toLogicalX(pt.x)));
      const ly = Math.max(15, Math.min(LOGICAL_H - 15, this._toLogicalY(pt.z)));
      selected.forEach((u, idx) => {
        const off = (idx - (selected.length - 1) / 2) * 32;
        this.issueOrder(u.id, 'move', lx, Math.max(20, Math.min(LOGICAL_H - 20, ly + off)));
      });
    };

    const onKeyDown = (e: KeyboardEvent) => { if (this.active) this.keysPressed.add(e.code); };
    const onKeyUp = (e: KeyboardEvent) => { this.keysPressed.delete(e.code); };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('click', onClick);
    container.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.cleanupInput = () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('click', onClick);
      container.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }

  private _updateTacStatus(u: TacUnit): void {
    const el = document.getElementById('tac-status');
    if (!el) return;
    const count = this.tacUnits.filter(x => x.selected).length;
    el.innerHTML = `
      <b style="color:#f1f5f9">${u.name}${count > 1 ? ` (+${count - 1})` : ''}</b>
      <span style="color:#10b981">${u.hp}% прочн.</span>
      <span style="color:#f59e0b">${Math.round(u.morale * 100)}% мораль</span>
      <span style="color:#22d3ee">${Math.round(u.supply * 100)}% снабж.</span>
      <span style="color:#a78bfa">Устал.: ${Math.round(u.fatigue * 100)}%</span>
      ${u.inCover ? '<span style="color:#3fb950">[Укрытие]</span>' : ''}
      ${u.onRoad ? '<span style="color:#fbbf24">[Дорога]</span>' : ''}
      <span style="color:#94a3b8">Приказ: ${u.order} · Строй: ${u.formation}</span>
    `;
  }

  private _startRenderLoop(): void {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this._renderThree(dt);
      this.animRaf = requestAnimationFrame(loop);
    };
    this.animRaf = requestAnimationFrame(loop);
  }

  private _renderThree(dt: number): void {
    if (!this.scene || !this.camera || !this.renderer) return;

    const panSpd = 65 * dt;
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) this.camTarget.z -= panSpd;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) this.camTarget.z += panSpd;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) this.camTarget.x -= panSpd;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) this.camTarget.x += panSpd;
    if (this.keysPressed.size > 0) this._updateCamera();

    // Цвет флагов ключевых точек
    for (const obj of this.objectives) {
      const m = this.objMeshes.get(obj.id);
      if (m) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.setHex(obj.owner === 'attacker' ? 0xef4444 : obj.owner === 'defender' ? 0x3b82f6 : 0xfacc15);
      }
    }

    let selectedUnit: TacUnit | null = null;
    for (const u of this.tacUnits) {
      const grp = this.unitMeshes.get(u.id);
      if (!grp) continue;
      grp.visible = u.hp > 0 && u.spotted;
      if (!grp.visible) continue;

      const wx = this._toWorldX(u.x);
      const wz = this._toWorldZ(u.y);
      const wy = this._getElevationAt(u.x, u.y);
      grp.position.set(wx, wy, wz);

      const dx = u.tx - u.x, dy = u.ty - u.y;
      if (Math.hypot(dx, dy) > 2) {
        grp.rotation.y = -Math.atan2(dy, dx);
      }
      const ring = grp.getObjectByName('selRing');
      if (ring) ring.visible = u.selected;
      if (u.selected && !selectedUnit) selectedUnit = u;
    }

    if (this.rangeCircle) {
      if (selectedUnit) {
        const range = selectedUnit.type === 'artillery' ? 250 : selectedUnit.type === 'air' ? 320 : selectedUnit.type === 'tank' ? 120 : 85;
        const rWorld = (range / LOGICAL_W) * WORLD_W;
        this.rangeCircle.scale.set(rWorld, 1, rWorld);
        this.rangeCircle.position.set(this._toWorldX(selectedUnit.x), this._getElevationAt(selectedUnit.x, selectedUnit.y) + 0.6, this._toWorldZ(selectedUnit.y));
        this.rangeCircle.visible = true;
      } else {
        this.rangeCircle.visible = false;
      }
    }

    if (this.orderLine && this.orderMarker) {
      if (selectedUnit && Math.hypot(selectedUnit.tx - selectedUnit.x, selectedUnit.ty - selectedUnit.y) > 4) {
        const p1 = new THREE.Vector3(this._toWorldX(selectedUnit.x), this._getElevationAt(selectedUnit.x, selectedUnit.y) + 1.5, this._toWorldZ(selectedUnit.y));
        const p2 = new THREE.Vector3(this._toWorldX(selectedUnit.tx), this._getElevationAt(selectedUnit.tx, selectedUnit.ty) + 1.5, this._toWorldZ(selectedUnit.ty));
        this.orderLine.geometry.setFromPoints([p1, p2]);
        this.orderLine.visible = true;
        this.orderMarker.position.set(p2.x, p2.y - 1.1, p2.z);
        this.orderMarker.visible = true;
      } else {
        this.orderLine.visible = false;
        this.orderMarker.visible = false;
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]!;
      tr.ttl -= dt;
      if (tr.ttl <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }

    if (this.weatherPoints) {
      const pos = this.weatherPoints.geometry.attributes.position as THREE.BufferAttribute;
      const fall = this.weather === 'snow' ? 12 * dt : 45 * dt;
      for (let i = 0; i < pos.count; i++) {
        let py = pos.getY(i) - fall;
        if (py < 0) py = 60;
        pos.setY(i, py);
      }
      pos.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private _disposeThree(): void {
    for (const tr of this.tracers) {
      tr.line.geometry.dispose();
    }
    this.tracers = [];
    this.unitMeshes.clear();
    this.objMeshes.clear();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.terrainMesh = null;
    this.weatherPoints = null;
    this.rangeCircle = null;
  }

  private _hideOverlay(): void {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.animRaf);
    if (!this.overlay) return;
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
  }

  /* ============================================================ REPORT */
  private _generateReport(): BattleReport {
    const atkUnits = this.tacUnits.filter(u => u.side === 'attacker');
    const defUnits = this.tacUnits.filter(u => u.side === 'defender');
    const atkAlive = atkUnits.filter(u => u.hp > 0).length;
    const defAlive = defUnits.filter(u => u.hp > 0).length;
    const atkObj = this.objectives.filter(o => o.owner === 'attacker').length;
    const defObj = this.objectives.filter(o => o.owner === 'defender').length;
    const winner = atkAlive > defAlive ? 'attacker' : defAlive > atkAlive ? 'defender' : atkObj > defObj ? 'attacker' : defObj > atkObj ? 'defender' : 'draw';
    const atkLoss = Math.round(atkUnits.reduce((s, u) => s + (100 - u.hp), 0) / Math.max(1, atkUnits.length));
    const defLoss = Math.round(defUnits.reduce((s, u) => s + (100 - u.hp), 0) / Math.max(1, defUnits.length));
    return {
      winner,
      attackerLosses: atkLoss,
      defenderLosses: defLoss,
      territoryCaptured: winner === 'attacker',
      objectivesHeld: winner === 'attacker' ? atkObj : defObj,
      expGained: 0.08,
      weather: this.weather
    };
  }

  private _applyReport(report: BattleReport): void {
    for (const tu of this.tacUnits) {
      const mu = militarySystem.getUnit(tu.stratId);
      if (!mu) continue;
      mu.strength = Math.max(0, Math.round(tu.hp * 10));
      mu.morale = tu.morale;
      mu.experience = Math.min(1, tu.experience + report.expGained);
    }
    const loserCode = report.winner === 'attacker' ? this.defenderCode : this.attackerCode;
    const loserC = countrySystem.getCountry(loserCode);
    if (loserC) loserC.changeStability(-0.06, 'поражение в бою');
  }

  getState(): Record<string, any> {
    return { active: this.active, battleId: this.battleId };
  }
  setState(_s: Record<string, any>): void {}
}

export const tacticalSystem = TacticalSystem.getInstance();
