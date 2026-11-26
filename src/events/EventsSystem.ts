/* ============================================================
   events/EventsSystem.ts — случайные события (Этап 4)
   Динамическая генерация событий на базе экономики, политики и дипломатии.
   ============================================================ */
import { IGameSystem } from '../core/GameLoop.js';
import { eventBus, GameEvents } from '../core/EventBus.js';
import { countrySystem } from '../country/CountrySystem.js';
import { gameTime } from '../core/GameTime.js';

export interface EventOption {
  id: string;
  text: string;
  effects: Record<string, number>;
}

export interface RandomEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  cause: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  countryCode?: string;
  country?: string;
  resolved?: boolean;
  chosenOptionId?: string;
  options: EventOption[];
  chainNext?: string[];
}

export class EventsSystem implements IGameSystem {
  readonly name = 'Events';
  readonly priority = 80;

  private events: RandomEvent[] = [];
  private dayCount = 0;
  private seq = 10;
  private unsubscribeTick: (() => void) | null = null;

  static instance: EventsSystem;
  static getInstance(): EventsSystem {
    if (!EventsSystem.instance) EventsSystem.instance = new EventsSystem();
    return EventsSystem.instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    this._seedDemoEvents();
    this.unsubscribeTick = eventBus.on(GameEvents.TIME_TICK, () => {
      this.dayCount++;
      if (this.dayCount % 12 === 0) {
        this._generateDynamicEvent();
      }
    }).unsubscribe;
    console.log('[EventsSystem] инициализировано');
  }

  update(dt: number): void {
    void dt;
  }

  shutdown(): void {
    this.unsubscribeTick?.();
    this.unsubscribeTick = null;
  }

  private _seedDemoEvents(): void {
    const now = gameTime.formatDate('long');
    const player = countrySystem.getPlayer();
    this.events.push({
      id: 'evt_millennium_001',
      title: 'Вызовы XXI века',
      description: 'Начало нового тысячелетия ставит перед правительством выбор стратегического курса развития на ближайшие годы.',
      date: now,
      cause: 'Начало кампании (1 января 2000)',
      importance: 'medium',
      countryCode: player?.code ?? 'USA',
      country: player?.nameRu ?? 'США',
      options: [
        { id: 'opt1', text: 'Инвестировать в экономику и технологии', effects: { gdp: 0.02, money: -20, stability: 0.02 } },
        { id: 'opt2', text: 'Укрепить обороноспособность', effects: { militaryBudget: 5, money: -15, stability: 0.01 } },
        { id: 'opt3', text: 'Социальные программы и поддержка населения', effects: { publicOpinion: 0.06, stability: 0.04, money: -18 } }
      ]
    });
  }

