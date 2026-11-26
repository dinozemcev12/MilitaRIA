/**
 * EventBus — ширина событий игры.
 * Позволяет модулям общаться слабо связанно (publish/subscribe).
 */
class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    on(event, callback) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const set = this._listeners.get(event);
        if (set) set.delete(callback);
    }

    emit(event, data) {
        const set = this._listeners.get(event);
        if (!set) return;
        set.forEach(cb => {
            try { cb(data); } catch (e) { console.error(`EventBus error in "${event}":`, e); }
        });
    }

    once(event, callback) {
        const unsubscribe = this.on(event, (data) => {
            unsubscribe();
            callback(data);
        });
        return unsubscribe;
    }

    clear() { this._listeners.clear(); }
}

const eventBus = new EventBus();
export { eventBus, EventBus };
