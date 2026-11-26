/**
 * Economy.js — экономическая система (Этап 2).
 * Расчёт бюджета, налогов, ВВП, инфляции, безработицы, долга, казна.
 */
var Economy = (function() {
    function Economy() {
        this.taxRateDefault = 25;      // базовая налоговая ставка %
        this.spendingSocialPct = 15;   // соц.расходы % ВВП
        this.interestRate = 3.5;       // процент по долгу %
    }

    Economy.prototype.calculate = function(country) {
        // === ДОХОДЫ ===
        var taxIncome = country.gdp * (country.taxRate / 100);
        var income = taxIncome;

        // === РАСХОДЫ ===
        var militaryExp = country.militaryBudget;          // уже в млрд
        var socialExp = country.gdp * (this.spendingSocialPct / 100);
        var debtService = country.debt * (this.interestRate / 100);
        var expenses = militaryExp + socialExp + debtService;

        // === БАЛАНС ===
        var balance = income - expenses;

        country.treasury += balance;

        if (balance < 0) {
            country.debt += -balance;                      // дефицит -> долг
        } else {
            country.debt = Math.max(0, country.debt - balance * 0.5); // погашение долга
        }

        // === ВВП (рост зависит от стабильности, коррупции, налогов) ===
        var gdpGrowth = 2.0;
        gdpGrowth -= country.corruption * 0.02;
        gdpGrowth += (country.politicalStability - 50) * 0.04;
        gdpGrowth -= (country.taxRate - 25) * 0.1;         // высокие налоги тормозят рост
        country.gdp = Math.max(0, country.gdp * (1 + gdpGrowth / 100));

        // === ИНФЛЯЦИЯ ===
        country.inflation += (balance < 0 ? 0.4 : -0.15);
        country.inflation = Math.max(-5, Math.min(60, country.inflation));

        // === БЕЗРАБОТИЦА ===
        country.unemployment += (50 - country.politicalStability) * 0.04;
        country.unemployment += country.inflation * 0.1;
        country.unemployment = Math.max(1, Math.min(35, country.unemployment));

        // === УРОВЕНЬ ЖИЗНИ (производная) ===
        country.livingStandard = Math.max(0, Math.min(100,
            Math.round(50 + (country.politicalStability - 50) * 0.5 - country.unemployment * 0.8 - country.inflation * 0.5)
        ));

        eventBus.emit('economy:calculated', {
            country: country,
            income: income,
            expenses: expenses,
            balance: balance,
            gdp: country.gdp,
            inflation: country.inflation,
            unemployment: country.unemployment
        });

        return {
            income: income,
            expenses: expenses,
            balance: balance,
            gdp: country.gdp,
            inflation: country.inflation,
            unemployment: country.unemployment,
            treasury: country.treasury,
            debt: country.debt
        };
    };

    return Economy;
})();
