/**
 * State — единственный источник истины состояния игры.
 * Хранит время, игрока, страны, провинции, флаг паузы и скорость.
 */
class State {
    constructor() {
        this.date = new Date(2000, 0, 1); // 1 января 2000
        this.speed = 0; // 0=пауза, 1,2,4,8
        this.paused = true;
        this.playerCountryTag = 'USA';
        this.dayTicks = 0; // такты внутри дня

        this.countries = new Map();      // tag -> Country
        this.provinces = new Map();      // id -> Province
        this.relations = new Map();      // "TAG1-TAG2" -> Relation
        this.news = [];                  // массив новостей
        this.eventLog = [];              // журнал событий
        this.units = new Map();          // id -> Unit (стратегические)
        this.modifiers = new Map();      // глобальные модификаторы

        this.initialized = false;
    }

    getDateString() {
        const d = this.date;
        const months = ['января','февраля','марта','апреля','мая','июня',
            'июля','августа','сентября','октября','ноября','декабря'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }

    getSpeedLabel() {
        if (this.paused || this.speed === 0) return 'Пауза';
        return `x${this.speed}`;
    }

    setSpeed(speed) {
        this.speed = speed;
        this.paused = speed === 0;
        eventBus.emit('game:speedChanged', { speed: this.speed, paused: this.paused });
    }

    togglePause() {
        this.setSpeed(this.paused ? 1 : 0);
    }

    addNews(item) {
        this.news.unshift({ ...item, id: Date.now() + Math.random(), read: false });
        if (this.news.length > 200) this.news.length = 200;
        eventBus.emit('ui:newsAdded', item);
    }

    addLog(msg) {
        const entry = `[${this.getDateString()}] ${msg}`;
        this.eventLog.unshift(entry);
        if (this.eventLog.length > 100) this.eventLog.length = 100;
        eventBus.emit('ui:logAdded', entry);
    }

    getCountry(tag) { return this.countries.get(tag); }
    getPlayerCountry() { return this.countries.get(this.playerCountryTag); }
    setPlayerCountry(tag) {
        this.playerCountryTag = tag;
        eventBus.emit('game:playerChanged', { tag });
    }
}

const state = new State();
export { state, State };
