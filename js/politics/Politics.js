/**
 * Politics.js — политическая система (Этап 2).
 * Партии, министры, стабильность, коррупция, выборы, реформы/законы.
 */
var Politics = (function() {
    function Politics() {
        this.parties = [
            { name: 'Консервативная партия', ideology: 'conservatism', support: 30 },
            { name: 'Либеральная партия', ideology: 'liberalism', support: 25 },
            { name: 'Социалистическая партия', ideology: 'socialism', support: 20 },
            { name: 'Националистическая партия', ideology: 'nationalism', support: 15 },
            { name: 'Коммунистическая партия', ideology: 'communism', support: 10 }
        ];
        this.electionCycleYears = 4;
    }

    Politics.prototype.getRulingParty = function(country) {
        if (country.parties && country.parties.length > 0) {
            var best = country.parties[0];
            country.parties.forEach(function(p) {
                if (p.support > best.support) best = p;
            });
            return best;
        }
        return { name: 'Беспартийный', ideology: 'independent', support: 100 };
    };

    Politics.prototype.setMinister = function(country, position, name) {
        country.ministers = country.ministers || {};
        country.ministers[position] = name;
        eventBus.emit('politics:ministerAppointed', { country: country, position: position, name: name });
    };

    Politics.prototype.applyReform = function(country, reformId) {
        country.laws = country.laws || [];
        if (country.laws.indexOf(reformId) >= 0) {
            eventBus.emit('politics:reformAlreadyExists', { country: country, reform: reformId });
            return false;
        }

        var effects = {
            'liberalize_economy':   { stability: -5, gdpPct: 5, corruption: -5 },
            'increase_taxes':       { stability: -10, treasury: 15 },
            'cut_military_spending':{ stability: 5, militaryBudgetPct: -15 },
            'anticorruption':       { stability: 5, corruption: -10, gdpPct: -2 },
            'social_programs':      { stability: 8, treasury: -10, unemployment: -2 }
        };

        var e = effects[reformId];
        if (!e) return false;

        country.laws.push(reformId);

        if (e.stability) country.politicalStability = Math.max(0, Math.min(100, country.politicalStability + e.stability));
        if (e.corruption) country.corruption = Math.max(0, Math.min(100, country.corruption + e.corruption));
        if (e.gdpPct) country.addModifier('reform_' + reformId, { gdpPct: e.gdpPct });
        if (e.treasury) country.treasury += e.treasury;
        if (e.militaryBudgetPct) country.militaryBudget = Math.max(0, country.militaryBudget * (1 + e.militaryBudgetPct / 100));
        if (e.unemployment) country.unemployment = Math.max(1, country.unemployment + e.unemployment);

        eventBus.emit('politics:reformApplied', { country: country, reform: reformId, effects: e });
        return true;
    };

    Politics.prototype.checkElection = function(country, currentYear) {
        if (currentYear >= country.electionYear) {
            // Пересчитаем поддержку партий на основе стабильности
            country.parties.forEach(function(p) {
                var shift = 0;
                if (p.ideology === 'conservatism') shift = (country.politicalStability - 50) * 0.1;
                if (p.ideology === 'socialism') shift = (50 - country.politicalStability) * 0.1;
                p.support = Math.max(5, Math.min(60, p.support + shift));
            });

            country.electionYear += this.electionCycleYears;
            eventBus.emit('politics:electionHeld', { country: country, year: currentYear });
            return true;
        }
        return false;
    };

    return Politics;
})();
