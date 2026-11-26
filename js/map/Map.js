/**
 * Map.js — глобальная карта мира (Этап 1, улучшенная).
 * Стилизованная карта мира с континентами, океаном, цветными провинциями-странами.
 * Класс GameMap не конфликтует со встроенным ES6 Map.
 */
var GameMap = (function() {
    function GameMap(containerId) {
        this.container = document.getElementById(containerId);
        this.overlay = document.getElementById('map-overlay');
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };

        this.provinces = [];
        this.hoverProvince = null;
        this.selectedProvince = null;

        if (!this.container) {
            console.error('Map container not found:', containerId);
            return;
        }

        this._initCanvas();
        this._bindEvents();
        this._generateWorldMap();
        this.render();
    }

    GameMap.prototype._initCanvas = function() {
        this.container.innerHTML = '';
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this._resize();
    };

    GameMap.prototype._resize = function() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
    };

    /**
     * Генерация stylized карты мира.
     * Каждая провинция — полигон с координатами относительно Canvas (до масштаба).
     */
    GameMap.prototype._generateWorldMap = function() {
        var self = this;

        // Северная Америка
        this.provinces.push({
            id: 'pro_USA', tag: 'USA', name: 'США', region: 'Северная Америка',
            color: '#3b82f6',
            poly: [
                [150,200],[280,190],[340,220],[340,280],[300,330],[220,340],[140,320],[120,260],[140,210]
            ]
        });
        this.provinces.push({
            id: 'pro_CAN', tag: 'CAN', name: 'Канада', region: 'Северная Америка',
            color: '#3b82f6',
            poly: [
                [130,130],[300,120],[360,150],[350,200],[280,190],[150,200],[120,180],[110,150]
            ]
        });
        this.provinces.push({
            id: 'pro_MEX', tag: 'MEX', name: 'Мексика', region: 'Северная Америка',
            color: '#4ade80',
            poly: [
                [220,340],[260,350],[270,390],[250,410],[220,400],[200,380],[200,350]
            ]
        });
        this.provinces.push({
            id: 'pro_CUB', tag: 'CUB', name: 'Куба', region: 'Северная Америка',
            color: '#ef4444',
            poly: [
                [310,400],[330,400],[335,410],[330,420],[310,420],[305,410]
            ]
        });

        // Южная Америка
        this.provinces.push({
            id: 'pro_BRA', tag: 'BRA', name: 'Бразилия', region: 'Южная Америка',
            color: '#4ade80',
            poly: [
                [340,500],[420,490],[460,510],[470,560],[440,620],[400,640],[350,630],[320,600],[330,540]
            ]
        });
        this.provinces.push({
            id: 'pro_ARG', tag: 'ARG', name: 'Аргентина', region: 'Южная Америка',
            color: '#4ade80',
            poly: [
                [380,640],[420,650],[430,700],[410,740],[390,730],[370,700],[360,660]
            ]
        });
        this.provinces.push({
            id: 'pro_CHL', tag: 'CHL', name: 'Чили', region: 'Южная Америка',
            color: '#4ade80',
            poly: [
                [440,560],[450,620],[455,700],[450,730],[445,720],[440,660]
            ]
        });
        this.provinces.push({
            id: 'pro_COL', tag: 'COL', name: 'Колумбия', region: 'Южная Америка',
            color: '#4ade80',
            poly: [
                [350,510],[370,490],[390,500],[380,530],[360,530]
            ]
        });
        this.provinces.push({
            id: 'pro_PER', tag: 'PER', name: 'Перу', region: 'Южная Америка',
            color: '#4ade80',
            poly: [
                [380,530],[400,520],[410,550],[400,580],[390,560],[380,550]
            ]
        });
        this.provinces.push({
            id: 'pro_VEN', tag: 'VEN', name: 'Венесуэла', region: 'Южная Америка',
            color: '#4ade80',
            poly: [
                [350,490],[370,480],[380,500],[370,510],[360,500]
            ]
        });

        // Евразия
        this.provinces.push({
            id: 'pro_RUS', tag: 'RUS', name: 'Россия', region: 'Евразия',
            color: '#ef4444',
            poly: [
                [420,110],[700,100],[760,120],[800,180],[780,260],[720,290],[650,300],[560,280],[500,240],[450,180]
            ]
        });
        this.provinces.push({
            id: 'pro_CHN', tag: 'CHN', name: 'Китай', region: 'Евразия',
            color: '#ef4444',
            poly: [
                [720,210],[820,200],[860,250],[850,310],[800,330],[750,310],[720,260]
            ]
        });
        this.provinces.push({
            id: 'pro_IND', tag: 'IND', name: 'Индия', region: 'Евразия',
            color: '#4ade80',
            poly: [
                [780,310],[840,300],[860,350],[830,390],[800,390],[780,350],[770,320]
            ]
        });
        this.provinces.push({
            id: 'pro_PAK', tag: 'PAK', name: 'Пакистан', region: 'Евразия',
            color: '#4ade80',
            poly: [
                [740,300],[770,290],[780,310],[760,330],[750,320],[740,310]
            ]
        });
        this.provinces.push({
            id: 'pro_IRN', tag: 'IRN', name: 'Иран', region: 'Ближний Восток',
            color: '#4ade80',
            poly: [
                [650,280],[700,270],[710,290],[700,310],[680,320],[660,310],[650,290]
            ]
        });
        this.provinces.push({
            id: 'pro_IRQ', tag: 'IRQ', name: 'Ирак', region: 'Ближний Восток',
            color: '#ef4444',
            poly: [
                [620,290],[650,280],[660,300],[650,320],[630,320],[620,300]
            ]
        });
        this.provinces.push({
            id: 'pro_SAU', tag: 'SAU', name: 'Саудовская Аравия', region: 'Ближний Восток',
            color: '#4ade80',
            poly: [
                [640,310],[700,300],[710,340],[690,380],[660,380],[640,350],[630,320]
            ]
        });
        this.provinces.push({
            id: 'pro_ISR', tag: 'ISR', name: 'Израиль', region: 'Ближний Восток',
            color: '#4ade80',
            poly: [
                [620,300],[635,300],[635,310],[625,312],[620,308]
            ]
        });
        this.provinces.push({
            id: 'pro_TUR', tag: 'TUR', name: 'Турция', region: 'Ближний Восток',
            color: '#ef4444',
            poly: [
                [580,250],[620,240],[640,260],[630,280],[610,290],[590,280],[580,260]
            ]
        });
        this.provinces.push({
            id: 'pro_UKR', tag: 'UKR', name: 'Украина', region: 'Восточная Европа',
            color: '#4ade80',
            poly: [
                [560,220],[590,210],[600,230],[590,250],[570,250],[560,240]
            ]
        });
        this.provinces.push({
            id: 'pro_KAZ', tag: 'KAZ', name: 'Казахстан', region: 'Евразия',
            color: '#4ade80',
            poly: [
                [600,180],[660,170],[700,190],[710,210],[690,230],[650,230],[620,210],[600,190]
            ]
        });

        // Западная Европа
        this.provinces.push({
            id: 'pro_GBR', tag: 'GBR', name: 'Великобритания', region: 'Западная Европа',
            color: '#3b82f6',
            poly: [
                [460,210],[500,205],[505,220],[490,230],[470,230],[460,220]
            ]
        });
        this.provinces.push({
            id: 'pro_FRA', tag: 'FRA', name: 'Франция', region: 'Западная Европа',
            color: '#ef4444',
            poly: [
                [500,230],[540,225],[550,250],[540,270],[510,275],[490,260],[480,240]
            ]
        });
        this.provinces.push({
            id: 'pro_DEU', tag: 'DEU', name: 'Германия', region: 'Западная Европа',
            color: '#ef4444',
            poly: [
                [540,225],[580,220],[590,240],[580,260],[560,260],[550,240]
            ]
        });
        this.provinces.push({
            id: 'pro_POL', tag: 'POL', name: 'Польша', region: 'Восточная Европа',
            color: '#ef4444',
            poly: [
                [590,210],[620,205],[630,230],[610,250],[590,250],[580,230]
            ]
        });
        this.provinces.push({
            id: 'pro_ITA', tag: 'ITA', name: 'Италия', region: 'Западная Европа',
            color: '#ef4444',
            poly: [
                [530,270],[560,265],[570,290],[560,320],[540,320],[520,300],[510,280]
            ]
        });
        this.provinces.push({
            id: 'pro_ESP', tag: 'ESP', name: 'Испания', region: 'Западная Европа',
            color: '#ef4444',
            poly: [
                [480,260],[510,255],[520,280],[500,300],[480,290],[470,270]
            ]
        });

        // Азия-Тихоокеанский регион
        this.provinces.push({
            id: 'pro_JPN', tag: 'JPN', name: 'Япония', region: 'Восточная Азия',
            color: '#ef4444',
            poly: [
                [900,170],[940,160],[950,190],[930,220],[910,220],[900,190]
            ]
        });
        this.provinces.push({
            id: 'pro_KOR', tag: 'KOR', name: 'Южная Корея', region: 'Восточная Азия',
            color: '#4ade80',
            poly: [
                [860,200],[880,195],[885,210],[870,215],[860,210]
            ]
        });
        this.provinces.push({
            id: 'pro_PRK', tag: 'PRK', name: 'Северная Корея', region: 'Восточная Азия',
            color: '#ef4444',
            poly: [
                [865,190],[880,185],[885,200],[875,205],[865,200]
            ]
        });
        this.provinces.push({
            id: 'pro_IDN', tag: 'IDN', name: 'Индонезия', region: 'Юго-Восточная Азия',
            color: '#4ade80',
            poly: [
                [820,380],[860,370],[870,400],[850,420],[830,420],[820,400]
            ]
        });
        this.provinces.push({
            id: 'pro_THA', tag: 'THA', name: 'Таиланд', region: 'Юго-Восточная Азия',
            color: '#4ade80',
            poly: [
                [790,360],[820,350],[830,370],[820,390],[800,390],[790,370]
            ]
        });
        this.provinces.push({
            id: 'pro_VNM', tag: 'VNM', name: 'Вьетнам', region: 'Юго-Восточная Азия',
            color: '#ef4444',
            poly: [
                [800,340],[830,330],[840,350],[830,370],[810,370],[800,350]
            ]
        });

        // Африка
        this.provinces.push({
            id: 'pro_EGY', tag: 'EGY', name: 'Египет', region: 'Северная Африка',
            color: '#4ade80',
            poly: [
                [630,320],[670,310],[680,350],[660,370],[640,370],[630,340]
            ]
        });
        this.provinces.push({
            id: 'pro_ZAF', tag: 'ZAF', name: 'ЮАР', region: 'Южная Африка',
            color: '#4ade80',
            poly: [
                [620,460],[660,450],[670,480],[650,500],[630,490],[620,470]
            ]
        });
        this.provinces.push({
            id: 'pro_NGA', tag: 'NGA', name: 'Нигерия', region: 'Западная Африка',
            color: '#4ade80',
            poly: [
                [540,400],[580,390],[590,420],[570,440],[550,430],[540,410]
            ]
        });
        this.provinces.push({
            id: 'pro_ETH', tag: 'ETH', name: 'Эфиопия', region: 'Восточная Африка',
            color: '#4ade80',
            poly: [
                [640,380],[680,370],[690,400],[670,420],[650,410],[640,390]
            ]
        });
        this.provinces.push({
            id: 'pro_KEN', tag: 'KEN', name: 'Кения', region: 'Восточная Африка',
            color: '#4ade80',
            poly: [
                [660,400],[700,390],[710,420],[690,440],[670,430],[660,410]
            ]
        });

        // Океания
        this.provinces.push({
            id: 'pro_AUS', tag: 'AUS', name: 'Австралия', region: 'Океания',
            color: '#3b82f6',
            poly: [
                [900,460],[980,450],[1000,510],[970,560],[930,560],[910,520],[900,480]
            ]
        });
        this.provinces.push({
            id: 'pro_NZL', tag: 'NZL', name: 'Новая Зеландия', region: 'Океания',
            color: '#3b82f6',
            poly: [
                [1020,540],[1040,530],[1045,550],[1030,560],[1020,550]
            ]
        });
    };

    GameMap.prototype._pointInPolygon = function(x, y, poly) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i][0], yi = poly[i][1];
            var xj = poly[j][0], yj = poly[j][1];
            var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    GameMap.prototype._bindEvents = function() {
        var canvas = this.canvas;
        var self = this;

        canvas.addEventListener('wheel', function(e) {
            e.preventDefault();
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;
            var zoom = e.deltaY > 0 ? 0.9 : 1.1;
            var newScale = Math.min(Math.max(self.scale * zoom, 0.5), 4);
            var zoomFactor = newScale / self.scale;

            self.offsetX = mx - (mx - self.offsetX) * zoomFactor;
            self.offsetY = my - (my - self.offsetY) * zoomFactor;
            self.scale = newScale;
            self.render();
        }, { passive: false });

        canvas.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            self.isDragging = true;
            self.dragStart = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', function(e) {
            if (!self.isDragging) return;
            self.offsetX += e.clientX - self.dragStart.x;
            self.offsetY += e.clientY - self.dragStart.y;
            self.dragStart = { x: e.clientX, y: e.clientY };
            self.render();
        });

        window.addEventListener('mouseup', function() {
            self.isDragging = false;
            self.canvas.style.cursor = 'crosshair';
        });

        canvas.addEventListener('mousemove', function(e) {
            var rect = canvas.getBoundingClientRect();
            var mx = (e.clientX - rect.left - self.offsetX) / self.scale;
            var my = (e.clientY - rect.top - self.offsetY) / self.scale;
            var hit = null;
            for (var i = 0; i < self.provinces.length; i++) {
                if (self._pointInPolygon(mx, my, self.provinces[i].poly)) {
                    hit = self.provinces[i];
                    break;
                }
            }
            self.hoverProvince = hit || null;
            self.render();
        });

        canvas.addEventListener('click', function() {
            if (self.hoverProvince) {
                self.selectedProvince = self.hoverProvince;
                window.dispatchEvent(new CustomEvent('map:provinceClicked', {
                    detail: { tag: self.hoverProvince.tag }
                }));
            }
        });

        window.addEventListener('resize', function() { self._resize(); });
    };

    GameMap.prototype._drawPolygon = function(poly, fillColor, strokeColor, lineWidth) {
        var ctx = this.ctx;
        if (poly.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (var i = 1; i < poly.length; i++) {
            ctx.lineTo(poly[i][0], poly[i][1]);
        }
        ctx.closePath();
        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fill();
        }
        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth || 1;
            ctx.stroke();
        }
    };

    GameMap.prototype.render = function() {
        if (!this.ctx) return;
        var ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        // Океан
        ctx.fillStyle = '#0b1018';
        ctx.fillRect(-2000, -2000, 4000, 4000);

        // Сетка широты/долготы (декоративная)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5 / this.scale;
        for (var gx = -2000; gx < 2000; gx += 200) {
            ctx.beginPath(); ctx.moveTo(gx, -2000); ctx.lineTo(gx, 2000); ctx.stroke();
        }
        for (var gy = -2000; gy < 2000; gy += 200) {
            ctx.beginPath(); ctx.moveTo(-2000, gy); ctx.lineTo(2000, gy); ctx.stroke();
        }

        // Рисуем провинции
        var self = this;
        this.provinces.forEach(function(p) {
            var isHover = (self.hoverProvince && self.hoverProvince.id === p.id);
            var isSelected = (self.selectedProvince && self.selectedProvince.id === p.id);

            // Цвет fill
            var fill = p.color;
            if (isSelected) fill = 'rgba(255,255,255,0.3)';
            else if (isHover) fill = 'rgba(255,255,255,0.2)';

            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(p.poly[0][0], p.poly[0][1]);
            for (var i = 1; i < p.poly.length; i++) {
                ctx.lineTo(p.poly[i][0], p.poly[i][1]);
            }
            ctx.closePath();
            ctx.fill();

            // Граница
            ctx.strokeStyle = isSelected ? '#4ade80' : 'rgba(255,255,255,0.12)';
            ctx.lineWidth = (isSelected ? 2 : 1) / self.scale;
            ctx.stroke();

            // Подпись тега страны (в центре полигона, если достаточно велико)
            if (self.scale > 0.7) {
                var cx = 0, cy = 0;
                for (var k = 0; k < p.poly.length; k++) { cx += p.poly[k][0]; cy += p.poly[k][1]; }
                cx /= p.poly.length; cy /= p.poly.length;

                // Размер полигона для проверки читаемости
                var maxDist = 0;
                for (var k = 0; k < p.poly.length; k++) {
                    var d = Math.sqrt(Math.pow(p.poly[k][0]-cx,2) + Math.pow(p.poly[k][1]-cy,2));
                    if (d > maxDist) maxDist = d;
                }
                if (maxDist > 30) {
                    ctx.fillStyle = '#dbe3ee';
                    ctx.font = Math.max(10, 12 / self.scale) + 'px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.tag, cx, cy + 4);
                }
            }
        });

        ctx.restore();

        // Подсказка при наведении
        if (this.hoverProvince) {
            this.overlay.style.display = 'block';
            var rect = this.canvas.getBoundingClientRect();
            var hx = this.offsetX + this.hoverProvince.poly[0][0] * this.scale + this.canvas.width / 2;
            var hy = this.offsetY + this.hoverProvince.poly[0][1] * this.scale + this.canvas.height / 2 - 40;
            this.overlay.style.left = hx + 'px';
            this.overlay.style.top = hy + 'px';
            this.overlay.textContent = this.hoverProvince.tag + ' — ' + this.hoverProvince.name;
        } else {
            this.overlay.style.display = 'none';
        }
    };

    GameMap.prototype.centerOn = function(tag) {
        var p = this.provinces.find(function(pr) { return pr.tag === tag; });
        if (!p) return;
        // Центр полигона
        var cx = 0, cy = 0;
        for (var i = 0; i < p.poly.length; i++) { cx += p.poly[i][0]; cy += p.poly[i][1]; }
        cx /= p.poly.length; cy /= p.poly.length;
        this.offsetX = this.canvas.width / 2 - cx * this.scale;
        this.offsetY = this.canvas.height / 2 - cy * this.scale;
        this.render();
    };

    return GameMap;
})();
