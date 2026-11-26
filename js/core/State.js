/**
 * State — единственный источник истины состояния игры.
 */
var State = (function() {
    function State() {
        this.date = new Date(2000, 0, 1);
        this.speed = 0;
        this.paused = true;
        this.playerCountryTag = 'USA';
        this.dayTicks = 0;

        this.countries = new Map();
        this.provinces = new Map();
        this.relations = new Map();
        this.news = [];
        this.eventLog = [];
        this.units = new Map();
        this.modifiers = new Map();

        this.initialized = false;
    }
    State.prototype.getDateString = function() {
        var d = this.date;
        var months = ['января','февраля','марта','апреля','мая','июня',
            'июля','августа','сентября','октября','ноября','декабря'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    };
    State.prototype.getSpeedLabel = function() {
        if (this.paused || this.speed === 0) return 'Пауза';
        return 'x' + this.speed;
    };
    State.prototype.setSpeed = function(speed) {
        this.speed = speed;
        this.paused = speed === 0;
        eventBus.emit('game:speedChanged', { speed: this.speed, paused: this.paused });
    };
    State.prototype.togglePause = function() {
        this.setSpeed(this.paused ? 1 : 0);
    };
    State.prototype.addNews = function(item) {
        this.news.unshift(Object.assign({ id: Date.now() + Math.random(), read: false }, item));
        if (this.news.length > 200) this.news.length = 200;
        eventBus.emit('ui:newsAdded', item);
    };
    State.prototype.addLog = function(msg) {
        var entry = '[' + this.getDateString() + '] ' + msg;
        this.eventLog.unshift(entry);
        if (this.eventLog.length > 100) this.eventLog.length = 100;
        eventBus.emit('ui:logAdded', entry);
    };
    State.prototype.getCountry = function(tag) { return this.countries.get(tag); };
    State.prototype.getPlayerCountry = function() { return this.countries.get(this.playerCountryTag); };
    State.prototype.setPlayerCountry = function(tag) {
        this.playerCountryTag = tag;
        eventBus.emit('game:playerChanged', { tag: tag });
    };
    return State;
})();

var state = new State();
