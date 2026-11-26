/**
 * Map.js — глобальная карта мира (ETAП 1).
 * Рендерит контейнер карты, обрабатывает зум/перемещение,
 * отрисовывает провинции как цветные регионы.
 */
export class Map {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.overlay = document.getElementById('map-overlay');
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };

        this.provinces = []; // { id, tag, name, x, y, w, h, color }
        this.hoverProvince = null;

        if (!this.container) {
            console.error('Map container not found:', containerId);
            return;
        }

        this._initCanvas();
        this._bindEvents();
        this._generateWorldMap();
        this.render();
    }

    _initCanvas() {
        this.container.innerHTML = '';
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this._resize();
    }

    _resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
    }

    _generateWorldMap() {
        // Упрощённая схема провинций по регионам (заглушка под реальные границы).
        // Каждая провинция — прямоугольник с привязкой к стране.
        const regions = [
            { tag: 'USA', name: 'Северная Америка', x: 120, y: 180, w: 260, h: 160 },
            { tag: 'RUS', name: 'Евразия (Россия)', x: 360, y: 100, w: 560, h: 220 },
            { tag: 'CHN', name: 'Китай', x: 640, y: 180, w: 220, h: 140 },
            { tag: 'IND', name: 'Индия', x: 700, y: 300, w: 120, h: 100 },
            { tag: 'GBR', name: 'Великобритания', x: 470, y: 220, w: 60, h: 40 },
            { tag: 'FRA', name: 'Франция', x: 520, y: 240, w: 70, h: 50 },
            { tag: 'DEU', name: 'Германия', x: 560, y: 220, w: 60, h: 45 },
            { tag: 'POL', name: 'Польша', x: 600, y: 200, w: 50, h: 40 },
            { tag: 'TUR', name: 'Турция', x: 640, y: 250, w: 60, h: 45 },
            { tag: 'UKR', name: 'Украина', x: 620, y: 190, w: 60, h: 40 },
            { tag: 'JPN', name: 'Япония', x: 900, y: 180, w: 80, h: 50 },
            { tag: 'BRA', name: 'Бразилия', x: 320, y: 360, w: 160, h: 140 },
            { tag: 'AUS', name: 'Австралия', x: 820, y: 420, w: 160, h: 100 },
        ];

        regions.forEach((r, i) => {
            this.provinces.push({
                id: `pro_${i}`,
                tag: r.tag,
                name: r.name,
                x: r.x, y: r.y, w: r.w, h: r.h,
                color: this._countryColor(r.tag)
            });
        });
    }

    _countryColor(tag) {
        const map = {
            USA: '#3b82f6', RUS: '#ef4444', UKR: '#4ade80', CHN: '#ef4444',
            GBR: '#3b82f6', FRA: '#ef4444', DEU: '#ef4444', POL: '#ef4444',
            TUR: '#ef4444', JPN: '#ef4444', IND: '#4ade80', IRN: '#4ade80',
            IRQ: '#ef4444', ISR: '#4ade80', SAU: '#4ade80', PRK: '#ef4444',
            KOR: '#4ade80', AUS: '#3b82f6', CAN: '#3b82f6', BRA: '#4ade80',
            ARG: '#4ade80', EGY: '#4ade80', ZAF: '#4ade80', ESP: '#ef4444',
            ITA: '#ef4444'
        };
        return map[tag] || '#6b7280';
    }

    _bindEvents() {
        const canvas = this.canvas;

        // wheel zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const zoom = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.min(Math.max(this.scale * zoom, 0.5), 4);
            const zoomFactor = newScale / this.scale;

            // Zoom toward cursor
            this.offsetX = mx - (mx - this.offsetX) * zoomFactor;
            this.offsetY = my - (my - this.offsetY) * zoomFactor;
            this.scale = newScale;
            this.render();
        }, { passive: false });

        // drag
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.offsetX += e.clientX - this.dragStart.x;
            this.offsetY += e.clientY - this.dragStart.y;
            this.dragStart = { x: e.clientX, y: e.clientY };
            this.render();
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
        });

        // hover
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left - this.offsetX) / this.scale;
            const my = (e.clientY - rect.top - this.offsetY) / this.scale;
            const hit = this.provinces.find(p =>
                mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h
            );
            this.hoverProvince = hit || null;
            this.render();
        });

        canvas.addEventListener('click', (e) => {
            if (this.hoverProvince) {
                const countryTag = this.hoverProvince.tag;
                window.dispatchEvent(new CustomEvent('map:provinceClicked', { detail: { tag: countryTag } }));
            }
        });

        window.addEventListener('resize', () => this._resize());
    }

    render() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        // фон океана
        ctx.fillStyle = '#0b1018';
        ctx.fillRect(-2000, -2000, 4000, 4000);

        // суша (упёрёмся в цвет провинций)
        this.provinces.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1 / this.scale;
            ctx.strokeRect(p.x, p.y, p.w, p.h);

            // наведение
            if (this.hoverProvince && this.hoverProvince.id === p.id) {
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(p.x, p.y, p.w, p.h);
            }

            // подпись (только если достаточно велико)
            if (this.scale > 0.8 && p.w > 40) {
                ctx.fillStyle = '#dbe3ee';
                ctx.font = `${Math.max(10, 12 / this.scale)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(p.tag, p.x + p.w / 2, p.y + p.h / 2 + 4);
            }
        });

        ctx.restore();

        // подсказка при наведении
        if (this.hoverProvince) {
            this.overlay.style.display = 'block';
            this.overlay.style.left = (this.offsetX + this.hoverProvince.x * this.scale + this.canvas.width / 2) + 'px';
            this.overlay.style.top = (this.offsetY + this.hoverProvince.y * this.scale + this.canvas.height / 2 - 40) + 'px';
            this.overlay.textContent = `${this.hoverProvince.tag} — ${this.hoverProvince.name}`;
        } else {
            this.overlay.style.display = 'none';
        }
    }

    centerOn(tag) {
        const p = this.provinces.find(pr => pr.tag === tag);
        if (!p) return;
        this.offsetX = this.canvas.width / 2 - (p.x + p.w / 2) * this.scale;
        this.offsetY = this.canvas.height / 2 - (p.y + p.h / 2) * this.scale;
        this.render();
    }
}
