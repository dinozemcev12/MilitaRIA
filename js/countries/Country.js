/**
 * Country — модель государства.
 */
var Country = (function() {
    function Country(data) {
        this.tag = data.tag;
        this.name = data.name;
        this.nameEn = data.nameEn;
        this.capital = data.capital;
        this.capitalProvince = data.capitalProvince;
        this.region = data.region;
        this.population = data.population || 0;
        this.gdp = data.gdp || 0;
        this.ideology = data.ideology || 'democracy';
        this.government = data.government || 'Республика';
        this.stability = data.stability !== undefined ? data.stability : 70;
        this.corruption = data.corruption !== undefined ? data.corruption : 30;
        this.militaryBudget = data.militaryBudget || 0;
        this.treasury = data.treasury || 0;
        this.debt = data.debt || 0;
        this.inflation = data.inflation !== undefined ? data.inflation : 2.5;
        this.unemployment = data.unemployment !== undefined ? data.unemployment : 5.0;
        this.techLevel = data.techLevel !== undefined ? data.techLevel : 50;
        this.color = data.color || '#6b7280';
        this.flagColor = data.flagColor || '#4a5a70';

        this.taxRate = data.taxRate !== undefined ? data.taxRate : 25;      // налоговая ставка %
        this.politicalStability = data.politicalStability !== undefined ? data.politicalStability : 70;
        this.electionYear = data.electionYear || 2004;                      // год следующих выборов
        this.parties = data.parties || [];                                  // [{name, ideology, support}]
        this.ministers = data.ministers || {};                              // {economy, defense, foreign, interior}
        this.laws = data.laws || [];                                        // принятые законы/реформы

        this.relations = new Map();
        this.allies = new Set();
        this.enemies = new Set();

        this.modifiers = new Map();
        this.flags = new Set();
    }
    Country.prototype.setRelation = function(tag, value) {
        value = Math.max(-100, Math.min(100, value));
        this.relations.set(tag, value);
        if (value >= 60) this.allies.add(tag); else this.allies.delete(tag);
        if (value <= -60) this.enemies.add(tag); else this.enemies.delete(tag);
    };
    Country.prototype.getRelation = function(tag) { return this.relations.get(tag) !== undefined ? this.relations.get(tag) : 0; };
    Country.prototype.addModifier = function(id, data) { this.modifiers.set(id, data); };
    Country.prototype.removeModifier = function(id) { this.modifiers.delete(id); };
    Country.prototype.getModifiedStability = function() {
        var val = this.stability;
        this.modifiers.forEach(function(m) { if (m.stability) val += m.stability; });
        return Math.max(0, Math.min(100, Math.round(val)));
    };
    Country.prototype.getModifiedGDP = function() {
        var val = this.gdp;
        this.modifiers.forEach(function(m) { if (m.gdpPct) val *= (1 + m.gdpPct / 100); });
        return Math.max(0, Math.round(val));
    };
    return Country;
})();
