import { eventBus, GameEvents } from './EventBus.js';
import { gameTime } from './GameTime.js';

export interface IGameSystem {
  name: string;
  priority: number;
  init(): Promise<void> | void;
  update(deltaTime: number): void;
  shutdown(): void;
}

export class GameLoop {
  private static instance: GameLoop;
  private systems: IGameSystem[] = [];
  private _running: boolean = false;
  private _lastFrameTime: number = 0;

  private constructor() {}

  static getInstance(): GameLoop {
    if (!GameLoop.instance) {
      GameLoop.instance = new GameLoop();
    }
    return GameLoop.instance;
  }

  registerSystem(system: IGameSystem): void {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
  }

  unregisterSystem(name: string): void {
    this.systems = this.systems.filter(s => s.name !== name);
  }

  async init(): Promise<void> {
    for (const system of this.systems) {
      try {
        await system.init();
        console.log(`[GameLoop] Initialized: ${system.name}`);
      } catch (error) {
        console.error(`[GameLoop] Failed to initialize ${system.name}:`, error);
      }
    }
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._lastFrameTime = performance.now();
    gameTime.start();
    requestAnimationFrame(this.frame.bind(this));
  }

  stop(): void {
    this._running = false;
    gameTime.stop();
  }

  private frame(timestamp: number): void {
    if (!this._running) return;

    const deltaTime = (timestamp - this._lastFrameTime) / 1000;
    this._lastFrameTime = timestamp;

    for (const system of this.systems) {
      try {
        system.update(deltaTime);
      } catch (error) {
        console.error(`[GameLoop] Error in ${system.name}:`, error);
      }
    }

    requestAnimationFrame(this.frame.bind(this));
  }

  shutdown(): void {
    this.stop();
    for (const system of this.systems) {
      try {
        system.shutdown();
      } catch (error) {
        console.error(`[GameLoop] Error shutting down ${system.name}:`, error);
      }
    }
    this.systems = [];
    eventBus.clear();
  }
}

export const gameLoop = GameLoop.getInstance();