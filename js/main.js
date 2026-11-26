/**
 * main.js — точка входа MilitaRIA (ETAП 1).
 * Собирает модули, инициализирует состояние, запускает игровой цикл.
 */
import { eventBus } from './core/EventBus.js';
import { state } from './core/State.js';
import { Country } from './countries/Country.js';
import { COUNTRIES_DATA } from './data/countries.js';
import { Map } from './map/Map.js';
import { UI } from './ui/UI.js';

// Экспонируем глобально для модулей (пока без сборщика)
window.stateModule = state;

// --- Инициализация государств ---
COUNTRIES_DATA.forEach(data => {
    const country = new Country(data);
    state.countries.set(data.tag, country);
});

// Базовые дипломатические отношения (нейтрально по умолчанию)
const relationPresets = [
    ['USA', 'GBR', 75], ['USA', 'FRA', 70], ['USA', 'DEU', 70],
    ['USA', 'POL', 60], ['USA', 'JPN', 65], ['USA', 'KOR', 70],
    ['RUS', 'UKR', 40], ['RUS', 'PRK', 60],
    ['CHN', 'PRK', 70], ['CHN', 'PAK', 65],
    ['IND', 'PAK', -50], ['IND', 'CHN', -30],
    ['IRN', 'IRQ', 20], ['IRN', 'ISR', -70],
    ['ISR', 'SAU', -40], ['IND', 'USA', 45],
];
relationPresets.forEach(([a, b, v]) => {
    const ca = state.countries.get(a);
    const cb = state.countries.get(b);
    if (ca && cb) {
        ca.setRelation(b, v);
        cb.setRelation(a, v);
    }
});

// --- Модули ---
const gameMap = new Map('map-canvas-container');
const ui = new UI();

// Скорость времени
const speedBtns = document.querySelectorAll('.speed-btn');
speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const speed = parseInt(btn.dataset.speed, 10);
        state.setSpeed(speed);
        ui.setSpeedButtons(speed);
    });
});

// Пауза по пробелу
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        state.togglePause();
        ui.setSpeedButtons(state.speed);
    }
});

// Клик по провинции -> выбор страны
window.addEventListener('map:provinceClicked', (e) => {
    const tag = e.detail.tag;
    if (state.countries.has(tag)) {
        state.setPlayerCountry(tag);
        ui.update(state);
        gameMap.centerOn(tag);
    }
});

// Игровой цикл
let lastTime = 0;

function loop(now) {
    if (!lastTime) lastTime = now;
    const dt = now - lastTime;

    if (!state.paused && state.speed > 0) {
        state.dayTicks += dt;
        const dayMs = 1200 / state.speed; // ms за один игровой день
        if (state.dayTicks >= dayMs) {
            state.dayTicks = 0;
            state.date.setDate(state.date.getDate() + 1);
            ui.update(state);
        }
    }

    lastTime = now;
    requestAnimationFrame(loop);
}

// Старт
state.addLog('Инициализация завершена. Игра готова.');
ui.update(state);
ui.setSpeedButtons(state.speed);
requestAnimationFrame(loop);
