/**
 * main.js — точка входа MilitaRIA (Этап 2).
 * Собирает модули, инициализирует состояние, запускает игровой цикл.
 * Экономика и политика считаются каждый игровой день для игрока.
 */
(function() {
    // Экспонируем глобально для модулей
    window.stateModule = state;

    // --- Инициализация государств ---
    COUNTRIES_DATA.forEach(function(data) {
        var country = new Country(data);
        state.countries.set(data.tag, country);
    });

    // Базовые дипломатические отношения
    var relationPresets = [
        ['USA', 'GBR', 75], ['USA', 'FRA', 70], ['USA', 'DEU', 70],
        ['USA', 'POL', 60], ['USA', 'JPN', 65], ['USA', 'KOR', 70],
        ['RUS', 'UKR', 40], ['RUS', 'PRK', 60],
        ['CHN', 'PRK', 70], ['CHN', 'PAK', 65],
        ['IND', 'PAK', -50], ['IND', 'CHN', -30],
        ['IRN', 'IRQ', 20], ['IRN', 'ISR', -70],
        ['ISR', 'SAU', -40], ['IND', 'USA', 45]
    ];
    relationPresets.forEach(function(rel) {
        var ca = state.countries.get(rel[0]);
        var cb = state.countries.get(rel[1]);
        if (ca && cb) {
            ca.setRelation(rel[1], rel[2]);
            cb.setRelation(rel[0], rel[2]);
        }
    });

    // --- Модули ---
    var gameMap = new GameMap('map-canvas-container');
    var ui = new UI();
    var economy = new Economy();
    var politics = new Politics();

    // Скорость времени
    var speedBtns = document.querySelectorAll('.speed-btn');
    speedBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var speed = parseInt(btn.dataset.speed, 10);
            state.setSpeed(speed);
            ui.setSpeedButtons(speed);
        });
    });

    // Пауза по пробелу
    window.addEventListener('keydown', function(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            state.togglePause();
            ui.setSpeedButtons(state.speed);
        }
    });

    // Клик по провинции -> выбор страны
    window.addEventListener('map:provinceClicked', function(e) {
        var tag = e.detail.tag;
        if (state.countries.has(tag)) {
            state.setPlayerCountry(tag);
            ui.update(state);
            gameMap.centerOn(tag);
        }
    });

    // Смена модуля в левой панели
    window.addEventListener('ui:moduleSelected', function(e) {
        ui.updateModule(e.detail.module, state);
    });

    // Сохранить / загрузить / меню (заглушки Этапа 2)
    window.addEventListener('ui:save', function() {
        state.addLog('Сохранение: функция будет реализована на Этапе 8.');
    });
    window.addEventListener('ui:load', function() {
        state.addLog('Загрузка: функция будет реализована на Этапе 8.');
    });
    window.addEventListener('ui:menu', function() {
        state.addLog('Открыто главное меню.');
    });

    // Игровой цикл
    var lastTime = 0;

    function loop(now) {
        if (!lastTime) lastTime = now;
        var dt = now - lastTime;

        if (!state.paused && state.speed > 0) {
            state.dayTicks += dt;
            var dayMs = 1200 / state.speed;
            if (state.dayTicks >= dayMs) {
                state.dayTicks = 0;
                state.date.setDate(state.date.getDate() + 1);

                // === ЭКОНОМИКА: расчёт каждый день для игрока ===
                var player = state.getPlayerCountry();
                if (player) {
                    economy.calculate(player);

                    // === ПОЛИТИКА: выборы раз в 4 года (1 января) ===
                    if (state.date.getDate() === 1 && state.date.getMonth() === 0) {
                        politics.checkElection(player, state.date.getFullYear());
                    }
                }

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

    // Скрыть экран загрузки, показать игру
    var loading = document.getElementById('loading-overlay');
    var container = document.getElementById('game-container');
    if (loading) loading.style.display = 'none';
    if (container) container.classList.remove('hidden');

    requestAnimationFrame(loop);
})();
