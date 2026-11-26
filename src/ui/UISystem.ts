/* ============================================================
   ui/UISystem.ts — интерфейс командного центра (SVG-иконки, без эмодзи)
   Главное меню, верхняя панель, левая рельса, правая лента,
   нижняя панель времени, модальные окна и сохранения.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { gameTime } from '../core/GameTime.js';
import { countrySystem } from '../country/CountrySystem.js';
import { Country } from '../country/Country.js';
import { economySystem } from '../economy/EconomySystem.js';
import { politicsSystem, AVAILABLE_LAWS, MINISTER_CANDIDATES } from '../politics/PoliticsSystem.js';
import { diplomacySystem } from '../diplomacy/DiplomacySystem.js';
import { militarySystem, UNIT_META, UnitType, ECHELON_META, COMMANDER_TRAITS } from '../military/MilitarySystem.js';
import { worldMapSystem, MapMode } from '../world/WorldMapSystem.js';
import { eventsSystem, RandomEvent } from '../events/EventsSystem.js';
import { saveSystem } from '../core/SaveSystem.js';
import { tacticalSystem } from '../tactical/TacticalSystem.js';
import { technologySystem, TECH_TREE, TECH_BRANCH_META } from '../tech/TechnologySystem.js';
import { logisticsSystem, SupplyType } from '../logistics/LogisticsSystem.js';
import { productionSystem } from '../production/ProductionSystem.js';
import { intelSystem } from '../intel/IntelSystem.js';
import { Icons } from './Icons.js';

type PanelId = 'politics' | 'economy' | 'diplomacy' | 'army' | 'research' | 'production' | 'intel';

const IDEOLOGY_RU: Record<string, string> = {
  democracy: 'Демократия',
  communism: 'Социализм / Коммунизм',
  theocracy: 'Теократия',
  dictatorship: 'Авторитаризм',
  monarchy: 'Монархия',
  republic: 'Республика'
};

export class UISystem implements IGameSystem {
  readonly name = 'UI';
  readonly priority = 100;

  private activePanel: PanelId | null = null;
  private news: any[] = [];
  private selectedStartCode = 'USA';

  static instance: UISystem;
  static getInstance(): UISystem {
    if (!UISystem.instance) UISystem.instance = new UISystem();
    return UISystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._buildHTML();
    this._buildMainMenu();
    this._bindEvents();
    this._refreshTopBar();
    this.openPanel('politics');
    this._seedInitialNews();

    // На старте игра в главном меню — ставим на паузу до нажатия "Начать кампанию"
    gameTime.pause();
    this._updateSpeedUI();
    console.log('[UISystem] инициализирован');
  }

  update(dt: number): void { void dt; }

  shutdown(): void {
    eventBus.clear();
  }

  /* ================================================================
     HTML-скаффолдинг
     ================================================================ */
  private _buildHTML(): void {
    document.getElementById('top-bar')!.innerHTML = `
      <div class="top-left">
        <div class="game-title"><img src="./assets/ui/icon.png" alt="" style="width:18px;height:18px;border-radius:3px;object-fit:contain">MilitaRIA</div>
        <button class="top-icon-btn" id="btn-main-menu" aria-label="Главное меню">${Icons.menu(14)} Меню</button>
        <button class="top-icon-btn" id="btn-save-menu" aria-label="Сохранения и загрузка">${Icons.save(14)} Сохранения</button>
      </div>
      <div id="top-stats" class="top-right"></div>
    `;
    document.getElementById('btn-main-menu')!.addEventListener('click', () => this.showMainMenu());
    document.getElementById('btn-save-menu')!.addEventListener('click', () => this._showSaveModal());

    this._buildMapModeBar();

    document.getElementById('left-panel')!.innerHTML = `
      <ul class="nav-list" id="nav-list" role="tablist"></ul>
      <div class="left-drawer">
        <div class="panel-header" id="panel-title">Политика</div>
        <div id="panel-content"></div>
      </div>
    `;
    this._buildNav();

    document.getElementById('right-panel')!.innerHTML = `
      <div class="section">
        <div class="section-title">Мировые новости</div>
        <div id="news-list" class="scroll-list"></div>
      </div>
      <div class="section">
        <div class="section-title">События</div>
        <div id="event-list" class="scroll-list"></div>
      </div>
    `;

    document.getElementById('bottom-bar')!.innerHTML = `
      <div class="speed-group">
        <button class="speed-btn" data-speed="0">${Icons.pause(12)} Пауза</button>
        <button class="speed-btn active" data-speed="1">${Icons.play(12)} x1</button>
        <button class="speed-btn" data-speed="2">${Icons.fast(12)} x2</button>
        <button class="speed-btn" data-speed="4">${Icons.fast(12)} x4</button>
        <button class="speed-btn" data-speed="8">${Icons.bolt(12)} x8</button>
        <span class="pause-label" id="pause-label">ПАУЗА</span>
      </div>
      <div id="journal-wrap" class="journal-wrap">
        <span class="journal-label">Журнал:</span>
        <span id="journal-entry">Система готова к работе.</span>
      </div>
    `;
    document.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sp = parseInt(btn.dataset.speed ?? '1', 10) as 0 | 1 | 2 | 4 | 8;
        if (sp === 0) {
          gameTime.pause();
        } else {
          gameTime.resume();
          gameTime.setSpeed(sp);
        }
        this._updateSpeedUI();
        this._log(sp === 0 ? 'Пауза.' : `Скорость x${sp}.`);
      });
    });

    const modal = document.createElement('div');
    modal.id = 'modal-overlay';
    modal.className = 'hidden';
    modal.innerHTML = `
      <div id="modal-box" role="dialog" aria-modal="true">
        <div id="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close" aria-label="Закрыть">${Icons.close(16)}</button>
        </div>
        <div id="modal-body"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('modal-close')!.addEventListener('click', () => this._closeModal());
    modal.addEventListener('click', e => { if (e.target === modal) this._closeModal(); });

    const tac = document.createElement('div');
    tac.id = 'tactical-overlay';
    tac.className = 'hidden';
    document.body.appendChild(tac);
  }

  /* ================================================================
     Главное меню игры
     ================================================================ */
  private _buildMainMenu(): void {
    let menu = document.getElementById('main-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'main-menu';
      document.body.appendChild(menu);
    }

    const featured = ['USA', 'RUS', 'UKR', 'CHN', 'DEU', 'GBR', 'FRA', 'TUR', 'JPN', 'IND'];
    const chipsHtml = featured.map(code => {
      const c = countrySystem.getCountry(code);
      if (!c) return '';
      return `
        <button class="nation-chip ${code === this.selectedStartCode ? 'selected' : ''}" data-start-code="${c.code}">
          <span class="flag-dot" style="background:${c.color}"></span>
          <span>${c.nameRu}</span>
        </button>
      `;
    }).join('');

    const allSorted = [...countrySystem.getAll()].sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru'));
    const optionsHtml = allSorted.map(c =>
      `<option value="${c.code}" ${c.code === this.selectedStartCode ? 'selected' : ''}>${c.nameRu} (${c.code}) — ВВП $${Math.round(c.gdp)} млрд</option>`
    ).join('');

    const slots = saveSystem.listSlots();
    const latestSave = slots.sort((a, b) => b.timestamp - a.timestamp)[0];

    menu.innerHTML = `
      <div class="menu-card">
        <div class="menu-hero">
          <div class="menu-badge">${Icons.shield(13)} Кампания · 1 января 2000 года</div>
          <img src="./assets/ui/logo.png" alt="MilitaRIA — Grand Strategy" style="max-width:420px;width:100%;height:auto;display:block;margin:10px auto 6px;border-radius:6px;">
          <p class="menu-sub">Глобальная военно-политическая стратегия и тактические бои в реальном времени</p>
        </div>
        <div class="menu-body">
          <div>
            <div class="menu-section-label">Быстрый выбор державы</div>
            <div class="nation-grid" id="menu-nation-grid">${chipsHtml}</div>
            <select class="menu-select" id="menu-country-select" aria-label="Выбор государства из списка">
              ${optionsHtml}
            </select>
          </div>
          <div class="menu-actions">
            <button class="menu-btn primary" id="menu-start-btn">${Icons.play(15)} Начать кампанию</button>
            <button class="menu-btn" id="menu-continue-btn" ${latestSave ? '' : 'disabled'}>${Icons.fast(15)} Продолжить</button>
            <button class="menu-btn" id="menu-load-btn">${Icons.folder(15)} Загрузить</button>
          </div>
        </div>
      </div>
    `;

    menu.querySelectorAll<HTMLButtonElement>('[data-start-code]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedStartCode = btn.dataset.startCode!;
        menu!.querySelectorAll('.nation-chip').forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
        const sel = document.getElementById('menu-country-select') as HTMLSelectElement;
        if (sel) sel.value = this.selectedStartCode;
      });
    });

    const selectEl = document.getElementById('menu-country-select') as HTMLSelectElement;
    selectEl?.addEventListener('change', () => {
      this.selectedStartCode = selectEl.value;
      menu!.querySelectorAll<HTMLButtonElement>('[data-start-code]').forEach(x => {
        x.classList.toggle('selected', x.dataset.startCode === this.selectedStartCode);
      });
    });

    document.getElementById('menu-start-btn')?.addEventListener('click', () => {
      countrySystem.setPlayer(this.selectedStartCode);
      this.hideMainMenu();
      gameTime.resume();
      gameTime.setSpeed(1);
      this._updateSpeedUI();
      const c = countrySystem.getPlayer();
      this.showNotification(`Кампания начата: ${c?.nameRu ?? this.selectedStartCode}`, 'success');
    });

    document.getElementById('menu-continue-btn')?.addEventListener('click', () => {
      if (!latestSave) return;
      if (saveSystem.load(latestSave.slot)) {
        this.hideMainMenu();
        gameTime.resume();
        this._updateSpeedUI();
        this.showNotification('Кампания продолжена', 'info');
      }
    });

    document.getElementById('menu-load-btn')?.addEventListener('click', () => {
      this._showSaveModal(true);
    });
  }

  showMainMenu(): void {
    gameTime.pause();
    this._updateSpeedUI();
    this._buildMainMenu();
    document.getElementById('main-menu')?.classList.remove('hidden');
  }

  hideMainMenu(): void {
    document.getElementById('main-menu')?.classList.add('hidden');
  }

  private _buildMapModeBar(): void {
    const bar = document.createElement('div');
    bar.id = 'map-mode-bar';
    document.getElementById('game-container')!.appendChild(bar);
    const modes: { id: MapMode; icon: string; label: string }[] = [
      { id: 'political', icon: Icons.diplomacy(13), label: 'Политическая' },
      { id: 'diplomacy', icon: Icons.handshake(13), label: 'Дипломатия' },
      { id: 'economy', icon: Icons.economy(13), label: 'Экономика' },
      { id: 'military', icon: Icons.army(13), label: 'Армия' },
      { id: 'resources', icon: Icons.production(13), label: 'Ресурсы' },
      { id: 'infrastructure', icon: Icons.shield(13), label: 'Инфра' },
      { id: 'population', icon: Icons.users(13), label: 'Население' },
      { id: 'supply', icon: Icons.box(13), label: 'Снабжение' },
      { id: 'intel', icon: Icons.intel(13), label: 'Разведка' }
    ];
    bar.innerHTML = modes.map(m => `
      <button class="map-mode-btn ${m.id === 'political' ? 'active' : ''}" data-mode="${m.id}">${m.icon} ${m.label}</button>
    `).join('');
    bar.querySelectorAll<HTMLButtonElement>('.map-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.map-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        worldMapSystem.setMapMode(btn.dataset.mode as MapMode);
        this._log(`Режим карты: ${btn.textContent?.trim()}`);
      });
    });
  }

  private _buildNav(): void {
    const nav: { id: PanelId; icon: string; label: string }[] = [
      { id: 'politics', icon: Icons.politics(16), label: 'Полит.' },
      { id: 'economy', icon: Icons.economy(16), label: 'Экон.' },
      { id: 'diplomacy', icon: Icons.diplomacy(16), label: 'Дипл.' },
      { id: 'army', icon: Icons.army(16), label: 'Армия' },
      { id: 'research', icon: Icons.research(16), label: 'Наука' },
      { id: 'production', icon: Icons.production(16), label: 'ВПК' },
      { id: 'intel', icon: Icons.intel(16), label: 'Развед.' }
    ];
    const list = document.getElementById('nav-list')!;
    list.innerHTML = nav.map(n => `
      <li class="nav-item" data-nav="${n.id}" role="tab" tabindex="0" aria-label="${n.label}">
        <span class="nav-icon">${n.icon}</span>
        <span class="nav-label">${n.label}</span>
      </li>
    `).join('');
    list.querySelectorAll<HTMLLIElement>('.nav-item').forEach(item => {
      item.addEventListener('click', () => this.openPanel(item.dataset.nav as PanelId));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openPanel(item.dataset.nav as PanelId);
        }
      });
    });
  }

  /* ================================================================
     Привязка глобальных событий
     ================================================================ */
  private _bindEvents(): void {
    eventBus.on(GameEvents.TIME_TICK, () => this._refreshTopBar());
    eventBus.on(GameEvents.TIME_SPEED_CHANGED, () => this._updateSpeedUI());
    eventBus.on(GameEvents.TIME_PAUSED, () => this._updateSpeedUI());
    eventBus.on(GameEvents.TIME_RESUMED, () => this._updateSpeedUI());
    eventBus.on(GameEvents.COUNTRY_SELECTED, () => {
      this._refreshTopBar();
      this.openPanel(this.activePanel ?? 'politics');
    });
    eventBus.on(GameEvents.COUNTRY_DATA_CHANGED, () => {
      this._refreshTopBar();
      this._refreshActivePanel();
    });
    eventBus.on(GameEvents.RANDOM_EVENT_TRIGGERED, (d: any) => {
      const ev: RandomEvent = d.event;
      this._refreshEventList();
      this.showNotification(`${ev.title}${ev.country ? ' — ' + ev.country : ''}`, 'warn');
      if (!ev.resolved) this._showEventModal(ev);
    });
    eventBus.on(GameEvents.EVENT_OPTION_CHOSEN, () => this._refreshEventList());
    eventBus.on(GameEvents.NOTIFICATION_ADD, (d: any) => {
      this.addNews({ id: `n${Date.now()}`, date: d.date ?? gameTime.formatDate('long'), country: d.country, text: d.text });
    });
    eventBus.on(GameEvents.WAR_DECLARED, (d: any) => {
      const a = countrySystem.getCountry(d.attacker);
      const b = countrySystem.getCountry(d.defender);
      this.addNews({ id: `war${Date.now()}`, date: gameTime.formatDate('long'), country: a?.nameRu, text: `объявила войну ${b?.nameRu}.` });
      this.showNotification(`Война: ${a?.nameRu} против ${b?.nameRu}`, 'danger');
    });
    eventBus.on(GameEvents.PEACE_SIGNED, (d: any) => {
      const a = countrySystem.getCountry(d.countryA);
      const b = countrySystem.getCountry(d.countryB);
      this.addNews({ id: `peace${Date.now()}`, date: gameTime.formatDate('long'), country: a?.nameRu, text: `подписала мир с ${b?.nameRu}.` });
    });
    eventBus.on(GameEvents.ALLIANCE_FORMED, (d: any) => {
      const a = countrySystem.getCountry(d.countryA);
      const b = countrySystem.getCountry(d.countryB);
      this.addNews({ id: `all${Date.now()}`, date: gameTime.formatDate('long'), country: a?.nameRu, text: `заключила союз с ${b?.nameRu}.` });
    });
    eventBus.on(GameEvents.TRADE_DEAL_SIGNED, (d: any) => {
      const a = countrySystem.getCountry(d.countryA);
      const b = countrySystem.getCountry(d.countryB);
      this.addNews({ id: `tr${Date.now()}`, date: gameTime.formatDate('long'), country: a?.nameRu, text: `подписала торговое соглашение с ${b?.nameRu}.` });
    });
    eventBus.on(GameEvents.BATTLE_STARTED, (d: any) => {
      const b = d?.battle;
      if (!b) return;
      const p = countrySystem.getPlayer();
      const atk = countrySystem.getCountry(b.attackerCode);
      const def = countrySystem.getCountry(b.defenderCode);
      if (p && (b.attackerCode === p.code || b.defenderCode === p.code)) {
        this.showNotification(`⚔️ Началось сражение: ${atk?.nameRu ?? b.attackerCode} vs ${def?.nameRu ?? b.defenderCode}! Нажмите на маркер ⚔ на карте для 3D-тактики.`, 'danger');
        this.addNews({
          id: `bat_${Date.now()}`,
          date: gameTime.formatDate('long'),
          country: atk?.nameRu,
          text: `вступила в бой с силами ${def?.nameRu ?? b.defenderCode}.`
        });
      }
    });
    eventBus.on(GameEvents.CITY_CAPTURED, (d: any) => {
      if (!d) return;
      const target = countrySystem.getCountry(d.countryCode);
      const occ = countrySystem.getCountry(d.occupierCode);
      const capLabel = d.isCapital ? 'столицу ' : '';
      this.addNews({
        id: `cap_${Date.now()}`,
        date: gameTime.formatDate('long'),
        country: occ?.nameRu,
        text: `заняла ${capLabel}г. ${d.city} (${target?.nameRu ?? d.countryCode}).`
      });
      const p = countrySystem.getPlayer();
      if (p && (d.countryCode === p.code || d.occupierCode === p.code)) {
        this.showNotification(`🏳 ${occ?.nameRu ?? d.occupierCode} захватила ${capLabel}г. ${d.city}!`, d.countryCode === p.code ? 'danger' : 'success');
      }
    });
    eventBus.on(GameEvents.COUNTRY_CAPITULATED, (d: any) => {
      if (!d?.loser || !d?.winner) return;
      const loser = countrySystem.getCountry(d.loser);
      const winner = countrySystem.getCountry(d.winner);
      const p = countrySystem.getPlayer();
      if (!loser || !winner) return;

      if (p && winner.code === p.code) {
        gameTime.pause();
        this._showModal(
          `🏳 Капитуляция: ${loser.nameRu}`,
          `
            <div class="event-modal">
              <div class="event-desc">Вооружённые силы государства <b>${loser.nameRu}</b> сломили сопротивление. Выберите условия мирного договора:</div>
              <div class="event-opts">
                <button class="btn-event-opt" id="cap-occupy">Оккупация и марионеточное правительство (роспуск армии, репарации 40%)</button>
                <button class="btn-event-opt" id="cap-regime">Смена режима и репарации (идеология ${winner.ideology}, репарации 25%)</button>
              </div>
            </div>
          `
        );
        setTimeout(() => {
          document.getElementById('cap-occupy')?.addEventListener('click', () => {
            const res = diplomacySystem.capitulate(loser.code, winner.code, 'occupy');
            this.showNotification(`${loser.nameRu} оккупирована! Репарации: +$${res.reparations} млрд`, 'success');
            this.addNews({ id: `capit_${Date.now()}`, date: gameTime.formatDate('long'), country: loser.nameRu, text: `капитулировала и перешла под оккупацию ${winner.nameRu}.` });
            this._closeModal();
            this._refreshActivePanel();
          });
          document.getElementById('cap-regime')?.addEventListener('click', () => {
            const res = diplomacySystem.capitulate(loser.code, winner.code, 'regime_change');
            this.showNotification(`В ${loser.nameRu} установлен лояльный режим! Репарации: +$${res.reparations} млрд`, 'success');
            this.addNews({ id: `capit_${Date.now()}`, date: gameTime.formatDate('long'), country: loser.nameRu, text: `капитулировала перед ${winner.nameRu} с полной сменой режима.` });
            this._closeModal();
            this._refreshActivePanel();
          });
        }, 0);
      } else {
        diplomacySystem.capitulate(loser.code, winner.code, 'occupy');
        this.addNews({ id: `capit_${Date.now()}`, date: gameTime.formatDate('long'), country: loser.nameRu, text: `капитулировала перед ${winner.nameRu}.` });
        if (p && loser.code === p.code) {
          this.showNotification(`🏳 Ваше государство капитулировало перед ${winner.nameRu}!`, 'danger');
        }
      }
    });
    eventBus.on(GameEvents.TACTICAL_MODE_EXIT, (d: any) => {
      const rep = d?.report;
      if (!rep) return;
      const winLabel = rep.winner === 'attacker' ? 'Победа атакующих' : rep.winner === 'defender' ? 'Победа обороны' : 'Ничья';
      this._showModal(
        `${Icons.army(15)} Итоги сражения`,
        `
          <div class="kv-row"><span class="kv-k">Результат</span><span class="kv-v">${winLabel}</span></div>
          <div class="kv-row"><span class="kv-k">Потери атакующих</span><span class="kv-v neg">${rep.attackerLosses}%</span></div>
          <div class="kv-row"><span class="kv-k">Потери обороны</span><span class="kv-v neg">${rep.defenderLosses}%</span></div>
          <div class="kv-row"><span class="kv-k">Удержано точек</span><span class="kv-v">${rep.objectivesHeld ?? 0} / 3</span></div>
          <div class="kv-row"><span class="kv-k">Опыт подразделений</span><span class="kv-v pos">+${Math.round(rep.expGained * 100)}%</span></div>
          <div class="kv-row"><span class="kv-k">Захват позиций</span><span class="kv-v">${rep.territoryCaptured ? 'Да' : 'Нет'}</span></div>
        `
      );
      this._refreshActivePanel();
    });
    eventBus.on(GameEvents.PROVINCE_CLICK, (d: any) => {
      if (d.code) this._showCountryInfo(d.code);
    });
    eventBus.on(GameEvents.TACTICAL_UNIT_SELECTED, (d: any) => {
      this._showUnitInfo(d.unitId);
    });
  }

  /* ================================================================
     Верхняя панель
     ================================================================ */
  private _refreshTopBar(): void {
    const c = countrySystem.getPlayer();
    const dateStr = gameTime.formatDate('long');
    if (!c) {
      document.getElementById('top-stats')!.innerHTML = `
        <div class="stat"><div class="label">Дата</div><div class="value neutral">${dateStr}</div></div>
        <div class="stat"><div class="label">Государство</div><div class="value">—</div></div>
      `;
      return;
    }
    const sc = c.stability >= 0.6 ? 'pos' : c.stability < 0.4 ? 'neg' : 'neutral';
    document.getElementById('top-stats')!.innerHTML = `
      <div class="stat"><div class="label">Дата</div><div class="value neutral">${dateStr}</div></div>
      <div class="stat"><div class="label">Государство</div><div class="value"><span class="flag-dot" style="background:${c.color}"></span>${c.nameRu}</div></div>
      <div class="stat"><div class="label">Бюджет</div><div class="value pos">${this._fmtMoney(c.money)}</div></div>
      <div class="stat"><div class="label">ВВП</div><div class="value pos">${this._fmtMoney(c.gdp)}</div></div>
      <div class="stat"><div class="label">Стабильность</div><div class="value ${sc}">${Math.round(c.stability * 100)}%</div></div>
      <div class="stat"><div class="label">Население</div><div class="value">${c.population.toFixed(1)} млн</div></div>
      <div class="stat"><div class="label">Воен. бюджет</div><div class="value">${Math.round(c.militaryBudget)} млрд</div></div>
    `;
  }

  private _updateSpeedUI(): void {
    const s = gameTime.paused ? 0 : (gameTime.speed as number);
    document.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach(btn => {
      const sp = parseInt(btn.dataset.speed ?? '0');
      btn.classList.toggle('active', sp === s);
    });
    const lbl = document.getElementById('pause-label');
    lbl?.classList.toggle('show', s === 0);
  }

  /* ================================================================
     Панели управления
     ================================================================ */
  openPanel(panelId: PanelId): void {
    this.activePanel = panelId;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', (el as HTMLElement).dataset.nav === panelId);
    });
    this._renderPanel(panelId);
    const content = document.getElementById('panel-content');
    if (content) {
      content.classList.remove('slide-in-panel');
      // Force reflow so the class can be re-added to trigger animation
      void content.offsetWidth;
      content.classList.add('slide-in-panel');
      setTimeout(() => content.classList.remove('slide-in-panel'), 200);
    }
  }

  private _refreshActivePanel(): void {
    if (this.activePanel) this._renderPanel(this.activePanel);
  }

  private _renderPanel(panelId: PanelId): void {
    const titles: Record<PanelId, string> = {
      politics: 'Политика',
      economy: 'Экономика',
      diplomacy: 'Дипломатия',
      army: 'Вооружённые силы',
      research: 'Технологии и НИОКР',
      production: 'Производство и ВПК',
      intel: 'Разведка'
    };
    const titleEl = document.getElementById('panel-title');
    if (titleEl) titleEl.textContent = titles[panelId] ?? 'Управление';

    const c = countrySystem.getPlayer();
    let html = '';
    if (!c) {
      html = `<div class="info-box">Выберите государство на карте.</div>`;
    } else {
      switch (panelId) {
        case 'politics': html = this._buildPoliticsPanel(c); break;
        case 'economy': html = this._buildEconomyPanel(c); break;
        case 'diplomacy': html = this._buildDiplomacyPanel(c); break;
        case 'army': html = this._buildArmyPanel(c); break;
        case 'research': html = this._buildResearchPanel(c); break;
        case 'production': html = this._buildProductionPanel(c); break;
        case 'intel': html = this._buildIntelPanel(c); break;
      }
    }

    const content = document.getElementById('panel-content');
    if (content) {
      content.innerHTML = html;
      this._attachPanelHandlers(panelId, c);
    }
  }

  /* ---------- ПОЛИТИКА ---------- */
  private _buildPoliticsPanel(c: Country): string {
    const labelsMap: Record<string, string> = {
      defense: 'Обороны', economy: 'Экономики', foreign: 'Иностранных дел', interior: 'Внутренних дел'
    };
    const ministersHtml = (Object.keys(c.ministers) as Array<keyof typeof c.ministers>).map(key => `
      <div class="kv-row">
        <span class="kv-k">Министр ${labelsMap[key] ?? key}</span>
        <span class="kv-v">${c.ministers[key]}</span>
      </div>
    `).join('');

    const lawsHtml = AVAILABLE_LAWS.map(l => {
      const done = c.laws.includes(l.id);
      const canAfford = c.money >= l.cost;
      return `
        <div class="law-item ${done ? 'done' : ''}">
          <div class="law-name">${done ? Icons.check(13) : ''} ${l.name}</div>
          <div class="law-desc">${l.description}</div>
          ${!done ? `<button class="btn-sm ${canAfford ? '' : 'disabled'}" data-law="${l.id}">Принять (${l.cost} млрд)</button>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="panel-section">
        <div class="psec-title">Государство</div>
        <div class="kv-row"><span class="kv-k">Идеология</span><span class="kv-v">${IDEOLOGY_RU[c.ideology] ?? c.ideology}</span></div>
        <div class="kv-row"><span class="kv-k">Правительство</span><span class="kv-v">${c.government}</span></div>
        <div class="kv-row"><span class="kv-k">Партия</span><span class="kv-v">${c.rulingParty}</span></div>
        <div class="kv-row"><span class="kv-k">Стабильность</span><span class="kv-v bar-wrap">
          <div class="bar" style="width:${Math.round(c.stability*100)}%;background:${c.stability>0.6?'var(--status-pos)':c.stability<0.4?'var(--status-danger)':'var(--status-warn)'}"></div>
          <span>${Math.round(c.stability * 100)}%</span>
        </span></div>
        <div class="kv-row"><span class="kv-k">Коррупция</span><span class="kv-v bar-wrap">
          <div class="bar" style="width:${Math.round(c.corruption*100)}%;background:var(--status-danger)"></div>
          <span>${Math.round(c.corruption * 100)}%</span>
        </span></div>
        <div class="kv-row"><span class="kv-k">Общ. мнение</span><span class="kv-v bar-wrap">
          <div class="bar" style="width:${Math.round(c.publicOpinion*100)}%;background:var(--accent-text)"></div>
          <span>${Math.round(c.publicOpinion * 100)}%</span>
        </span></div>
      </div>
      <div class="panel-section">
        <div class="psec-title">Кабинет министров</div>
        ${ministersHtml}
        <button class="btn-action" id="btn-appoint">${Icons.users(14)} Назначить министра</button>
      </div>
      <div class="panel-section">
        <div class="psec-title">Действия</div>
        <button class="btn-action" id="btn-anticorrupt">${Icons.shield(14)} Борьба с коррупцией (${Math.max(10, Math.round(c.gdp * 0.01))} млрд)</button>
        <button class="btn-action" id="btn-election">${Icons.vote(14)} Провести выборы</button>
      </div>
      <div class="panel-section">
        <div class="psec-title">Законодательство</div>
        ${lawsHtml}
      </div>
    `;
  }

  /* ---------- ЭКОНОМИКА ---------- */
  private _buildEconomyPanel(c: Country): string {
    const rep = economySystem.getMonthlyReport(c);
    const growthClass = c.gdpGrowth >= 0 ? 'pos' : 'neg';
    return `
      <div class="panel-section">
        <div class="psec-title">Государственный бюджет</div>
        <div class="kv-row"><span class="kv-k">Казна</span><span class="kv-v pos">${this._fmtMoney(c.money)}</span></div>
        <div class="kv-row"><span class="kv-k">Госдолг</span><span class="kv-v ${c.debt > 0 ? 'neg' : ''}">${this._fmtMoney(c.debt)}</span></div>
        <div class="kv-row"><span class="kv-k">ВВП</span><span class="kv-v pos">${this._fmtMoney(c.gdp)}</span></div>
        <div class="kv-row"><span class="kv-k">Рост ВВП</span><span class="kv-v ${growthClass}">${(c.gdpGrowth * 100).toFixed(1)}%/год</span></div>
        <div class="kv-row"><span class="kv-k">Инфляция</span><span class="kv-v ${c.inflation > 0.05 ? 'neg' : ''}">${(c.inflation * 100).toFixed(1)}%</span></div>
        <div class="kv-row"><span class="kv-k">Безработица</span><span class="kv-v ${c.unemployment > 0.1 ? 'neg' : ''}">${(c.unemployment * 100).toFixed(1)}%</span></div>
      </div>
      <div class="panel-section">
        <div class="psec-title">Ежемесячный баланс</div>
        <div class="kv-row"><span class="kv-k">Нал. поступления</span><span class="kv-v pos">+${this._fmt(rep.taxIncome)} млрд</span></div>
        <div class="kv-row"><span class="kv-k">Торговый бонус</span><span class="kv-v pos">+${this._fmt(rep.tradeBonus)} млрд</span></div>
        <div class="kv-row"><span class="kv-k">Военные расходы</span><span class="kv-v neg">−${this._fmt(rep.militaryUpkeep)} млрд</span></div>
        <div class="kv-row"><span class="kv-k">Гражданские расходы</span><span class="kv-v neg">−${this._fmt(rep.civilUpkeep)} млрд</span></div>
        <div class="kv-row"><span class="kv-k">Проценты по долгу</span><span class="kv-v neg">−${this._fmt(rep.debtInterest)} млрд</span></div>
        <div class="kv-row" style="border-top:1px solid var(--border-subtle);margin-top:4px;padding-top:4px">
          <span class="kv-k">Итог/месяц</span>
          <span class="kv-v ${rep.net >= 0 ? 'pos' : 'neg'}">${rep.net >= 0 ? '+' : ''}${this._fmt(rep.net)} млрд</span>
        </div>
      </div>
      <div class="panel-section">
        <div class="psec-title">Налоговая ставка: <span id="tax-display">${Math.round(c.taxRate * 100)}%</span></div>
        <input type="range" id="tax-slider" min="10" max="55" value="${Math.round(c.taxRate * 100)}" class="slider">
        <button class="btn-action" id="btn-tax">${Icons.check(14)} Применить ставку</button>
      </div>
      <div class="panel-section">
        <div class="psec-title">Военные расходы: <span id="mil-display">${Math.round(c.militaryBudget)} млрд</span></div>
        <input type="range" id="mil-slider" min="1" max="${Math.max(10, Math.round(c.gdp * 0.12))}" value="${Math.round(c.militaryBudget)}" class="slider">
        <button class="btn-action" id="btn-mil">${Icons.check(14)} Применить</button>
      </div>
      <div class="panel-section">
        <div class="psec-title">Прямые действия</div>
        <button class="btn-action" id="btn-invest">${Icons.production(14)} Инвестировать в экономику (20 млрд)</button>
        <button class="btn-action" id="btn-loan">${Icons.credit(14)} Взять кредит (50 млрд)</button>
        <button class="btn-action ${c.debt <= 0 ? 'disabled' : ''}" id="btn-repay">${Icons.economy(14)} Погасить долг (10 млрд)</button>
      </div>
      <div class="panel-section">
        <div class="psec-title">Ресурсы</div>
        <div class="kv-row"><span class="kv-k">${Icons.fuel(13)} Нефть</span><span class="kv-v">${c.resources.oil} ед.</span></div>
        <div class="kv-row"><span class="kv-k">${Icons.gear(13)} Сталь</span><span class="kv-v">${c.resources.steel} ед.</span></div>
        <div class="kv-row"><span class="kv-k">${Icons.bolt(13)} Энергия</span><span class="kv-v">${c.resources.energy} ед.</span></div>
        <div class="kv-row"><span class="kv-k">${Icons.wheat(13)} Продовольствие</span><span class="kv-v">${c.resources.food} ед.</span></div>
      </div>
      <div class="panel-section">
        <div class="psec-title">Торговые партнёры (${c.tradePartners.length})</div>
        ${c.tradePartners.length > 0 ? c.tradePartners.map(tp => {
          const co = countrySystem.getCountry(tp);
          return `<div class="kv-row"><span class="kv-k">${co?.nameRu ?? tp}</span><span class="kv-v pos">${Icons.box(12)} Активно</span></div>`;
        }).join('') : '<div class="empty-hint">Нет торговых партнёров</div>'}
      </div>
    `;
  }

  /* ---------- ДИПЛОМАТИЯ ---------- */
  private _buildDiplomacyPanel(c: Country): string {
    const allCountries = countrySystem.getAll().filter(x => x.code !== c.code);
    const rows = allCountries
      .sort((a, b) => (c.getRelation(b.code) - c.getRelation(a.code)))
      .slice(0, 25)
      .map(oc => {
        const rel = c.getRelation(oc.code);
        const relPct = Math.round(rel * 100);
        const bar = Math.abs(relPct);
        const cls = rel >= 0 ? 'var(--status-pos)' : 'var(--status-danger)';
        const statusIcon = c.warWith.includes(oc.code)
          ? Icons.army(12)
          : c.allies.includes(oc.code)
            ? Icons.handshake(12)
            : c.tradePartners.includes(oc.code)
              ? Icons.box(12)
              : '';
        return `
          <div class="dipl-row" data-code="${oc.code}">
            <div class="dipl-name">${statusIcon}<span>${oc.nameRu}</span></div>
            <div class="dipl-bar-wrap">
              <div class="dipl-bar" style="width:${bar}%;background:${cls}"></div>
            </div>
            <div class="dipl-val ${rel >= 0 ? 'pos' : 'neg'}">${relPct > 0 ? '+' : ''}${relPct}%</div>
          </div>
        `;
      }).join('');

    const allies = c.allies.map(a => countrySystem.getCountry(a)?.nameRu ?? a).join(', ') || '—';
    const wars = c.warWith.map(a => countrySystem.getCountry(a)?.nameRu ?? a).join(', ') || '—';
    const sanctions = c.sanctionsFrom.map(a => countrySystem.getCountry(a)?.nameRu ?? a).join(', ') || '—';

    const orgsHtml = diplomacySystem.getOrganizations().map(org => {
      const isMem = org.members.includes(c.code);
      return `
        <div class="kv-row" style="align-items:center">
          <span class="kv-k" title="${org.desc}">${org.name} (${org.members.length})</span>
          ${isMem
            ? `<button class="btn-sm" data-leave-org="${org.id}">Выйти</button>`
            : org.id === 'un_sc'
              ? '<span class="kv-v" style="font-size:10px">Закрыт</span>'
              : `<button class="btn-sm" data-join-org="${org.id}">Вступить (10 млрд)</button>`}
        </div>
      `;
    }).join('');

    const disputes = diplomacySystem.getDisputes(c.code);
    const disputesHtml = disputes.length > 0 ? disputes.map(d => {
      const other = d.claimant === c.code ? d.holder : d.claimant;
      const otherName = countrySystem.getCountry(other)?.nameRu ?? other;
      return `
        <div class="tech-card">
          <div class="tech-title">${d.regionName} (${otherName})</div>
          <div class="tech-desc">Напряжённость: ${Math.round(d.tension * 100)}%</div>
          <div class="tech-footer" style="gap:4px">
            <button class="btn-sm" data-dispute-neg="${d.id}">Урегулировать (6 млрд)</button>
            <button class="btn-sm" data-dispute-esc="${d.id}">Обострить</button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty-hint">Активных территориальных споров нет</div>';

    return `
      <div class="panel-section">
        <div class="psec-title">Статус</div>
        <div class="kv-row"><span class="kv-k">Союзники</span><span class="kv-v pos">${allies}</span></div>
        <div class="kv-row"><span class="kv-k">Войны</span><span class="kv-v ${c.warWith.length > 0 ? 'neg' : ''}">${wars}</span></div>
        <div class="kv-row"><span class="kv-k">Санкции против нас</span><span class="kv-v ${c.sanctionsFrom.length > 0 ? 'neg' : ''}">${sanctions}</span></div>
      </div>
      <div class="panel-section">
        <div class="psec-title">Международные организации</div>
        ${orgsHtml}
      </div>
      <div class="panel-section">
        <div class="psec-title">Территориальные споры</div>
        ${disputesHtml}
      </div>
      <div class="panel-section">
        <div class="psec-title">Дипломатия (клик — действия)</div>
        <div id="dipl-country-list">${rows}</div>
      </div>
    `;
  }

  /* ---------- АРМИЯ ---------- */
  private _buildArmyPanel(c: Country): string {
    const units = militarySystem.getUnitsByCountry(c.code);
    const unitsHtml = units.length > 0 ? units.map(u => {
      const morale = Math.round(u.morale * 100);
      const supply = Math.round(u.supply * 100);
      const morCls = morale >= 70 ? 'pos' : morale < 40 ? 'neg' : 'neutral';
      return `
        <div class="unit-row" data-uid="${u.id}">
          <div class="unit-type-badge">${this._unitTypeIcon(u.type)}</div>
          <div class="unit-info">
            <div class="unit-name">${u.name} <span style="font-size:10px;color:var(--text-muted)">[${ECHELON_META[u.echelon ?? 'battalion'].label}]</span></div>
            <div class="unit-stats">
              <span class="${morCls}">${Icons.arrowUp(11)} ${morale}%</span>
              <span>${Icons.bolt(11)} ${supply}%</span>
              <span>${Icons.army(11)} ${u.strength}</span>
              <span>${Icons.star(11)} ${Math.round(u.experience * 100)}%</span>
            </div>
          </div>
          <button class="btn-mini" data-uid="${u.id}" aria-label="Выбрать на карте">${Icons.pin(13)}</button>
        </div>
      `;
    }).join('') : '<div class="empty-hint">Войска отсутствуют</div>';

    const recruitHtml = (Object.keys(UNIT_META) as UnitType[]).map(type => {
      const meta = UNIT_META[type]!;
      return `<button class="btn-recruit" data-type="${type}">${this._unitTypeIcon(type)} ${meta.label} (${meta.cost} млрд)</button>`;
    }).join('');

    const warEnemy = c.warWith[0];
    const tacBtn = warEnemy
      ? `<button class="btn-action primary" id="btn-tactical-battle">${Icons.crosshair(14)} Вступить в тактический бой (${countrySystem.getCountry(warEnemy)?.nameRu ?? warEnemy})</button>`
      : '';

    return `
      ${tacBtn ? `<div class="panel-section">${tacBtn}</div>` : ''}
      <div class="panel-section">
        <div class="psec-title">Боевые единицы (${units.length})</div>
        <div id="unit-list">${unitsHtml}</div>
      </div>
      <div class="panel-section">
        <div class="psec-title">Призыв</div>
        <div class="kv-row"><span class="kv-k">Резервисты</span><span class="kv-v">${this._fmt(c.manpower)} тыс.</span></div>
        <div class="recruit-grid">${recruitHtml}</div>
      </div>
    `;
  }

  /* ---------- ИССЛЕДОВАНИЯ ---------- */
  private _buildResearchPanel(c: Country): string {
    const st = technologySystem.getCountryTechState(c.code);
    const activeDef = st.active ? TECH_TREE.find(t => t.id === st.active!.techId) : null;
    const activePct = st.active ? Math.min(100, Math.round((st.active.progressDays / st.active.totalDays) * 100)) : 0;

    const activeHtml = activeDef ? `
      <div class="info-box" style="margin-bottom:8px;border-color:var(--accent-blue)">
        <div class="tech-title">Исследуется: ${activeDef.name}</div>
        <div class="tech-desc">${activeDef.desc}</div>
        <div class="bar-full" style="margin:6px 0"><div class="bar-fill" style="width:${activePct}%"></div></div>
        <div class="kv-row"><span class="kv-k">Прогресс</span><span class="kv-v">${Math.floor(st.active!.progressDays)} / ${st.active!.totalDays} дн. (${activePct}%)</span></div>
      </div>
    ` : '<div class="empty-hint" style="margin-bottom:8px">Нет активного исследования</div>';

    const listHtml = TECH_TREE.map(t => {
      const done = st.researched.includes(t.id);
      const isActive = st.active?.techId === t.id;
      const check = technologySystem.canResearch(c.code, t.id);
      const branchLabel = TECH_BRANCH_META[t.branch].label;
      let btnHtml = '';
      if (done) {
        btnHtml = '<span class="kv-v pos">Изучено</span>';
      } else if (isActive) {
        btnHtml = `<span class="kv-v" style="color:var(--accent-blue)">${activePct}%</span>`;
      } else {
        btnHtml = `<button class="btn-sm ${!check.ok ? 'disabled' : ''}" data-tech="${t.id}" title="${check.reason ?? ''}">
          Начать (${t.cost} млрд / ${t.days}д)
        </button>`;
      }

      return `
        <div class="tech-card" style="${done ? 'opacity:0.7;border-color:var(--status-pos)' : ''}">
          <div class="tech-title">${t.name} <span style="font-size:10px;color:var(--text-muted)">[T${t.tier}]</span></div>
          <div class="tech-desc">${t.desc}</div>
          <div class="tech-footer">
            <span class="tech-field">${branchLabel}</span>
            ${btnHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="panel-section">
        <div class="psec-title">Технологический уровень: ${(c.militaryTech * 100).toFixed(0)}% (${st.researched.length}/${TECH_TREE.length})</div>
        <div class="bar-full"><div class="bar-fill" style="width:${Math.min(100, c.militaryTech * 100)}%"></div></div>
        ${activeHtml}
        <div class="tech-list">${listHtml}</div>
      </div>
    `;
  }

  /* ---------- ПРОИЗВОДСТВО И ЛОГИСТИКА ---------- */
  private _buildProductionPanel(c: Country): string {
    const ind = productionSystem.getIndustry(c.code);
    const log = logisticsSystem.getLogistics(c.code);

    const fmtNet = (v: number) => {
      const cls = v >= 0 ? 'pos' : 'neg';
      return `<span class="${cls}">${v >= 0 ? '+' : ''}${v.toFixed(1)}/д</span>`;
    };

    const queueHtml = ind.queue.length > 0 ? ind.queue.map((o, idx) => {
      const pct = Math.min(100, Math.round((o.progress / o.totalWork) * 100));
      return `
        <div class="tech-card">
          <div class="tech-title">${idx === 0 ? '▶ ' : ''}${o.label}</div>
          <div class="bar-full" style="margin:4px 0"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="tech-footer">
            <span class="tech-field">${pct}% (${Math.floor(o.progress)}/${o.totalWork})</span>
            <button class="btn-sm" data-cancel-order="${o.id}">Отмена</button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty-hint">Очередь производства пуста</div>';

    return `
      <div class="panel-section">
        <div class="psec-title">Военно-промышленный комплекс</div>
        <div class="kv-row"><span class="kv-k">Военные заводы</span><span class="kv-v">${ind.militaryFactories} шт.</span></div>
        <div class="kv-row"><span class="kv-k">Гражданские заводы</span><span class="kv-v">${ind.civilFactories} шт.</span></div>
        <div class="kv-row"><span class="kv-k">Ресурсы (нефть / сталь)</span><span class="kv-v">${c.resources.oil} / ${c.resources.steel}</span></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn-sm" id="btn-build-milfac" style="flex:1">+ Воен. завод (24 млрд)</button>
          <button class="btn-sm" id="btn-build-civfac" style="flex:1">+ Гражд. завод (20 млрд)</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="psec-title">Очередь производства (${ind.queue.length}/6)</div>
        ${queueHtml}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px">
          <button class="btn-sm" data-prod-kind="unit" data-prod-unit="infantry">+ Пехота</button>
          <button class="btn-sm" data-prod-kind="unit" data-prod-unit="tank">+ Танки</button>
          <button class="btn-sm" data-prod-kind="unit" data-prod-unit="mechanized">+ Мех. бригада</button>
          <button class="btn-sm" data-prod-kind="unit" data-prod-unit="air">+ Авиация</button>
          <button class="btn-sm" data-prod-kind="ammo_batch">+ Боеприпасы (5 млрд)</button>
          <button class="btn-sm" data-prod-kind="fuel_batch">+ Топливо (4 млрд)</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="psec-title">Логистика и запасы</div>
        <div class="kv-row"><span class="kv-k">Снабжение армии</span><span class="kv-v ${c.supplyLevel > 0.7 ? 'pos' : c.supplyLevel < 0.45 ? 'neg' : ''}">${Math.round(c.supplyLevel * 100)}%</span></div>
        <div class="kv-row"><span class="kv-k">Топливо</span><span class="kv-v">${Math.round(log.fuel)} ед. (${fmtNet(log.dailyNet.fuel)})</span></div>
        <div class="kv-row"><span class="kv-k">Боеприпасы</span><span class="kv-v">${Math.round(log.ammo)} ед. (${fmtNet(log.dailyNet.ammo)})</span></div>
        <div class="kv-row"><span class="kv-k">Продовольствие</span><span class="kv-v">${Math.round(log.food)} ед. (${fmtNet(log.dailyNet.food)})</span></div>
        <div class="kv-row"><span class="kv-k">Медикаменты</span><span class="kv-v">${Math.round(log.medical)} ед. (${fmtNet(log.dailyNet.medical)})</span></div>
        <div class="kv-row"><span class="kv-k">Склады / Ж/Д узлы</span><span class="kv-v">${log.depots} / ${log.railHubs} (инфра ${Math.round(log.infraLevel * 100)}%)</span></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn-sm" id="btn-build-depot" style="flex:1">+ Склад (12 млрд)</button>
          <button class="btn-sm" id="btn-upgrade-infra" style="flex:1">+ Ж/Д и дороги (18 млрд)</button>
        </div>
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class="btn-sm" data-buy-sup="fuel" style="flex:1">Купить топливо</button>
          <button class="btn-sm" data-buy-sup="ammo" style="flex:1">Купить БК</button>
        </div>
      </div>
    `;
  }

  /* ---------- РАЗВЕДКА ---------- */
  private _buildIntelPanel(c: Country): string {
    const others = countrySystem.getAll()
      .filter(x => x.code !== c.code)
      .sort((a, b) => b.gdp - a.gdp)
      .slice(0, 35);

    const selectOptions = others.map(x => `<option value="${x.code}">${x.nameRu} (${x.tag})</option>`).join('');

    const targetsToShow = Array.from(new Set([
      ...c.warWith,
      ...intelSystem.getKnownTargets(c.code).map(r => r.targetCode)
    ])).slice(0, 6);

    const cards = targetsToShow.map(code => {
      const tc = countrySystem.getCountry(code);
      if (!tc) return '';
      const lvl = intelSystem.getIntelLevel(c.code, code);
      const units = militarySystem.getUnitsByCountry(code).length;
      const log = logisticsSystem.getLogistics(code);
      const ind = productionSystem.getIndustry(code);
      return `
        <div class="intel-card">
          <div class="intel-country">${Icons.intel(13)} ${tc.nameRu} <span style="font-size:10px;color:var(--text-muted)">(${Math.round(lvl * 100)}%)</span></div>
          <div class="kv-row"><span class="kv-k">Войска</span><span class="kv-v">${lvl >= 0.4 ? units + ' ед.' : '???'}</span></div>
          <div class="kv-row"><span class="kv-k">Воен. заводы</span><span class="kv-v">${lvl >= 0.6 ? ind.militaryFactories + ' шт.' : '???'}</span></div>
          <div class="kv-row"><span class="kv-k">Топливо / БК</span><span class="kv-v">${lvl >= 0.75 ? `${Math.round(log.fuel)} / ${Math.round(log.ammo)}` : '???'}</span></div>
          <div class="kv-row"><span class="kv-k">Стабильность</span><span class="kv-v">${lvl >= 0.35 ? Math.round(tc.stability * 100) + '%' : '???'}</span></div>
        </div>
      `;
    }).join('');

    return `
      <div class="panel-section">
        <div class="psec-title">Спецоперации и агентура</div>
        <select id="intel-target-select" class="menu-select" style="width:100%;margin-bottom:6px">${selectOptions}</select>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" id="btn-intel-gather" style="flex:1">Разведка (8 млрд)</button>
          <button class="btn-sm" id="btn-intel-sabotage" style="flex:1">Диверсия (14 млрд)</button>
        </div>
      </div>
      <div class="panel-section">
        <div class="psec-title">Досье на государства</div>
        ${cards || '<div class="empty-hint">Нет активных разведданных. Выберите цель выше.</div>'}
      </div>
      <div class="panel-section">
        <div class="psec-title">Союзники</div>
        ${c.allies.slice(0, 6).map(a => {
          const ac = countrySystem.getCountry(a);
          return ac ? `<div class="kv-row"><span class="kv-k">${ac.nameRu}</span><span class="kv-v pos">${Math.round(ac.stability * 100)}% стаб.</span></div>` : '';
        }).join('') || '<div class="empty-hint">Нет союзников</div>'}
      </div>
    `;
  }

  /* ================================================================
     Обработчики кнопок
     ================================================================ */
  private _attachPanelHandlers(panelId: PanelId, c: Country | null): void {
    if (!c) return;

    if (panelId === 'politics') {
      document.querySelectorAll<HTMLButtonElement>('[data-law]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('disabled')) return;
          const res = politicsSystem.passLaw(c.code, btn.dataset.law!);
          if (res.ok) this.showNotification('Закон принят.', 'success');
          else this.showNotification(res.reason ?? 'Ошибка', 'danger');
        });
      });
      document.getElementById('btn-anticorrupt')?.addEventListener('click', () => {
        if (politicsSystem.fightCorruption(c.code)) this.showNotification('Антикоррупционная кампания проведена.', 'success');
        else this.showNotification('Недостаточно средств или коррупция минимальна.', 'danger');
      });
      document.getElementById('btn-election')?.addEventListener('click', () => {
        if (politicsSystem.startElection(c.code)) {
          this.showNotification(`Выборы завершены. Правящая партия: ${c.rulingParty}`, 'info');
        }
      });
      document.getElementById('btn-appoint')?.addEventListener('click', () => {
        this._showAppointModal(c);
      });
    }

    if (panelId === 'economy') {
      const taxSlider = document.getElementById('tax-slider') as HTMLInputElement | null;
      const taxDisplay = document.getElementById('tax-display');
      taxSlider?.addEventListener('input', () => {
        if (taxDisplay) taxDisplay.textContent = `${taxSlider.value}%`;
      });
      document.getElementById('btn-tax')?.addEventListener('click', () => {
        const rate = parseInt((document.getElementById('tax-slider') as HTMLInputElement).value, 10) / 100;
        economySystem.setTax(c.code, rate);
        this.showNotification(`Налоговая ставка: ${Math.round(rate * 100)}%`, 'info');
      });

      const milSlider = document.getElementById('mil-slider') as HTMLInputElement | null;
      const milDisplay = document.getElementById('mil-display');
      milSlider?.addEventListener('input', () => {
        if (milDisplay) milDisplay.textContent = `${milSlider.value} млрд`;
      });
      document.getElementById('btn-mil')?.addEventListener('click', () => {
        const val = parseInt((document.getElementById('mil-slider') as HTMLInputElement).value, 10);
        economySystem.setMilitarySpending(c.code, val);
        this.showNotification(`Военный бюджет: ${val} млрд`, 'info');
      });

      document.getElementById('btn-invest')?.addEventListener('click', () => {
        if (economySystem.investEconomy(c.code, 20)) this.showNotification('Инвестировано 20 млрд в экономику.', 'success');
        else this.showNotification('Недостаточно средств.', 'danger');
      });
      document.getElementById('btn-loan')?.addEventListener('click', () => {
        economySystem.takeLoan(c.code, 50);
        this.showNotification('Кредит 50 млрд получен.', 'info');
      });
      document.getElementById('btn-repay')?.addEventListener('click', () => {
        if (economySystem.repayDebt(c.code, 10)) this.showNotification('Погашено 10 млрд долга.', 'success');
        else this.showNotification('Нет долга для погашения.', 'danger');
      });
    }

    if (panelId === 'diplomacy') {
      document.querySelectorAll<HTMLDivElement>('.dipl-row').forEach(row => {
        row.addEventListener('click', () => this._showDiplomacyModal(c, row.dataset.code!));
      });
      document.querySelectorAll<HTMLButtonElement>('[data-join-org]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = diplomacySystem.joinOrganization(c.code, btn.dataset.joinOrg!);
          this.showNotification(res.ok ? 'Страна вступила в организацию.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
          if (res.ok) this._refreshActivePanel();
        });
      });
      document.querySelectorAll<HTMLButtonElement>('[data-leave-org]').forEach(btn => {
        btn.addEventListener('click', () => {
          diplomacySystem.leaveOrganization(c.code, btn.dataset.leaveOrg!);
          this.showNotification('Выход из организации оформлен.', 'info');
          this._refreshActivePanel();
        });
      });
      document.querySelectorAll<HTMLButtonElement>('[data-dispute-neg]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = diplomacySystem.resolveDispute(btn.dataset.disputeNeg!, c.code, 'negotiate');
          this.showNotification(res.ok ? 'Территориальный спор урегулирован.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
          if (res.ok) this._refreshActivePanel();
        });
      });
      document.querySelectorAll<HTMLButtonElement>('[data-dispute-esc]').forEach(btn => {
        btn.addEventListener('click', () => {
          diplomacySystem.resolveDispute(btn.dataset.disputeEsc!, c.code, 'escalate');
          this.showNotification('Напряжённость по спору усилена.', 'warn');
          this._refreshActivePanel();
        });
      });
    }

    if (panelId === 'army') {
      document.getElementById('btn-tactical-battle')?.addEventListener('click', () => {
        const enemyCode = c.warWith[0];
        if (!enemyCode) return;
        const atk = militarySystem.getUnitsByCountry(c.code).map(u => u.id);
        const def = militarySystem.getUnitsByCountry(enemyCode).map(u => u.id);
        if (!atk.length || !def.length) {
          this.showNotification('Нет доступных подразделений для боя.', 'warn');
          return;
        }
        tacticalSystem.enterBattle(`battle_${Date.now()}`, atk, def);
      });
      document.querySelectorAll<HTMLButtonElement>('[data-uid]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const uid = btn.dataset.uid!;
          worldMapSystem.setSelectedUnit(uid);
          this._showUnitInfo(uid);
        });
      });
      document.querySelectorAll<HTMLDivElement>('.unit-row').forEach(row => {
        row.addEventListener('click', () => {
          const uid = row.dataset.uid!;
          worldMapSystem.setSelectedUnit(uid);
          this._showUnitInfo(uid);
        });
      });
      document.querySelectorAll<HTMLButtonElement>('.btn-recruit').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type as UnitType;
          const res = militarySystem.recruitUnit(c.code, type);
          if (res.ok) {
            this.showNotification(`Сформировано: ${res.unit!.name}`, 'success');
            this._log(`Новое подразделение: ${res.unit!.name}`);
            this._refreshActivePanel();
          } else {
            this.showNotification(res.reason ?? 'Ошибка', 'danger');
          }
        });
      });
    }

    if (panelId === 'research') {
      document.querySelectorAll<HTMLButtonElement>('[data-tech]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('disabled')) return;
          const res = technologySystem.startResearch(c.code, btn.dataset.tech!);
          if (res.ok) {
            this.showNotification('Исследование запущено.', 'success');
            this._refreshActivePanel();
          } else {
            this.showNotification(res.reason ?? 'Ошибка', 'danger');
          }
        });
      });
    }

    if (panelId === 'production') {
      document.getElementById('btn-build-milfac')?.addEventListener('click', () => {
        const res = productionSystem.buildFactory(c.code, 'military');
        this.showNotification(res.ok ? 'Военный завод построен.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
        if (res.ok) this._refreshActivePanel();
      });
      document.getElementById('btn-build-civfac')?.addEventListener('click', () => {
        const res = productionSystem.buildFactory(c.code, 'civil');
        this.showNotification(res.ok ? 'Гражданский завод построен.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
        if (res.ok) this._refreshActivePanel();
      });
      document.querySelectorAll<HTMLButtonElement>('[data-prod-kind]').forEach(btn => {
        btn.addEventListener('click', () => {
          const kind = btn.dataset.prodKind as any;
          const unitType = btn.dataset.prodUnit as UnitType | undefined;
          const res = productionSystem.queueOrder(c.code, kind, unitType);
          this.showNotification(res.ok ? 'Заказ добавлен в очередь ВПК.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
          if (res.ok) this._refreshActivePanel();
        });
      });
      document.querySelectorAll<HTMLButtonElement>('[data-cancel-order]').forEach(btn => {
        btn.addEventListener('click', () => {
          productionSystem.cancelOrder(c.code, btn.dataset.cancelOrder!);
          this._refreshActivePanel();
        });
      });
      document.getElementById('btn-build-depot')?.addEventListener('click', () => {
        const res = logisticsSystem.buildDepot(c.code);
        this.showNotification(res.ok ? 'Военный склад построен.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
        if (res.ok) this._refreshActivePanel();
      });
      document.getElementById('btn-upgrade-infra')?.addEventListener('click', () => {
        const res = logisticsSystem.upgradeInfrastructure(c.code);
        this.showNotification(res.ok ? 'Инфраструктура и ж/д узлы улучшены.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
        if (res.ok) this._refreshActivePanel();
      });
      document.querySelectorAll<HTMLButtonElement>('[data-buy-sup]').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.buySup as SupplyType;
          const res = logisticsSystem.buySupplies(c.code, type, 100);
          this.showNotification(res.ok ? 'Закуплено +100 ед. снабжения.' : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
          if (res.ok) this._refreshActivePanel();
        });
      });
    }

    if (panelId === 'intel') {
      document.getElementById('btn-intel-gather')?.addEventListener('click', () => {
        const sel = document.getElementById('intel-target-select') as HTMLSelectElement | null;
        if (!sel?.value) return;
        const res = intelSystem.gatherIntel(c.code, sel.value);
        this.showNotification(res.ok ? `Разведданные обновлены (${Math.round((res.level ?? 0) * 100)}%).` : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
        if (res.ok) this._refreshActivePanel();
      });
      document.getElementById('btn-intel-sabotage')?.addEventListener('click', () => {
        const sel = document.getElementById('intel-target-select') as HTMLSelectElement | null;
        if (!sel?.value) return;
        const res = intelSystem.sabotageSupply(c.code, sel.value);
        if (res.ok) {
          this.showNotification(res.detected ? 'Диверсия проведена, но агенты раскрыты!' : 'Диверсия на складах противника прошла успешно.', res.detected ? 'warn' : 'success');
          this._refreshActivePanel();
        } else {
          this.showNotification(res.reason ?? 'Ошибка', 'danger');
        }
      });
    }
  }

  /* ================================================================
     Модальные окна
     ================================================================ */
  private _showModal(titleHtml: string, html: string): void {
    document.getElementById('modal-title')!.innerHTML = titleHtml;
    document.getElementById('modal-body')!.innerHTML = html;
    document.getElementById('modal-overlay')!.classList.remove('hidden');
  }

  private _closeModal(): void {
    document.getElementById('modal-overlay')!.classList.add('hidden');
  }

  private _showEventModal(ev: RandomEvent): void {
    const opts = ev.options.map(o => `
      <button class="btn-event-opt" data-ev="${ev.id}" data-opt="${o.id}">${o.text}</button>
    `).join('');
    this._showModal(`${Icons.warn(15)} ${ev.title}${ev.country ? ` — ${ev.country}` : ''}`, `
      <div class="event-modal">
        <div class="event-cause">Причина: ${ev.cause}</div>
        <div class="event-desc">${ev.description}</div>
        <div class="event-opts">${opts}</div>
      </div>
    `);
    setTimeout(() => {
      document.querySelectorAll<HTMLButtonElement>('.btn-event-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          if (eventsSystem.chooseOption(btn.dataset.ev!, btn.dataset.opt!)) {
            this.showNotification('Решение принято.', 'success');
            this._closeModal();
            this._refreshActivePanel();
          }
        });
      });
    }, 30);
  }

  private _showDiplomacyModal(c: Country, targetCode: string): void {
    const target = countrySystem.getCountry(targetCode);
    if (!target) return;
    const rel = c.getRelation(targetCode);
    const relPct = Math.round(rel * 100);
    const atWar = c.warWith.includes(targetCode);
    const isAlly = c.allies.includes(targetCode);
    const hasTrade = c.tradePartners.includes(targetCode);
    const hasSanctions = target.sanctionsFrom.includes(c.code);

    this._showModal(`${Icons.diplomacy(15)} ${target.nameRu}`, `
      <div class="dipl-modal">
        <div class="kv-row"><span class="kv-k">Отношения</span><span class="kv-v ${rel >= 0 ? 'pos' : 'neg'}">${relPct > 0 ? '+' : ''}${relPct}%</span></div>
        <div class="kv-row"><span class="kv-k">Идеология</span><span class="kv-v">${IDEOLOGY_RU[target.ideology] ?? target.ideology}</span></div>
        <div class="kv-row"><span class="kv-k">Стабильность</span><span class="kv-v">${Math.round(target.stability * 100)}%</span></div>
        <div class="kv-row"><span class="kv-k">ВВП</span><span class="kv-v">${this._fmtMoney(target.gdp)}</span></div>
        <div class="kv-row"><span class="kv-k">Военных ед.</span><span class="kv-v">${militarySystem.getUnitsByCountry(targetCode).length}</span></div>
        <div class="dipl-actions">
          <button class="btn-action" id="dm-improve" ${atWar ? 'disabled' : ''}>${Icons.peace(14)} Улучшить отношения (5 млрд)</button>
          ${!hasTrade && !atWar ? `<button class="btn-action" id="dm-trade">${Icons.box(14)} Торговое соглашение</button>` : ''}
          ${!isAlly && !atWar && rel >= 0.25 ? `<button class="btn-action" id="dm-ally">${Icons.handshake(14)} Предложить союз</button>` : ''}
          ${!hasSanctions && !atWar ? `<button class="btn-action neg" id="dm-sanction">${Icons.ban(14)} Ввести санкции</button>` : ''}
          ${!atWar ? `<button class="btn-action neg" id="dm-war">${Icons.army(14)} Объявить войну</button>` : `<button class="btn-action" id="dm-peace">${Icons.peace(14)} Запросить мир</button>`}
        </div>
      </div>
    `);
    setTimeout(() => {
      document.getElementById('dm-improve')?.addEventListener('click', () => {
        if (diplomacySystem.improveRelations(c.code, targetCode)) this.showNotification(`Отношения с ${target.nameRu} улучшены.`, 'success');
        else this.showNotification('Недостаточно средств или идёт война.', 'danger');
        this._closeModal();
      });
      document.getElementById('dm-trade')?.addEventListener('click', () => {
        const res = diplomacySystem.signTradeDeal(c.code, targetCode);
        if (res.ok) this.showNotification(`Торговый договор с ${target.nameRu} заключён.`, 'success');
        else this.showNotification(res.reason ?? 'Ошибка', 'danger');
        this._closeModal();
      });
      document.getElementById('dm-ally')?.addEventListener('click', () => {
        const res = diplomacySystem.formAlliance(c.code, targetCode);
        if (res.ok) this.showNotification(`Союз с ${target.nameRu} заключён.`, 'success');
        else this.showNotification(res.reason ?? 'Ошибка', 'danger');
        this._closeModal();
      });
      document.getElementById('dm-sanction')?.addEventListener('click', () => {
        const res = diplomacySystem.imposeSanctions(c.code, targetCode);
        if (res.ok) this.showNotification(`Санкции против ${target.nameRu} введены.`, 'warn');
        else this.showNotification(res.reason ?? 'Ошибка', 'danger');
        this._closeModal();
      });
      document.getElementById('dm-war')?.addEventListener('click', () => {
        if (!confirm(`Объявить войну государству ${target.nameRu}?`)) return;
        const res = diplomacySystem.declareWar(c.code, targetCode);
        if (res.ok) this.showNotification(`Война объявлена: ${target.nameRu}`, 'danger');
        else this.showNotification(res.reason ?? 'Ошибка', 'danger');
        this._closeModal();
      });
      document.getElementById('dm-peace')?.addEventListener('click', () => {
        diplomacySystem.signPeace(c.code, targetCode);
        this.showNotification(`Мир с ${target.nameRu} заключён.`, 'success');
        this._closeModal();
      });
    }, 30);
  }

  private _showAppointModal(c: Country): void {
    const ministries = Object.keys(c.ministers) as Array<keyof typeof c.ministers>;
    const labelsMap: Record<string, string> = {
      defense: 'Обороны', economy: 'Экономики', foreign: 'Иностранных дел', interior: 'Внутренних дел'
    };
    const html = ministries.map(m => `
      <div class="appoint-block">
        <div class="psec-title">Министр ${labelsMap[m] ?? m}</div>
        ${(MINISTER_CANDIDATES[m] ?? []).map(cand => `
          <button class="btn-cand ${c.ministers[m] === cand ? 'selected' : ''}" data-min="${m}" data-cand="${cand}">
            ${c.ministers[m] === cand ? Icons.check(13) : ''} ${cand}
          </button>
        `).join('')}
      </div>
    `).join('');
    this._showModal(`${Icons.users(15)} Назначить министра`, html);
    setTimeout(() => {
      document.querySelectorAll<HTMLButtonElement>('.btn-cand').forEach(btn => {
        btn.addEventListener('click', () => {
          const min = btn.dataset.min as keyof typeof c.ministers;
          const cand = btn.dataset.cand!;
          politicsSystem.appointMinister(c.code, min, cand);
          this.showNotification(`${labelsMap[min] ?? min}: ${cand}`, 'success');
          this._closeModal();
        });
      });
    }, 30);
  }

  private _showUnitInfo(unitId: string): void {
    const u = militarySystem.getUnit(unitId);
    if (!u) return;
    const c = countrySystem.getPlayer();
    const isPlayerUnit = u.countryCode === c?.code;
    const echLabel = ECHELON_META[u.echelon ?? 'battalion'].label;
    const cmdOpts = Object.keys(COMMANDER_TRAITS).map(k =>
      `<option value="${k}" ${u.commander === k ? 'selected' : ''}>${k} (${COMMANDER_TRAITS[k]!.label})</option>`
    ).join('');

    this._showModal(`${Icons.shield(15)} ${u.name}`, `
      <div class="unit-modal">
        <div class="kv-row"><span class="kv-k">Тип</span><span class="kv-v">${UNIT_META[u.type]?.label ?? u.type}</span></div>
        <div class="kv-row"><span class="kv-k">Формирование</span><span class="kv-v">${echLabel}</span></div>
        <div class="kv-row"><span class="kv-k">Командир</span><span class="kv-v">${u.commander ?? 'Не назначен'}</span></div>
        <div class="kv-row"><span class="kv-k">Сила</span><span class="kv-v bar-wrap">
          <div class="bar" style="width:${u.strength/10}%;background:var(--accent-text)"></div><span>${u.strength}/1000</span>
        </span></div>
        <div class="kv-row"><span class="kv-k">Мораль</span><span class="kv-v bar-wrap">
          <div class="bar" style="width:${u.morale*100}%;background:${u.morale>0.6?'var(--status-pos)':'var(--status-danger)'}"></div><span>${Math.round(u.morale*100)}%</span>
        </span></div>
        <div class="kv-row"><span class="kv-k">Снабжение</span><span class="kv-v bar-wrap">
          <div class="bar" style="width:${u.supply*100}%;background:var(--status-warn)"></div><span>${Math.round(u.supply*100)}%</span>
        </span></div>
        <div class="kv-row"><span class="kv-k">Опыт</span><span class="kv-v bar-wrap">
          <div class="bar" style="width:${u.experience*100}%;background:var(--accent-solid)"></div><span>${Math.round(u.experience*100)}%</span>
        </span></div>
        <div class="kv-row"><span class="kv-k">Позиция</span><span class="kv-v">${u.lat.toFixed(1)}°N, ${u.lng.toFixed(1)}°E</span></div>
        ${isPlayerUnit ? `
          <div style="margin-top:10px;display:flex;gap:6px;flex-direction:column">
            <button class="btn-sm" id="btn-unit-promote">Укрупнить соединение (следующий эшелон)</button>
            <div style="display:flex;gap:6px">
              <select id="sel-unit-cmd" class="menu-select" style="flex:1">${cmdOpts}</select>
              <button class="btn-sm" id="btn-unit-cmd">Назначить</button>
            </div>
            <div class="info-box">ПКМ на карте — отдать приказ на перемещение</div>
          </div>
        ` : ''}
      </div>
    `);
    if (isPlayerUnit) {
      document.getElementById('btn-unit-promote')?.addEventListener('click', () => {
        const res = militarySystem.promoteUnit(u.id);
        this.showNotification(res.ok ? `Соединение укрупнено: ${ECHELON_META[res.echelon!].label}` : (res.reason ?? 'Ошибка'), res.ok ? 'success' : 'danger');
        if (res.ok) { this._showUnitInfo(u.id); this._refreshActivePanel(); }
      });
      document.getElementById('btn-unit-cmd')?.addEventListener('click', () => {
        const sel = document.getElementById('sel-unit-cmd') as HTMLSelectElement | null;
        if (sel?.value) {
          militarySystem.assignCommander(u.id, sel.value);
          this.showNotification('Командир назначен.', 'success');
          this._showUnitInfo(u.id);
        }
      });
    }
  }

  private _showCountryInfo(code: string): void {
    const c = countrySystem.getCountry(code);
    if (!c) return;
    const player = countrySystem.getPlayer();
    const rel = player ? Math.round(player.getRelation(code) * 100) : 0;
    this._showModal(`${Icons.flag(15)} ${c.nameRu}`, `
      <div class="country-info">
        <div class="kv-row"><span class="kv-k">Столица</span><span class="kv-v">${c.capital}</span></div>
        <div class="kv-row"><span class="kv-k">Население</span><span class="kv-v">${c.population.toFixed(1)} млн</span></div>
        <div class="kv-row"><span class="kv-k">ВВП</span><span class="kv-v pos">${this._fmtMoney(c.gdp)}</span></div>
        <div class="kv-row"><span class="kv-k">Идеология</span><span class="kv-v">${IDEOLOGY_RU[c.ideology] ?? c.ideology}</span></div>
        <div class="kv-row"><span class="kv-k">Стабильность</span><span class="kv-v">${Math.round(c.stability * 100)}%</span></div>
        <div class="kv-row"><span class="kv-k">Коррупция</span><span class="kv-v neg">${Math.round(c.corruption * 100)}%</span></div>
        <div class="kv-row"><span class="kv-k">Военных ед.</span><span class="kv-v">${militarySystem.getUnitsByCountry(code).length}</span></div>
        ${player ? `<div class="kv-row"><span class="kv-k">Наши отношения</span><span class="kv-v ${rel >= 0 ? 'pos' : 'neg'}">${rel > 0 ? '+' : ''}${rel}%</span></div>` : ''}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-action primary" id="ci-play">${Icons.play(13)} Играть за ${c.nameRu}</button>
          ${player && player.code !== code ? `<button class="btn-action" id="ci-dipl">${Icons.diplomacy(13)} Дипломатия</button>` : ''}
        </div>
      </div>
    `);
    setTimeout(() => {
      document.getElementById('ci-play')?.addEventListener('click', () => {
        countrySystem.setPlayer(code);
        this.showNotification(`Теперь вы управляете: ${c.nameRu}`, 'success');
        this._closeModal();
      });
      document.getElementById('ci-dipl')?.addEventListener('click', () => {
        this._closeModal();
        if (player) {
          this.openPanel('diplomacy');
          setTimeout(() => this._showDiplomacyModal(player, code), 60);
        }
      });
    }, 30);
  }

  /* ================================================================
     Сохранения
     ================================================================ */
  private _showSaveModal(loadOnly = false): void {
    const existing = saveSystem.listSlots();
    const rows = [1, 2, 3, 4, 5].map(slot => {
      const info = existing.find(s => s.slot === slot);
      const desc = info ? `${info.country} · ${info.date}` : 'Пустой слот';
      return `
        <div class="save-slot-row">
          <div>
            <div style="font-weight:600">Слот ${slot}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${desc}</div>
          </div>
          <div style="display:flex;gap:6px">
            ${!loadOnly ? `<button class="btn-sm" data-save-slot="${slot}">Сохранить</button>` : ''}
            ${info ? `<button class="btn-sm" data-load-slot="${slot}">Загрузить</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
    const auto = existing.find(s => s.slot === -1);
    const autoHtml = auto ? `
      <div class="save-slot-row">
        <div>
          <div style="font-weight:600">Автосохранение</div>
          <div style="font-size:11px;color:var(--text-secondary)">${auto.country} · ${auto.date}</div>
        </div>
        <button class="btn-sm" data-load-slot="-1">Загрузить</button>
      </div>
    ` : '';

    this._showModal(`${Icons.save(15)} Сохранение и загрузка`, `${autoHtml}${rows}`);
    setTimeout(() => {
      document.querySelectorAll<HTMLButtonElement>('[data-save-slot]').forEach(btn => {
        btn.addEventListener('click', () => {
          const slot = parseInt(btn.dataset.saveSlot!, 10);
          if (saveSystem.save(slot)) {
            this.showNotification(`Сохранено в слот ${slot}`, 'success');
            this._showSaveModal(loadOnly);
          }
        });
      });
      document.querySelectorAll<HTMLButtonElement>('[data-load-slot]').forEach(btn => {
        btn.addEventListener('click', () => {
          const slot = parseInt(btn.dataset.loadSlot!, 10);
          if (saveSystem.load(slot)) {
            this.hideMainMenu();
            this._closeModal();
            gameTime.resume();
            this._updateSpeedUI();
            this._refreshTopBar();
            this._refreshActivePanel();
            this.showNotification('Кампания загружена', 'info');
          }
        });
      });
    }, 30);
  }

  /* ================================================================
     Новости / события
     ================================================================ */
  addNews(item: any): void {
    this.news.unshift(item);
    if (this.news.length > 80) this.news.pop();
    this._refreshNewsList();
    this.showNotification(item.text, 'info');
  }

  private _refreshNewsList(): void {
    const el = document.getElementById('news-list');
    if (!el) return;
    if (!this.news.length) { el.innerHTML = '<div class="empty-hint">Нет новостей.</div>'; return; }
    el.innerHTML = this.news.slice(0, 10).map(it => `
      <div class="feed-item">
        <div class="feed-date">${it.date}</div>
        <div>${it.country ? `<b>${it.country}:</b> ` : ''}${it.text}</div>
      </div>
    `).join('');
  }

  private _refreshEventList(): void {
    const el = document.getElementById('event-list');
    const events = eventsSystem.getEvents();
    if (!el) return;
    if (!events.length) { el.innerHTML = '<div class="empty-hint">Нет событий.</div>'; return; }
    el.innerHTML = events.slice(0, 8).map(ev => `
      <div class="feed-item ${ev.resolved ? '' : 'unresolved'}" data-ev="${ev.id}">
        <div class="feed-date">${ev.date}${ev.country ? ` · ${ev.country}` : ''}</div>
        <div><b>${ev.title}</b></div>
        ${!ev.resolved ? `<div class="ev-badge">Требует решения</div>` : `<div class="ev-resolved">${Icons.check(11)} Решено</div>`}
      </div>
    `).join('');
    el.querySelectorAll<HTMLDivElement>('[data-ev]').forEach(row => {
      row.addEventListener('click', () => {
        const ev = events.find(e => e.id === row.dataset.ev);
        if (ev && !ev.resolved) this._showEventModal(ev);
      });
    });
  }

  private _seedInitialNews(): void {
    const now = gameTime.formatDate('long');
    this.addNews({ id: 'n0', date: now, country: 'Мир', text: 'Начинается эпоха XXI века. MilitaRIA ждёт ваших решений.' });
    this.addNews({ id: 'n1', date: now, country: 'США', text: 'Увеличены военные ассигнования на 5%.' });
    this.addNews({ id: 'n2', date: now, country: 'Китай', text: 'Объявлена масштабная экономическая программа развития.' });
    this.addNews({ id: 'n3', date: now, country: 'Россия', text: 'Сформированы новые военные доктрины.' });
    this._refreshEventList();
  }

  /* ================================================================
     Уведомления и журнал
     ================================================================ */
  showNotification(text: string, type: 'info' | 'warn' | 'danger' | 'success' = 'info'): void {
    const container = document.getElementById('notifications');
    if (!container) return;
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = text;
    container.appendChild(n);
    setTimeout(() => { n.classList.add('fade-out'); setTimeout(() => n.remove(), 350); }, 5000);
  }

  private _log(text: string): void {
    const el = document.getElementById('journal-entry');
    if (el) el.textContent = text;
  }

  /* ================================================================
     Вспомогательные
     ================================================================ */
  private _fmt(n: number): string {
    return Math.round(n).toLocaleString('ru-RU');
  }

  private _fmtMoney(n: number): string {
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(2) + ' трлн';
    return Math.round(n).toLocaleString('ru-RU') + ' млрд';
  }

  private _unitTypeIcon(type: UnitType): string {
    const icons: Record<UnitType, string> = {
      infantry: Icons.users(14),
      mechanized: Icons.gear(14),
      motorized: Icons.truck(14),
      tank: Icons.shield(14),
      artillery: Icons.target(14),
      recon: Icons.intel(14),
      engineer: Icons.gear(14),
      aa: Icons.crosshair(14),
      air: Icons.plane(14),
      naval: Icons.anchor(14),
      airborne: Icons.arrowUp(14)
    };
    return icons[type] ?? Icons.shield(14);
  }

  getState(): Record<string, any> { return { news: this.news }; }
  setState(s: Record<string, any>): void {
    if (Array.isArray(s.news)) this.news = s.news;
  }
}

export const uiSystem = UISystem.getInstance();
