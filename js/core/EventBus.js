/**
 * EventBus — шина событий игры (pub/sub).
 */
var EventBus = (function() {
    function EventBus() {
        this._listeners = new Map();
    }
    EventBus.prototype.on = function(event, callback) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(callback);
        var self = this;
        return function() { self.off(event, callback); };
    };
    EventBus.prototype.off = function(event, callback) {
        var set = this._listeners.get(event);
        if (set) set.delete(callback);
    };
    EventBus.prototype.emit = function(event, data) {
        var set = this._listeners.get(event);
        if (!set) return;
        set.forEach(function(cb) {
            try { cb(data); } catch (e) { console.error('EventBus error in "' + event + '":', e); }
        });
    };
    EventBus.prototype.once = function(event, callback) {
        var self = this;
        var unsubscribe = this.on(event, function(data) {
            unsubscribe();
            callback(data);
        });
        return unsubscribe;
    };
    EventBus.prototype.clear = function() { this._listeners.clear(); };
    return EventBus;
})();

var eventBus = new EventBus();
