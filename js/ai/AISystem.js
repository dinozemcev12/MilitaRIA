/**
 * AISystem.js — искусственный интеллект государств (Этап 3).
 * Каждая страна принимает собственные решения в области экономики,
 * дипломатии, военных расходов, исследований и внутренней политики.
 * AI работает только за страны, которыми не управляет игрок.
 */
var AISystem = (function() {
    // Личности государств: агрессия, экспансия, изоляционизм (0..1)
    var PERSONALITIES = {
        USA:  { aggression: 0.55, expansionism: 0.35, isolationism: 0.20 },
        RUS:  { aggression: 0.70, expansionism: 0.60, isolationism: 0.35 },
        CHN:  { aggression: 0.50, expansionism: 0.70, isolationism: 0.45 },
        GBR:  { aggression: 0.40, expansionism: 0.25, isolationism: 0.30 },
        FRA:  { aggression: 0.45, expansionism: 0.30, isolationism: 0.30 },
        DEU:  { aggression: 0.30, expansionism: 0.20, isolationism: 0.35 },
        POL:  { aggression: 0.40, expansionism: 0.15, isolationism: 0.40 },
        TUR:  { aggression: 0.55, expansionism: 0.45, isolationism: 0.30 },
        UKR:  { aggression: 0.25, expansionism: 0.10, isolationism: 0.45 },
        JPN:  { aggression: 0.35, expansionism: 0.20, isolationism: 0.40 },
        IND:  { aggression: 0.45, expansionism: 0.35, isolationism: 0.40 },
        IRN:  { aggression: 0.60, expansionism: 0.30, isolationism: 0.50 },
        IRQ:  { aggression: 0.50, expansionism: 0.20, isolationism: 0.55 },
        ISR:  { aggression: 0.65, expansionism: 0.25, isolationism: 0.45 },
        SAU:  { aggression: 0.45, expansionism: 0.20, isolationism: 0.50 },
        PRK:  { aggression: 0.75, expansionism: 0.10, isolationism: 0.80 },
        KOR:  { aggression: 0.45, expansionism: 0.10, isolationism: 0.35 },
        AUS:  { aggression: 0.25, expansionism: 0.10, isolationism: 0.50 },
        CAN:  { aggression: 0.20, expansionism: 0.10, isolationism: 0.50 },
        BRA:  { aggression: 0.30, expansionism: 0.20, isolationism: 0.45 },
        ARG:  { aggression: 0.25, expansionism: 0.10, isolationism: 0.50 },
        EGY:  { aggression: 0.35, expansionism: 0.15, isolationism: 0.45 },
        ZAF:  { aggression: 0.25, expansionism: 0.10, isolationism: 0.50 },
        ESP:  { aggression: 0.30, expansionism: 0.15, isolationism: 0.40 },
        ITA:  { aggression: 0.35, expansionism: 0.15, isolationism: 0.40 }
    };

    function AISystem() {
        this.tickCounter = 0;
        this.aiUpdateInterval = 60; // обновлять ИИ каждые 60 тиков (примерно 2 месяца игры)
    }

    AISystem.prototype.getPersonality = function(tag) {
        return PERSONALITIES[tag] || { aggression: 0.5, expansionism: 0.5, isolationism: 0.5 };
    };

    // === ЭКОНОМИКА ИИ ===
    AISystem.prototype.manageEconomy = function(state, country) {
        var tag = country.tag;
        var treasury = country.treasury;
        var debt = country.debt;
        var taxRate = country.taxRate;

        // Если казна пуста и долг растет — поднимаем налоги (до предела)
        if (treasury < 50 && debt > 200 && taxRate < 45) {
            country.taxRate = Math.min(45, taxRate + 5);
            state.addLog(tag + ' подняла налоги до ' + country.taxRate + '% из-за дефицита бюджета.');
        }
        // Если казна большая — можно снизить налоги для роста ВВП
        if (treasury > 500 && taxRate > 20) {
            country.taxRate = Math.max(20, taxRate - 3);
            state.addLog(tag + ' снизила налоги до ' + country.taxRate + '% для стимулирования экономики.');
        }

        // Военный бюджет: зависит от агрессии и стабильности
        var personality = this.getPersonality(tag);
        var targetMilitary = 2.0 + personality.aggression * 3.0; // 2..5% от ВВП
        if (country.stability < 40) targetMilitary *= 1.5; // при нестабильности больше на армию
        country.militaryBudget = country.gdp * (targetMilitary / 100);
    };

    // === ДИПЛОМАТИЯ ИИ ===
    AISystem.prototype.manageDiplomacy = function(state, country, diplomacy) {
        var tag = country.tag;
        var personality = this.getPersonality(tag);
        var neighbors = this._getNeighbors(tag);

        neighbors.forEach(function(otherTag) {
            var other = state.countries.get(otherTag);
            if (!other) return;

            var rel = country.getRelation(otherTag);
            var isWar = diplomacy.isAtWar(state, tag, otherTag);
            var isAlly = diplomacy.areAllies(state, tag, otherTag);
            var hasTrade = diplomacy.hasTradeAgreement(state, tag, otherTag);

            // Если уже в войне — ничего не делать дипломатично
            if (isWar) return;

            // Слабый сосед + высокая экспансия + агрессия -> угроза войны
            if (!isWar && !isAlly && personality.expansionism > 0.5 && personality.aggression > 0.5) {
                var otherWeak = other.militaryBudget < country.militaryBudget * 0.5;
                var relationsBad = rel < -40;
                if (otherWeak && relationsBad && Math.random() < 0.05) {
                    diplomacy.declareWar(state, tag, otherTag);
                    return;
                }
            }

            // Плохие отношения + не союз -> санкции или ухудшение
            if (!isAlly && rel < -60 && !diplomacy.sanctions.has(diplomacy._pairKey(tag, otherTag))) {
                if (Math.random() < 0.03) {
                    diplomacy.imposeSanctions(state, tag, otherTag);
                }
            }

            // Хорошие отношения, не союз -> предложить союз
            if (rel > 70 && !isAlly && personality.isolationism < 0.5) {
                if (Math.random() < 0.04) {
                    diplomacy.formAlliance(state, tag, otherTag);
                }
            }

            // Очень плохие отношения -> ухудшитьurther
            if (rel < -30 && !isWar && !diplomacy.sanctions.has(diplomacy._pairKey(tag, otherTag))) {
                if (Math.random() < 0.02) {
                    diplomacy.changeRelation(state, tag, otherTag, -5);
                }
            }

            // Нет торговли и отношения нормальные -> торговое соглашение
            if (rel > 30 && !hasTrade && !isWar) {
                if (Math.random() < 0.03) {
                    diplomacy.formTradeAgreement(state, tag, otherTag);
                }
            }

            // Медленно улучшаем отношения с союзниками и нейтралами
            if (rel < 50 && rel > -30 && !isWar) {
                diplomacy.changeRelation(state, tag, otherTag, 0.5);
            }
        });
    };

    // === ВОЕННЫЕ РАСХОДЫ ИИ ===
    AISystem.prototype.manageMilitary = function(state, country) {
        var tag = country.tag;
        var personality = this.getPersonality(tag);

        // При 낮은 стабильности — может быть переворот или軍事правительство
        if (country.stability < 30 && Math.random() < 0.01) {
            country.stability = Math.min(50, country.stability + 10);
            country.corruption = Math.min(100, country.corruption + 5);
            state.addLog(tag + ' : военный переворот, стабильность временно восстановлена.');
        }
    };

    // === ВНУТРЕННЯЯ ПОЛИТИКА ИИ ===
    AISystem.prototype.manageInternalPolitics = function(state, country) {
        var tag = country.tag;

        // Борьба с коррупцией при высокой стабильности
        if (country.politicalStability > 70 && country.corruption > 50 && Math.random() < 0.02) {
            country.corruption = Math.max(30, country.corruption - 5);
            state.addLog(tag + ' провела антикоррупционную реформу.');
        }

        // Соцпрограммы при низком уровне жизни
        if (country.livingStandard < 40 && country.treasury > 100 && Math.random() < 0.02) {
            country.treasury -= 50;
            country.livingStandard = Math.min(100, country.livingStandard + 5);
            state.addLog(tag + ' запустила социальные программы.');
        }
    };

    // === ГЛАВНЫЙ UPDATE ИИ ===
    AISystem.prototype.update = function(state, country, diplomacy) {
        // ИИ не управляет страной игрока
        if (country.tag === state.playerCountryTag) return;

        this.tickCounter++;
        if (this.tickCounter < this.aiUpdateInterval) return;
        this.tickCounter = 0;

        var tag = country.tag;
        if (!tag) return;

        this.manageEconomy(state, country);
        this.manageDiplomacy(state, country, diplomacy);
        this.manageMilitary(state, country);
        this.manageInternalPolitics(state, country);
    };

    // Соседи страны (упрощённо: по регионам/близости на карте)
    AISystem.prototype._getNeighbors = function(tag) {
        var neighborMap = {
            USA: ['CAN', 'MEX'],
            RUS: ['UKR', 'POL', 'CHN', 'KOR', 'JPN', 'USA'],
            UKR: ['RUS', 'POL'],
            CHN: ['RUS', 'IND', 'PRK', 'KOR', 'JPN'],
            GBR: ['FRA', 'DEU', 'USA'],
            FRA: ['DEU', 'ESP', 'ITA', 'GBR'],
            DEU: ['POL', 'FRA', 'ITA'],
            POL: ['DEU', 'RUS', 'UKR'],
            TUR: ['IRN', 'IRQ', 'SYR'],
            IND: ['CHN', 'PAK'],
            JPN: ['CHN', 'KOR', 'RUS'],
            IRN: ['IRQ', 'TUR', 'SAU', 'USA'],
            IRQ: ['IRN', 'SAU', 'SYR'],
            ISR: ['EGY', 'SAU', 'IRN'],
            SAU: ['IRN', 'IRQ', 'ISR', 'EGY'],
            PRK: ['KOR', 'CHN', 'RUS'],
            KOR: ['PRK', 'JPN', 'USA'],
            AUS: [],
            CAN: ['USA'],
            BRA: ['ARG'],
            ARG: ['BRA'],
            EGY: ['ISR', 'SAU'],
            ZAF: [],
            ESP: ['FRA'],
            ITA: ['FRA', 'DEU']
        };
        return neighborMap[tag] || [];
    };

    return AISystem;
})();
