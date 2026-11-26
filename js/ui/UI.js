/**
 * UI.js — управление интерфейсом (Этап 1).
 */
var UI = (function() {
    function UI() {
        this.elements = {
            date: document.getElementById('game-date'),
            playerCountry: document.getElementById('player-country'),
            playerName: document.querySelector('#player-country .country-name'),
            stability: document.getElementById('val-stability'),
            gdp: document.getElementById('val-gdp'),
            pop: document.getElementById('val-pop'),
            milBudget: document.getElementById('val-milbudget'),
            speed: document.getElementById('bottom-game-speed'),
            newsList: document.getElementById('news-list'),
            eventLog: document.getElementById('event-log'),
            countryCard: document.getElementById('country-info-card'),
            cardName: document.getElementById('card-country-name'),
            cardCapital: document.getElementById('card-capital'),
            cardPop: document.getElementById('card-pop'),
            cardGdp: document.getElementById('card-gdp'),
            cardStab: document.getElementById('card-stab')
        };

        this._bindNav();
        this._bindBottomButtons();
        this._bindCountryPicker();
    }

    UI.prototype._bindNav = function() {
        var self = this;
        document.querySelectorAll('.nav-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                var module = btn.dataset.module;
                window.dispatchEvent(new CustomEvent('ui:moduleSelected', { detail: { module: module } }));
            });
        });
    };

    UI.prototype._bindBottomButtons = function() {
        var self = this;
        var btnSave = document.getElementById('btn-save');
        var btnLoad = document.getElementById('btn-load');
        var btnMenu = document.getElementById('btn-menu');

        btnSave.addEventListener('click', function() { window.dispatchEvent(new CustomEvent('ui:save')); });
        btnLoad.addEventListener('click', function() { window.dispatchEvent(new CustomEvent('ui:load')); });
        btnMenu.addEventListener('click', function() { window.dispatchEvent(new CustomEvent('ui:menu')); });

        document.getElementById('player-country').addEventListener('click', function() {
            window.dispatchEvent(new CustomEvent('ui:openCountryPicker'));
        });
    };

    UI.prototype._bindCountryPicker = function() {
        var picker = document.getElementById('country-picker');
        var close = document.getElementById('btn-pick-close');
        var list = document.getElementById('country-list');
        var self = this;

        close.addEventListener('click', function() { picker.classList.add('hidden'); });

        window.addEventListener('ui:openCountryPicker', function() {
            list.innerHTML = '';
            state.countries.forEach(function(c) {
                var row = document.createElement('div');
                row.className = 'country-row';
                row.innerHTML = '<div class="flag" style="background:' + c.color + '"></div><span>' + c.name + '</span> <span style="color:#6b7280;font-size:10px">(' + c.tag + ')</span>';
                row.addEventListener('click', function() {
                    state.setPlayerCountry(c.tag);
                    self.update();
                    picker.classList.add('hidden');
                });
                list.appendChild(row);
            });
            picker.classList.remove('hidden');
        });
    };

    UI.prototype._set = function(el, text) {
        if (el) el.textContent = text;
    };

    UI.prototype.update = function(state) {
        this._set(this.elements.date, state.getDateString());

        var player = state.getPlayerCountry();
        if (player) {
            this._set(this.elements.playerName, player.name);
            this._set(this.elements.stability, player.getModifiedStability() + '%');
            this._set(this.elements.gdp, player.getModifiedGDP() + ' млрд');
            this._set(this.elements.pop, player.population.toLocaleString() + ' чел.');
            this._set(this.elements.milBudget, player.militaryBudget + ' млрд');

            this._set(this.elements.cardName, player.name);
            this._set(this.elements.cardCapital, player.capital);
            this._set(this.elements.cardPop, player.population.toLocaleString() + ' чел.');
            this._set(this.elements.cardGdp, player.getModifiedGDP() + ' млрд');
            this._set(this.elements.cardStab, player.getModifiedStability() + '%');
            this._set(this.elements.cardTax, player.taxRate + '%');
            this._set(this.elements.cardInfl, player.inflation.toFixed(1) + '%');
            this._set(this.elements.cardUnemp, player.unemployment.toFixed(1) + '%');
            this._set(this.elements.cardTreasury, player.treasury + ' млрд');
            this._set(this.elements.cardDebt, player.debt + ' млрд');

            if (this.elements.countryCard) this.elements.countryCard.style.display = 'block';
        }

        this._set(this.elements.speed, state.getSpeedLabel());

        this._renderNews(state.news);
        this._renderLog(state.eventLog);
    };

    UI.prototype.updateModule = function(moduleName, state) {
        var player = state.getPlayerCountry();
        if (!player) return;
        var log = this.elements.eventLog;
        var entry = '';

        if (moduleName === 'economy') {
            entry = 'ЭКОНОМИКА ' + player.name + ': ВВП ' + player.getModifiedGDP().toFixed(0) +
                ' млрд | Налоги ' + player.taxRate + '% | Казна ' + player.treasury.toFixed(0) +
                ' млрд | Долг ' + player.debt.toFixed(0) + ' млрд | Инфляция ' +
                player.inflation.toFixed(1) + '% | Безработица ' + player.unemployment.toFixed(1) + '%';
        } else if (moduleName === 'politics') {
            var gov = player.government || 'Республика';
            var stab = player.getModifiedStability();
            entry = 'ПОЛИТИКА ' + player.name + ': ' + gov + ' | Стабильность ' + stab +
                '% | Коррупция ' + player.corruption + '% | Избиратели в ' + player.electionYear;
        }

        if (entry && log) {
            log.textContent = entry + '\n' + (log.textContent || '').split('\n').slice(0, 7).join('\n');
        }
    };

    UI.prototype._renderNews = function(news) {
        var list = this.elements.newsList;
        list.innerHTML = '';
        news.slice(0, 10).forEach(function(n) {
            var el = document.createElement('div');
            el.className = 'news-item';
            el.innerHTML = '<div class="news-time">' + (n.date || '') + '</div><div class="news-title">' + n.title + '</div><div class="news-text">' + n.text + '</div>';
            list.appendChild(el);
        });
    };

    UI.prototype._renderLog = function(log) {
        this.elements.eventLog.textContent = log.slice(0, 8).join('\n');
    };

    UI.prototype.setSpeedButtons = function(activeSpeed) {
        document.querySelectorAll('.speed-btn').forEach(function(btn) {
            btn.classList.toggle('active', parseInt(btn.dataset.speed) === activeSpeed);
        });
    };

    return UI;
})();
