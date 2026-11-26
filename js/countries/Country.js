/**
 * Country — модель государства.
 * Содержит базовые показатели: население, ВВП, стабильность, бюджет, отношения.
 */
class Country {
    constructor(data) {
        this.tag = data.tag;                 // ISO-код, например USA
        this.name = data.name;               // русское название
        this.nameEn = data.nameEn;           // английское
        this.capital = data.capital;         // столица
        this.capitalProvince = data.capitalProvince; // id провинции столицы
        this.region = data.region;           // регион мира
        this.population = data.population || 0;
        this.gdp = data.gdp || 0;            // nominal, млрд долл.
        this.ideology = data.ideology || 'democracy';
        this.government = data.government || 'Республика';
        this.stability = data.stability !== undefined ? data.stability : 70;
        this.corruption = data.corruption !== undefined ? data.corruption : 30;
        this.militaryBudget = data.militaryBudget || 0; // млрд долл.
        this.treasury = data.treasury || 0;  // деньги в казне
        this.debt = data.debt || 0;
        this.inflation = data.inflation !== undefined ? data.inflation : 2.5;
        this.unemployment = data.unemployment !== undefined ? data.unemployment : 5.0;
        this.techLevel = data.techLevel !== undefined ? data.techLevel : 50;
        this.color = data.color || '#6b7280';
        this.flagColor = data.flagColor || '#4a5a70';

        this.relations = new Map();          // tag -> число (-100..100)
        this.allies = new Set();
        this.enemies = new Set();

        this.modifiers = new Map();          // временные модификаторы
        this.flags = new Set();              // флаги состояния
    }

    setRelation(tag, value) {
        value = Math.max(-100, Math.min(100, value));
        this.relations.set(tag, value);
        if (value >= 60) this.allies.add(tag);
        else this.allies.delete(tag);
        if (value <= -60) this.enemies.add(tag);
        else this.enemies.delete(tag);
    }

    getRelation(tag) { return this.relations.get(tag) ?? 0; }

    addModifier(id, data) { this.modifiers.set(id, data); }
    removeModifier(id) { this.modifiers.delete(id); }

    getModifiedStability() {
        let val = this.stability;
        this.modifiers.forEach(m => { if (m.stability) val += m.stability; });
        return Math.max(0, Math.min(100, Math.round(val)));
    }

    getModifiedGDP() {
        let val = this.gdp;
        this.modifiers.forEach(m => { if (m.gdpPct) val *= (1 + m.gdpPct / 100); });
        return Math.max(0, Math.round(val));
    }
}

export { Country };