  private _generateDynamicEvent(): void {
    const player = countrySystem.getPlayer();
    if (!player) return;

    // 45% шанс события для игрока, 55% для случайной страны мира
    const target = Math.random() < 0.45
      ? player
      : countrySystem.getAll()[Math.floor(Math.random() * countrySystem.getAll().length)];
    if (!target) return;

    const now = gameTime.formatDate('long');
    const id = `evt_dyn_${++this.seq}`;

    let ev: RandomEvent;
    if (target.stability < 0.45) {
      ev = {
        id,
        title: 'Правительственный кризис',
        description: `В стране ${target.nameRu} обострились противоречия в парламенте. Оппозиция требует немедленной отставки кабинета.`,
        date: now,
        cause: 'Низкая политическая стабильность',
        importance: 'high',
        countryCode: target.code,
        country: target.nameRu,
        options: [
          { id: 'opt1', text: 'Пойти на переговоры и уступки', effects: { stability: 0.06, money: -12 } },
          { id: 'opt2', text: 'Провести перестановки в правительстве', effects: { stability: 0.08, publicOpinion: -0.04 } },
          { id: 'opt3', text: 'Отклонить требования оппозиции', effects: { stability: -0.08, publicOpinion: 0.03 } }
        ]
      };
    } else if (target.inflation > 0.08) {
      ev = {
        id,
        title: 'Валютно-инфляционный скачок',
        description: `Рост цен в ${target.nameRu} достиг ${(target.inflation * 100).toFixed(1)}%. Бизнес и граждане требуют антикризисных мер.`,
        date: now,
        cause: 'Высокая инфляция',
        importance: 'medium',
        countryCode: target.code,
        country: target.nameRu,
        options: [
          { id: 'opt1', text: 'Урезать госрасходы и сдержать инфляцию', effects: { inflation: -0.025, publicOpinion: -0.04, money: 10 } },
          { id: 'opt2', text: 'Субсидировать ключевые отрасли', effects: { money: -20, gdp: 0.015, stability: 0.03 } }
        ]
      };
    } else if (Math.random() < 0.5) {
      ev = {
        id,
        title: 'Открытие ресурсного месторождения',
        description: `Геологи в ${target.nameRu} подтвердили крупные запасы сырья, что открывает новые возможности для экспорта.`,
        date: now,
        cause: 'Геологоразведка',
        importance: 'medium',
        countryCode: target.code,
        country: target.nameRu,
        options: [
          { id: 'opt1', text: 'Государственная разработка', effects: { gdp: 0.02, money: 25 } },
          { id: 'opt2', text: 'Привлечь иностранных инвесторов', effects: { gdp: 0.03, money: 15, corruption: 0.02 } }
        ]
      };
    } else {
      ev = {
        id,
        title: 'Военные учения на границе',
        description: `Вооружённые силы (${target.nameRu}) провели масштабные учения, продемонстрировав готовность к развёртыванию.`,
        date: now,
        cause: 'Плановая боевая подготовка',
        importance: 'low',
        countryCode: target.code,
        country: target.nameRu,
        options: [
          { id: 'opt1', text: 'Увеличить финансирование учений', effects: { money: -8, stability: 0.02 } },
          { id: 'opt2', text: 'Ограничиться стандартным отчётом', effects: { publicOpinion: 0.01 } }
        ]
      };
    }

    if (target.code !== player.code) {
      // ИИ автоматически выбирает первый вариант, а игрок видит это в новостях
      this.events.unshift(ev);
      this.chooseOption(ev.id, ev.options[0]!.id);
      eventBus.emit(GameEvents.NOTIFICATION_ADD, {
        country: target.nameRu,
        text: `${ev.title}: ${ev.cause}`,
        date: now
      });
    } else {
      this.triggerEvent(ev);
    }
  }

  triggerEvent(event: RandomEvent): void {
    this.events.unshift(event);
    if (this.events.length > 50) this.events.pop();
    eventBus.emit(GameEvents.RANDOM_EVENT_TRIGGERED, { event });
  }

  chooseOption(eventId: string, optionId: string): boolean {
    const ev = this.events.find((e) => e.id === eventId);
    if (!ev || ev.resolved) return false;
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) return false;

    ev.resolved = true;
    ev.chosenOptionId = optionId;

    const c = ev.countryCode ? countrySystem.getCountry(ev.countryCode) : undefined;
    if (c) {
      if (opt.effects.stability) c.changeStability(opt.effects.stability, `событие: ${ev.title}`);
      if (opt.effects.money) c.changeMoney(opt.effects.money, `событие: ${ev.title}`);
      if (opt.effects.publicOpinion) c.publicOpinion = Math.min(1, Math.max(0, c.publicOpinion + opt.effects.publicOpinion));
      if (opt.effects.gdp) c.gdp *= (1 + opt.effects.gdp);
      if (opt.effects.inflation) c.inflation = Math.max(-0.02, c.inflation + opt.effects.inflation);
      if (opt.effects.corruption) c.corruption = Math.min(1, Math.max(0.02, c.corruption + opt.effects.corruption));
      if (opt.effects.militaryBudget) c.militaryBudget += opt.effects.militaryBudget;
    }

    eventBus.emit(GameEvents.EVENT_OPTION_CHOSEN, { eventId, optionId, countryCode: ev.countryCode });
    eventBus.emit(GameEvents.COUNTRY_DATA_CHANGED, { country: ev.countryCode });
    return true;
  }

  getEvents(): RandomEvent[] {
    return this.events;
  }

  getState(): Record<string, any> {
    return { events: this.events, dayCount: this.dayCount, seq: this.seq };
  }
  setState(s: Record<string, any>): void {
    if (Array.isArray(s.events)) this.events = s.events;
    if (typeof s.dayCount === 'number') this.dayCount = s.dayCount;
    if (typeof s.seq === 'number') this.seq = s.seq;
  }
}

export const eventsSystem = EventsSystem.getInstance();
