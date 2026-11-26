/**
 * UI.js — управление интерфейсом (ETAП 1).
 * Обновляет верхнюю панель, выделение страны, список новостей, лог событий.
 */
export class UI {
    constructor() {
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
        };

        this._bindNav();
        this._bindBottomButtons();
        this._bindCountryPicker();
    }

    _bindNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const module = btn.dataset.module;
                window.dispatchEvent(new CustomEvent('ui:moduleSelected', { detail: { module } }));
            });
        });
    }

    _bindBottomButtons() {
        const btnSave = document.getElementById('btn-save');
        const btnLoad = document.getElementById('btn-load');
        const btnMenu = document.getElementById('btn-menu');

        btnSave.addEventListener('click', () => window.dispatchEvent(new CustomEvent('ui:save')));
        btnLoad.addEventListener('click', () => window.dispatchEvent(new CustomEvent('ui:load')));
        btnMenu.addEventListener('click', () => window.dispatchEvent(new CustomEvent('ui:menu')));

        document.getElementById('player-country').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('ui:openCountryPicker'));
        });
    }

    _bindCountryPicker() {
        const picker = document.getElementById('country-picker');
        const close = document.getElementById('btn-pick-close');
        const list = document.getElementById('country-list');

        close.addEventListener('click', () => picker.classList.add('hidden'));

        window.addEventListener('ui:openCountryPicker', () => {
            list.innerHTML = '';
            window.stateModule.countries.forEach(c => {
                const row = document.createElement('div');
                row.className = 'country-row';
                row.innerHTML = `<div class="flag" style="background:${c.color}"></div><span>${c.name}</span> <span style="color:#6b7280;font-size:10px">(${c.tag})</span>`;
                row.addEventListener('click', () => {
                    window.stateModule.setPlayerCountry(c.tag);
                    this.update();
                    picker.classList.add('hidden');
                });
                list.appendChild(row);
            });
            picker.classList.remove('hidden');
        });
    }

    update(state) {
        // верхняя панель
        this.elements.date.textContent = state.getDateString();

        const player = state.getPlayerCountry();
        if (player) {
            this.elements.playerName.textContent = player.name;
            this.elements.stability.textContent = state.getPlayerCountry().getModifiedStability() + '%';
            this.elements.gdp.textContent = player.getModifiedGDP() + ' млрд';
            this.elements.pop.textContent = player.population.toLocaleString() + ' чел.';
            this.elements.milBudget.textContent = player.militaryBudget + ' млрд';

            // карточка страны
            this.elements.cardName.textContent = player.name;
            this.elements.cardCapital.textContent = player.capital;
            this.elements.cardPop.textContent = player.population.toLocaleString() + ' чел.';
            this.elements.cardGdp.textContent = player.getModifiedGDP() + ' млрд';
            this.elements.cardStab.textContent = player.getModifiedStability() + '%';
            this.elements.countryCard.style.display = 'block';
        }

        this.elements.speed.textContent = state.getSpeedLabel();

        // новости
        this._renderNews(state.news);
        this._renderLog(state.eventLog);
    }

    _renderNews(news) {
        const list = this.elements.newsList;
        list.innerHTML = '';
        news.slice(0, 10).forEach(n => {
            const el = document.createElement('div');
            el.className = 'news-item';
            el.innerHTML = `<div class="news-time">${n.date || ''}</div><div class="news-title">${n.title}</div><div class="news-text">${n.text}</div>`;
            list.appendChild(el);
        });
    }

    _renderLog(log) {
        this.elements.eventLog.textContent = log.slice(0, 8).join('\n');
    }

    setSpeedButtons(activeSpeed) {
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.speed) === activeSpeed);
        });
    }
}
