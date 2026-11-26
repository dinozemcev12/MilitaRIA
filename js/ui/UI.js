/**
 * UI.js — управление интерфейсом (Этап 3, улучшенный).
 * Отображение верхней панели, карточки страны, модулей слева, новостей, лога.
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
            cardStab: document.getElementById('card-stab'),
            cardTax: document.getElementById('card-tax'),
            cardInfl: document.getElementById('card-infl'),
            cardUnemp: document.getElementById('card-unemp'),
            cardTreasury: document.getElementById('card-treasury'),
            cardDebt: document.getElementById('card-debt'),
            moduleContent: document.getElementById('module-content')
        };

        this._bindNav();
        this._bindBottomButtons();
        this._bindCountryPicker();
        this.currentModule = 'politics';
    }

    UI.prototype._set = function(el, text) {
        if (el) el.textContent = text;
    };

    UI.prototype._bindNav = function() {
        var self = this;
        document.querySelectorAll('.nav-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                var module = btn.dataset.module;
                self.currentModule = module;
                window.dispatchEvent(new CustomEvent('ui:moduleSelected', { detail: { module: module } }));
                self.updateModule(module, window.stateModule);
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
            var countries = Array.from(state.countries.values()).sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
            countries.forEach(function(c) {
                var row = document.createElement('div');
                row.className = 'country-row';
                row.innerHTML = '<div class="flag" style="background:' + c.color + '"></div><span>' + c.name +
                    '</span> <span style="color:#6b7280;font-size:10px">(' + c.tag + ')</span>';
                row.addEventListener('click', function() {
                    state.setPlayerCountry(c.tag);
                    self.update(state);
                    self.updateModule(self.currentModule, state);
                    picker.classList.add('hidden');
                });
                list.appendChild(row);
            });
            picker.classList.remove('hidden');
        });
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
        var contentEl = this.elements.moduleContent;
        var html = '';

        if (moduleName === 'economy') {
            entry = 'ЭКОНОМИКА ' + player.name + ': ВВП ' + player.getModifiedGDP().toFixed(0) +
                ' млрд | Налоги ' + player.taxRate + '% | Казна ' + player.treasury.toFixed(0) +
                ' млрд | Долг ' + player.debt.toFixed(0) + ' млрд | Инфляция ' +
                player.inflation.toFixed(1) + '% | Безработица ' + player.unemployment.toFixed(1) + '%';
            html = '<h3>ЭКОНОМИКА — ' + player.name + '</h3>' +
                '<div class="stat-row"><span>ВВП</span><span class="val">' + player.getModifiedGDP().toFixed(0) + ' млрд</span></div>' +
                '<div class="stat-row"><span>Налоговая ставка</span><span class="val">' + player.taxRate + '%</span></div>' +
                '<div class="stat-row"><span>Казна</span><span class="val ' + (player.treasury >= 0 ? 'pos' : 'neg') + '">' + player.treasury.toFixed(0) + ' млрд</span></div>' +
                '<div class="stat-row"><span>Госдолг</span><span class="val neg">' + player.debt.toFixed(0) + ' млрд</span></div>' +
                '<div class="stat-row"><span>Инфляция</span><span class="val ' + (player.inflation <= 5 ? 'pos' : 'neg') + '">' + player.inflation.toFixed(1) + '%</span></div>' +
                '<div class="stat-row"><span>Безработица</span><span class="val ' + (player.unemployment <= 7 ? 'pos' : 'neg') + '">' + player.unemployment.toFixed(1) + '%</span></div>' +
                '<div class="stat-row"><span>Уровень жизни</span><span class="val ' + (player.livingStandard >= 50 ? 'pos' : 'neg') + '">' + (player.livingStandard || 50) + '%</span></div>';
        } else if (moduleName === 'politics') {
            var gov = player.government || 'Республика';
            var stab = player.getModifiedStability();
            entry = 'ПОЛИТИКА ' + player.name + ': ' + gov + ' | Стабильность ' + stab +
                '% | Коррупция ' + player.corruption + '% | Избиратели в ' + player.electionYear;
            html = '<h3>ПОЛИТИКА — ' + player.name + '</h3>' +
                '<div class="stat-row"><span>Правление</span><span class="val">' + gov + '</span></div>' +
                '<div class="stat-row"><span>Стабильность</span><span class="val ' + (stab >= 60 ? 'pos' : 'neg') + '">' + stab + '%</span></div>' +
                '<div class="stat-row"><span>Коррупция</span><span class="val ' + (player.corruption <= 40 ? 'pos' : 'neg') + '">' + player.corruption + '%</span></div>' +
                '<div class="stat-row"><span>Идеология</span><span class="val">' + player.ideology + '</span></div>' +
                '<div class="stat-row"><span>Следующие выборы</span><span class="val">' + player.electionYear + '</span></div>' +
                '<div class="stat-row"><span>Партий</span><span class="val">' + (player.parties && player.parties.length ? player.parties.length : 5) + '</span></div>' +
                '<div class="stat-row"><span>Законов/реформ</span><span class="val">' + (player.laws && player.laws.length ? player.laws.length : 0) + '</span></div>';
        } else if (moduleName === 'diplomacy') {
            var rels = [];
            player.relations.forEach(function(val, tag) {
                var c = state.countries.get(tag);
                if (c) rels.push({ name: c.name, val: val, tag: tag });
            });
            rels.sort(function(a, b) { return b.val - a.val; });
            entry = 'ДИПЛОМАТИЯ ' + player.name + ': ' + rels.slice(0, 6).map(function(r) { return r.name + ' ' + r.val; }).join(', ');
            html = '<h3>ДИПЛОМАТИЯ — ' + player.name + '</h3>' +
                '<div style="max-height:200px;overflow-y:auto;">';
            rels.forEach(function(r) {
                var cls = r.val >= 60 ? 'pos' : (r.val <= -60 ? 'neg' : '');
                html += '<div class="stat-row"><span>' + r.name + ' (' + r.tag + ')</span><span class="val ' + cls + '">' + r.val + '</span></div>';
            });
            html += '</div>';
        } else if (moduleName === 'army') {
            entry = 'АРМИЯ ' + player.name + ': военный бюджет ' + player.militaryBudget + ' млрд';
            html = '<h3>АРМИЯ — ' + player.name + '</h3>' +
                '<div class="stat-row"><span>Военный бюджет</span><span class="val">' + player.militaryBudget + ' млрд</span></div>' +
                '<div class="stat-row"><span>Технологический уровень</span><span class="val">' + player.techLevel + '</span></div>' +
                '<div class="stat-row"><span>Статус</span><span class="val">Готов к набору</span></div>';
        } else if (moduleName === 'research') {
            entry = 'ИССЛЕДОВАНИЯ ' + player.name + ': технологический уровень ' + player.techLevel;
            html = '<h3>ИССЛЕДОВАНИЯ — ' + player.name + '</h3>' +
                '<div class="stat-row"><span>Технологический уровень</span><span class="val">' + player.techLevel + '</span></div>' +
                '<div class="stat-row"><span>Направления</span><span class="val">Наземная техника, Авиация, ВМФ, Электроника</span></div>';
        } else if (moduleName === 'production') {
            entry = 'ПРОИЗВОДСТВО ' + player.name + ': промышленность в разработке';
            html = '<h3>ПРОИЗВОДСТВО — ' + player.name + '</h3>' +
                '<div class="stat-row"><span>Промышленность</span><span class="val">Разработка</span></div>';
        } else if (moduleName === 'intel') {
            entry = 'РАЗВЕДКА ' + player.name + ': данные о соседних странах';
            html = '<h3>РАЗВЕДКА — ' + player.name + '</h3>' +
                '<div class="stat-row"><span>Статус</span><span class="val">Активна</span></div>';
        }

        if (contentEl) contentEl.innerHTML = html;
        if (entry && log) {
            log.textContent = entry + '\n' + (log.textContent || '').split('\n').slice(0, 7).join('\n');
        }
    };

    UI.prototype._renderNews = function(news) {
        var list = this.elements.newsList;
        if (!list) return;
        list.innerHTML = '';
        news.slice(0, 10).forEach(function(n) {
            var el = document.createElement('div');
            el.className = 'news-item';
            el.innerHTML = '<div class="news-time">' + (n.date || '') + '</div><div class="news-title">' +
                n.title + '</div><div class="news-text">' + n.text + '</div>';
            list.appendChild(el);
        });
    };

    UI.prototype._renderLog = function(log) {
        var el = this.elements.eventLog;
        if (!el) return;
        el.textContent = log.slice(0, 8).join('\n');
    };

    UI.prototype.setSpeedButtons = function(activeSpeed) {
        document.querySelectorAll('.speed-btn').forEach(function(btn) {
            btn.classList.toggle('active', parseInt(btn.dataset.speed) === activeSpeed);
        });
    };

    return UI;
})();
