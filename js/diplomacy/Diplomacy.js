/**
 * Diplomacy.js — дипломатическая система (Этап 3).
 * Управляет отношениями между странами, союзами, войнами, торговыми соглашениями, санкциями.
 */
var Diplomacy = (function() {
    function Diplomacy() {
        this.alliances = new Map();   // "TAGA-TAGB" -> true
        this.wars = new Map();        // "TAGA-TAGB" -> { started: date }
        this.tradeAgreements = new Map(); // "TAGA-TAGB" -> true
        this.sanctions = new Map();   // "TAGA-TAGB" -> true
    }

    // Ключ пары стран в каноничном порядке
    Diplomacy.prototype._pairKey = function(tagA, tagB) {
        return tagA < tagB ? tagA + '-' + tagB : tagB + '-' + tagA;
    };

    // Получить отношение страны A к стране B
    Diplomacy.prototype.getRelation = function(state, tagA, tagB) {
        var ca = state.countries.get(tagA);
        if (!ca) return 0;
        return ca.getRelation(tagB);
    };

    // Установить отношение (двусторонне)
    Diplomacy.prototype.setRelation = function(state, tagA, tagB, value) {
        var ca = state.countries.get(tagA);
        var cb = state.countries.get(tagB);
        if (!ca || !cb) return;
        ca.setRelation(tagB, value);
        cb.setRelation(tagA, value);
        eventBus.emit('diplomacy:relationChanged', { tagA: tagA, tagB: tagB, value: value });
    };

    // Изменить отношение на дельту
    Diplomacy.prototype.changeRelation = function(state, tagA, tagB, delta) {
        var ca = state.countries.get(tagA);
        var cb = state.countries.get(tagB);
        if (!ca || !cb) return;
        var current = ca.getRelation(tagB);
        this.setRelation(state, tagA, tagB, current + delta);
    };

    // Объявить войну
    Diplomacy.prototype.declareWar = function(state, attacker, defender) {
        this.setRelation(state, attacker, defender, -100);
        this.wars.set(this._pairKey(attacker, defender), {
            attacker: attacker,
            defender: defender,
            started: state.getDateString()
        });
        // Прекращаем союз и торговлю при войне
        this.alliances.delete(this._pairKey(attacker, defender));
        this.tradeAgreements.delete(this._pairKey(attacker, defender));
        eventBus.emit('diplomacy:warDeclared', {
            attacker: attacker,
            defender: defender,
            date: state.getDateString()
        });
        state.addLog(attacker + ' объявила войну ' + defender);
    };

    // Заключить мир
    Diplomacy.prototype.makePeace = function(state, tagA, tagB) {
        var key = this._pairKey(tagA, tagB);
        this.wars.delete(key);
        this.setRelation(state, tagA, tagB, -20); // после войны отношения плохие
        eventBus.emit('diplomacy:peaceMade', { tagA: tagA, tagB: tagB, date: state.getDateString() });
        state.addLog(tagA + ' и ' + tagB + ' заключили мир');
    };

    // Создать союз
    Diplomacy.prototype.formAlliance = function(state, tagA, tagB) {
        this.alliances.set(this._pairKey(tagA, tagB), true);
        this.changeRelation(state, tagA, tagB, 25);
        eventBus.emit('diplomacy:allianceFormed', { tagA: tagA, tagB: tagB, date: state.getDateString() });
        state.addLog(tagA + ' и ' + tagB + ' заключили союз');
    };

    // Разорвать союз
    Diplomacy.prototype.breakAlliance = function(state, tagA, tagB) {
        this.alliances.delete(this._pairKey(tagA, tagB));
        this.changeRelation(state, tagA, tagB, -30);
        eventBus.emit('diplomacy:allianceBroken', { tagA: tagA, tagB: tagB });
        state.addLog(tagA + ' разорвала союз с ' + tagB);
    };

    // Торговое соглашение
    Diplomacy.prototype.formTradeAgreement = function(state, tagA, tagB) {
        this.tradeAgreements.set(this._pairKey(tagA, tagB), true);
        this.changeRelation(state, tagA, tagB, 15);
        eventBus.emit('diplomacy:tradeAgreement', { tagA: tagA, tagB: tagB });
        state.addLog(tagA + ' и ' + tagB + ' подписали торговое соглашение');
    };

    // Санкции
    Diplomacy.prototype.imposeSanctions = function(state, tagA, tagB) {
        this.sanctions.set(this._pairKey(tagA, tagB), true);
        this.changeRelation(state, tagA, tagB, -40);
        eventBus.emit('diplomacy:sanctions', { tagA: tagA, tagB: tagB });
        state.addLog(tagA + ' ввела санкции против ' + tagB);
    };

    // Являются ли страны в войне
    Diplomacy.prototype.isAtWar = function(state, tagA, tagB) {
        return this.wars.has(this._pairKey(tagA, tagB));
    };

    // Являются ли страны союзниками
    Diplomacy.prototype.areAllies = function(state, tagA, tagB) {
        return this.alliances.has(this._pairKey(tagA, tagB));
    };

    // Есть ли торговое соглашение
    Diplomacy.prototype.hasTradeAgreement = function(state, tagA, tagB) {
        return this.tradeAgreements.has(this._pairKey(tagA, tagB));
    };

    return Diplomacy;
})();
