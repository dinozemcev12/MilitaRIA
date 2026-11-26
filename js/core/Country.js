/**
 * Country.js — глубокая симуляция государства.
 * Экономика, политика, армия, дипломатия, население, технологии.
 */
class Country {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.nameEn = data.nameEn;
        this.capital = data.capital;
        this.region = data.region;
        this.color = data.color || '#6b7280';
        this.flagColor = data.flagColor || data.color || '#4a5a70';
        
        // География
        this.provinces = data.provinces || []; // IDs провинций
        this.borders = data.borders || []; // IDs соседних стран
        
        // Демография
        this.population = data.population || 0;
        this.manpower = data.manpower || Math.floor(this.population * 0.02);
        this.manpowerMax = this.manpower;
        this.urbanization = data.urbanization || 0.5;
        this.literacy = data.literacy || 0.7;
        this.ethnicity = data.ethnicity || { [data.id]: 1.0 };
        
        // Экономика
        this.gdp = data.gdp || 0; // млрд USD
        this.gdpPerCapita = this.population > 0 ? this.gdp * 1e9 / this.population : 0;
        this.treasury = data.treasury || 0;
        this.debt = data.debt || 0;
        this.taxRate = data.taxRate || 0.25;
        this.inflation = data.inflation || 0.02;
        this.unemployment = data.unemployment || 0.05;
        this.industrialCapacity = data.industrialCapacity || 0; // 0-100
        this.resourceProduction = data.resourceProduction || {}; // oil, steel, rare_earth, etc
        
        // Бюджет
        this.budget = {
            military: data.militaryBudget || 0,
            education: 0,
            healthcare: 0,
            infrastructure: 0,
            research: 0,
            welfare: 0,
            administration: 0
        };
        
        // Политика
        this.governmentType = data.governmentType || 'democracy';
        this.ideology = data.ideology || 'centrist';
        this.rulingParty = data.rulingParty || 'Unity Party';
        this.oppositionParties = data.oppositionParties || [];
        this.stability = data.stability || 0.7; // 0-1
        this.legitimacy = data.legitimacy || 0.7;
        this.corruption = data.corruption || 0.3;
        this.politicalFreedom = data.politicalFreedom || 0.5;
        this.electionCycle = data.electionCycle || 4; // years
        this.nextElection = data.nextElection || 2004;
        
        // Министры
        this.ministers = {
            foreign: null,
            defense: null,
            economy: null,
            interior: null,
            intelligence: null
        };
        
        // Армия
        this.military = {
            doctrines: data.doctrines || [],
            experience: 0,
            morale: 0.5,
            equipmentLevel: data.equipmentLevel || 1,
            nuclearCapability: data.nuclear || false,
            units: [], // ArmyUnit[]
            factories: data.militaryFactories || 0,
            dockyards: data.dockyards || 0,
            airfields: data.airfields || 0
        };
        
        // Технологии
        this.technology = {
            land: data.techLand || 1995,
            air: data.techAir || 1995,
            naval: data.techNaval || 1995,
            electronics: data.techElectronics || 1995,
            industry: data.techIndustry || 1995,
            nuclear: data.techNuclear || 0,
            space: data.techSpace || 0
        };
        
        // Дипломатия
        this.relations = new Map(); // countryId -> Relation
        this.alliances = new Set(); // alliance IDs
        this.wars = new Set(); // war IDs
        this.tradeAgreements = new Set();
        this.sanctions = new Set(); // sanctioning country IDs
        
        // Разведка
        this.intelligence = {
            agencies: data.intelAgencies || [],
            network: new Map(), // countryId -> infiltration level
            operations: []
        };
        
