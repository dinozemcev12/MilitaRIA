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

    UI.prototype.update = function(state) {
        this.elements.date.textContent = state.getDateString();

        var player = state.getPlayerCountry();
        if (player) {
            this.elements.playerName.textContent = player.name;
            this.elements.stability.textContent = state.getPlayerCountry().getModifiedStability() + '%';
            this.elements.gdp.textContent = player.getModifiedGDP() + ' млрд';
            this.elements.pop.textContent = player.population.toLocaleString() + ' чел.';
            this.elements.milBudget.textContent = player.militaryBudget + ' млрд';

            this.elements.cardName.textContent = player.name;
            this.elements.cardCapital.textContent = player.capital;
            this.elements.cardPop.textContent = player.population.toLocaleString() + ' чел.';
            this.elements.cardGdp.textContent = player.getModifiedGDP() + ' млрд';
            this.elements.cardStab.textContent = player.getModifiedStability() + '%';
            this.elements.countryCard.style.display = 'block';
        }

        this.elements.speed.textContent = state.getSpeedLabel();

        this._renderNews(state.news);
        this._renderLog(state.eventLog);
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
