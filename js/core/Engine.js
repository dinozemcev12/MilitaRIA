/**
 * Engine.js — игровой движок MilitaRIA.
 * Единая точка входа, управление временем, системой событий, сохранением.
 */
class Engine {
    constructor() {
        this.systems = new Map();
        this.running = false;
        this.paused = true;
        this.speed = 1; // 1 день = 1000ms на скорости 1
        this.lastTick = 0;
        this.accumulator = 0;
        this.fixedTimestep = 1000 / 60; // 60 Hz для физики/тактики
    }

    registerSystem(name, system) {
        system.engine = this;
        system.init?.();
        this.systems.set(name, system);
        return system;
    }

    getSystem(name) {
        return this.systems.get(name);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.paused = false;
        this.lastTick = performance.now();
        requestAnimationFrame(this.loop.bind(this));
        console.log('[Engine] Started');
    }

    stop() {
        this.running = false;
    }

    setSpeed(mult) {
        this.speed = Math.max(0, Math.min(8, mult));
        this.paused = this.speed === 0;
        this.emit('speedChanged', { speed: this.speed, paused: this.paused });
    }

    togglePause() {
        this.setSpeed(this.paused ? 1 : 0);
    }

    loop(now) {
        if (!this.running) return;
        
        const dt = now - this.lastTick;
        this.lastTick = now;

        if (!this.paused) {
            this.accumulator += dt * this.speed;
            
            // Игровой день (1000ms базовое время)
            const dayMs = 1000;
            while (this.accumulator >= dayMs) {
                this.accumulator -= dayMs;
                this.advanceDay();
            }

            // Фиксированный тик для систем (физика, ИИ, тактика)
            while (this.accumulator >= this.fixedTimestep) {
                this.accumulator -= this.fixedTimestep;
                this.fixedTick(this.fixedTimestep);
            }
        }

        this.render(dt);
        requestAnimationFrame(this.loop.bind(this));
    }

    advanceDay() {
        this.emit('dayAdvanced', { date: this.date });
        this.systems.forEach(s => s.onDayAdvanced?.(this.date));
    }

    fixedTick(dt) {
        this.systems.forEach(s => s.fixedUpdate?.(dt));
    }

    render(dt) {
        this.systems.forEach(s => s.render?.(dt));
    }

    // Event system
    emit(event, data) {
        const handlers = this._events?.[event];
        if (handlers) handlers.forEach(h => h(data));
    }

    on(event, handler) {
        this._events = this._events || {};
        this._events[event] = this._events[event] || [];
        this._events[event].push(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        const arr = this._events?.[event];
        if (arr) arr.splice(arr.indexOf(handler), 1);
    }

    // Save/Load
    save() {
        const data = {
            date: this.date.toISOString(),
            speed: this.speed,
            paused: this.paused,
            systems: {}
        };
        this.systems.forEach((sys, name) => {
            if (sys.serialize) data.systems[name] = sys.serialize();
        });
        localStorage.setItem('militaria_save', JSON.stringify(data));
        console.log('[Engine] Game saved');
    }

    load() {
        const raw = localStorage.getItem('militaria_save');
        if (!raw) return false;
        const data = JSON.parse(raw);
        this.date = new Date(data.date);
        this.setSpeed(data.speed);
        this.paused = data.paused;
        Object.entries(data.systems).forEach(([name, state]) => {
            const sys = this.systems.get(name);
            if (sys?.deserialize) sys.deserialize(state);
        });
        this.emit('loaded', data);
        console.log('[Engine] Game loaded');
        return true;
    }
}

window.Engine = Engine;