        // Внутреннее
        this.modifiers = new Map(); // временные модификаторы
        this.events = []; // активные события
        this.decisions = []; // доступные решения
        this.focus = null; // национальный фокус
    }

    // === Экономика ===
    calculateGDP() {
        let gdp = this.gdp;
        
        // Базовый рост
        let growth = 0.02; // 2% базовый
        
        // Факторы
        growth += (this.stability - 0.5) * 0.03; // стабильность
        growth -= this.corruption * 0.02; // коррупция
        growth -= (this.taxRate - 0.25) * 0.1; // налоги выше нормы
        growth += this.literacy * 0.01; // образованность
        growth += this.industrialCapacity / 10000; // промышленность
        
        // Ресурсы
        Object.values(this.resourceProduction).forEach(r => growth += r * 0.001);
        
        // Случайный фактор
        growth += (Math.random() - 0.5) * 0.01;
        
        gdp *= (1 + growth);
        this.gdp = Math.max(1, gdp);
        this.gdpPerCapita = this.population > 0 ? this.gdp * 1e9 / this.population : 0;
        
        return growth;
    }

    calculateBudget() {
        const revenue = this.gdp * this.taxRate * 0.15; // 15% от ВВП собирается как налоги
        const military = this.budget.military;
        const social = this.budget.education + this.budget.healthcare + this.budget.welfare;
        const other = this.budget.infrastructure + this.budget.research + this.budget.administration;
        const expenses = military + social + other;
        const deficit = revenue - expenses;
        
        this.treasury += deficit;
        
        if (this.treasury < 0) {
            this.debt += -this.treasury;
            this.treasury = 0;
        }
        
        // Обслуживание долга
        if (this.debt > 0) {
            const interest = this.debt * 0.05;
            this.treasury -= interest;
            if (this.treasury < 0) {
                this.debt += -this.treasury;
                this.treasury = 0;
            }
        }
        
        // Эффекты дефицита
        if (deficit < -revenue * 0.1) {
            this.inflation += 0.005;
            this.stability -= 0.001;
        }
        
        this.inflation = Math.max(-0.1, Math.min(2.0, this.inflation));
    }

    // === Политика ===
    updatePolitics() {
        // Стабильность дрейфует к базовой
        const baseStability = 0.5 + (this.legitimacy - 0.5) * 0.5 - this.corruption * 0.3;
        this.stability += (baseStability - this.stability) * 0.02;
        this.stability = Math.max(0, Math.min(1, this.stability));
        
        // Легитимность
        if (this.stability < 0.3) this.legitimacy -= 0.001;
        if (this.stability > 0.7) this.legitimacy += 0.0005;
        this.legitimacy = Math.max(0, Math.min(1, this.legitimacy));
        
        // Коррупция
        if (this.politicalFreedom > 0.7) this.corruption -= 0.0002;
        else this.corruption += 0.0001;
        this.corruption = Math.max(0, Math.min(1, this.corruption));
    }

    // === Армия ===
    getMilitaryStrength() {
        let strength = 0;
        this.military.units.forEach(u => {
            strength += u.strength * u.techLevel * u.morale;
        });
        return strength;
    }

    canProduceUnit(type) {
        const costs = {
            infantry: { mp: 1000, ic: 5, cost: 0.5 },
            armor: { mp: 500, ic: 20, cost: 3 },
            aircraft: { mp: 200, ic: 30, cost: 10 },
            ship: { mp: 1000, ic: 50, cost: 50 }
        };
        const c = costs[type];
        return this.manpower >= c.mp && this.industrialCapacity >= c.ic && this.treasury >= c.cost;
    }

    produceUnit(type, location) {
        if (!this.canProduceUnit(type)) return null;
        const c = { infantry: { mp: 1000, ic: 5, cost: 0.5 }, armor: { mp: 500, ic: 20, cost: 3 }, aircraft: { mp: 200, ic: 30, cost: 10 }, ship: { mp: 1000, ic: 50, cost: 50 } }[type];
        this.manpower -= c.mp;
        this.industrialCapacity -= c.ic;
        this.treasury -= c.cost;
        
        const unit = new ArmyUnit({
            id: `${this.id}_${type}_${Date.now()}`,
            type,
            country: this.id,
            location,
            strength: 1.0,
            morale: this.military.morale,
            techLevel: this.military.equipmentLevel,
            experience: 0
        });
        this.military.units.push(unit);
        return unit;
    }

    // === Дипломатия ===
    getRelation(otherId) {
        return this.relations.get(otherId) || { value: 0, opinion: 'neutral' };
    }

    setRelation(otherId, value) {
        value = Math.max(-100, Math.min(100, value));
        this.relations.set(otherId, { 
            value, 
            opinion: value > 50 ? 'friendly' : value < -50 ? 'hostile' : 'neutral',
            lastChange: Date.now()
        });
    }

    changeRelation(otherId, delta) {
        const current = this.getRelation(otherId).value;
        this.setRelation(otherId, current + delta);
    }

    // === Модификаторы ===
    addModifier(id, data) {
        this.modifiers.set(id, { ...data, startTime: Date.now() });
    }

    removeModifier(id) {
        this.modifiers.delete(id);
    }

    getModifierSum(key) {
        let sum = 0;
        this.modifiers.forEach(m => {
            if (m[key]) sum += m[key];
        });
        return sum;
    }

    // Сериализация
    serialize() {
        return {
            id: this.id,
            treasury: this.treasury,
            debt: this.debt,
            taxRate: this.taxRate,
            inflation: this.inflation,
            unemployment: this.unemployment,
            stability: this.stability,
            legitimacy: this.legitimacy,
            corruption: this.corruption,
            manpower: this.manpower,
            industrialCapacity: this.industrialCapacity,
            military: {
                morale: this.military.morale,
                equipmentLevel: this.military.equipmentLevel,
                units: this.military.units.map(u => u.serialize())
            },
            technology: this.technology,
            relations: Array.from(this.relations.entries()),
            alliances: Array.from(this.alliances),
            wars: Array.from(this.wars)
        };
    }

    deserialize(data) {
        Object.assign(this, data);
        this.relations = new Map(data.relations);
        this.alliances = new Set(data.alliances);
        this.wars = new Set(data.wars);
        if (data.military?.units) {
            this.military.units = data.military.units.map(u => {
                const unit = new ArmyUnit(u);
                return unit;
            });
        }
    }
}

class ArmyUnit {
    constructor(data) {
        this.id = data.id;
        this.type = data.type; // infantry, armor, aircraft, ship, special
        this.country = data.country;
        this.location = data.location; // province ID
        this.strength = data.strength || 1.0; // 0-1
        this.maxStrength = data.maxStrength || 1.0;
        this.morale = data.morale || 0.5;
        this.experience = data.experience || 0;
        this.techLevel = data.techLevel || 1;
        this.entrenchment = 0;
        this.supply = 1.0;
        this.commander = data.commander || null;
        this.mission = 'defend'; // defend, attack, move, patrol, reserve
        this.targetLocation = null;
        this.path = [];
        this.inCombat = false;
        this.combatTarget = null;
    }

    getCombatPower() {
        const typeMult = { infantry: 1, armor: 3, aircraft: 2, ship: 4, special: 5 }[this.type] || 1;
        return this.strength * this.techLevel * this.morale * (1 + this.experience * 0.1) * typeMult;
    }

    serialize() {
        return {
            id: this.id,
            type: this.type,
            country: this.country,
            location: this.location,
            strength: this.strength,
            maxStrength: this.maxStrength,
            morale: this.morale,
            experience: this.experience,
            techLevel: this.techLevel,
            entrenchment: this.entrenchment,
            supply: this.supply,
            mission: this.mission,
            targetLocation: this.targetLocation
        };
    }
}

window.Country = Country;
window.ArmyUnit = ArmyUnit;