import { eventBus, GameEvents } from './EventBus.js';

export type GameSpeed = 0 | 1 | 2 | 4 | 8;

export interface DateTime {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export class GameTime {
  private static instance: GameTime;
  private _date: DateTime = { year: 2000, month: 1, day: 1, hour: 0 };
  private _speed: GameSpeed = 1;
  private _paused: boolean = false;
  private _baseMsPerDay: number = 1000; // 1 day = 1 second at speed 1
  private _accumulator: number = 0;
  private _lastTimestamp: number = 0;
  private _running: boolean = false;

  private constructor() {}

  static getInstance(): GameTime {
    if (!GameTime.instance) {
      GameTime.instance = new GameTime();
    }
    return GameTime.instance;
  }

  get date(): Readonly<DateTime> { return this._date; }
  get speed(): GameSpeed { return this._speed; }
  get paused(): boolean { return this._paused; }
  get isRunning(): boolean { return this._running; }

  setSpeed(speed: GameSpeed): void {
    if (speed !== this._speed) {
      this._speed = speed;
      eventBus.emit(GameEvents.TIME_SPEED_CHANGED, { speed });
    }
  }

  togglePause(): void {
    this._paused = !this._paused;
    eventBus.emit(this._paused ? GameEvents.TIME_PAUSED : GameEvents.TIME_RESUMED, {});
  }

  pause(): void {
    if (!this._paused) {
      this._paused = true;
      eventBus.emit(GameEvents.TIME_PAUSED, {});
    }
  }

  resume(): void {
    if (this._paused) {
      this._paused = false;
      eventBus.emit(GameEvents.TIME_RESUMED, {});
    }
  }

  start(): void {
    if (!this._running) {
      this._running = true;
      this._lastTimestamp = performance.now();
      requestAnimationFrame(this.tick.bind(this));
    }
  }

  stop(): void {
    this._running = false;
  }

  private tick(timestamp: number): void {
    if (!this._running) return;

    const deltaMs = timestamp - this._lastTimestamp;
    this._lastTimestamp = timestamp;

    if (!this._paused && this._speed > 0) {
      this._accumulator += deltaMs * this._speed;
      const msPerDay = this._baseMsPerDay;

      while (this._accumulator >= msPerDay) {
        this._accumulator -= msPerDay;
        this.advanceDay();
      }
    }

    requestAnimationFrame(this.tick.bind(this));
  }

  private advanceDay(): void {
    const dim = this.getDaysInMonth(this._date.year, this._date.month);
    this._date.day++;

    if (this._date.day > dim) {
      this._date.day = 1;
      this._date.month++;
      if (this._date.month > 12) {
        this._date.month = 1;
        this._date.year++;
      }
    }

    eventBus.emit(GameEvents.TIME_TICK, { date: { ...this._date } });
  }

  private getDaysInMonth(year: number, month: number): number {
    if (month === 2) {
      return this.isLeapYear(year) ? 29 : 28;
    }
    return DAYS_IN_MONTH[month - 1]!;
  }

  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  formatDate(format: 'short' | 'long' | 'iso' = 'short'): string {
    const { year, month, day } = this._date;
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');

    switch (format) {
      case 'long': return `${day} ${this.getMonthName(month)} ${year}`;
      case 'iso': return `${year}-${m}-${d}`;
      default: return `${d}.${m}.${year}`;
    }
  }

  private getMonthName(month: number): string {
    const names = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня',
                   'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
    return names[month - 1]!;
  }

  setDate(date: Partial<DateTime>): void {
    this._date = { ...this._date, ...date };
    eventBus.emit(GameEvents.TIME_TICK, { date: { ...this._date } });
  }

  getDaysSinceStart(): number {
    let days = 0;
    for (let y = 2000; y < this._date.year; y++) {
      days += this.isLeapYear(y) ? 366 : 365;
    }
    for (let m = 1; m < this._date.month; m++) {
      days += this.getDaysInMonth(this._date.year, m);
    }
    days += this._date.day - 1;
    return days;
  }
}

export const gameTime = GameTime.getInstance();