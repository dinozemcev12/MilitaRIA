import { gameLoop } from './core/GameLoop.js';
import { gameTime } from './core/GameTime.js';
import { saveSystem } from './core/SaveSystem.js';
import { eventBus, GameEvents } from './core/EventBus.js';
import { WorldMapSystem } from './world/WorldMapSystem.js';
import { CountrySystem } from './country/CountrySystem.js';
import { PoliticsSystem } from './politics/PoliticsSystem.js';
import { EconomySystem } from './economy/EconomySystem.js';
import { DiplomacySystem } from './diplomacy/DiplomacySystem.js';
import { MilitarySystem } from './military/MilitarySystem.js';
import { TacticalSystem } from './tactical/TacticalSystem.js';
import { EventsSystem } from './events/EventsSystem.js';
import { AISystem } from './ai/AISystem.js';
import { TechnologySystem } from './tech/TechnologySystem.js';
import { ProductionSystem } from './production/ProductionSystem.js';
import { LogisticsSystem } from './logistics/LogisticsSystem.js';
import { IntelSystem } from './intel/IntelSystem.js';
import { UISystem } from './ui/UISystem.js';
import { initCountryData } from './data/countries.js';

async function main(): Promise<void> {
  console.log('%c🎖 MilitaRIA — Grand Strategy & Tactical Warfare', 'color:#3fb950;font-size:16px;font-weight:bold');
  console.log('%cStarting up...', 'color:#768390');

  initCountryData();

  gameLoop.registerSystem({ name: 'WorldMap',  priority: 10,  init: () => WorldMapSystem.getInstance().init(),  update: (dt) => WorldMapSystem.getInstance().update(dt),  shutdown: () => WorldMapSystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Country',   priority: 20,  init: () => CountrySystem.getInstance().init(),   update: (dt) => CountrySystem.getInstance().update(dt),   shutdown: () => CountrySystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Politics',  priority: 30,  init: () => PoliticsSystem.getInstance().init(),  update: (dt) => PoliticsSystem.getInstance().update(dt),  shutdown: () => PoliticsSystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Economy',   priority: 40,  init: () => EconomySystem.getInstance().init(),   update: (dt) => EconomySystem.getInstance().update(dt),   shutdown: () => EconomySystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Technology',priority: 45,  init: () => TechnologySystem.getInstance().init(),update: (dt) => TechnologySystem.getInstance().update(dt),shutdown: () => TechnologySystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Production',priority: 48,  init: () => ProductionSystem.getInstance().init(),update: (dt) => ProductionSystem.getInstance().update(dt),shutdown: () => ProductionSystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Diplomacy', priority: 50,  init: () => DiplomacySystem.getInstance().init(), update: (dt) => DiplomacySystem.getInstance().update(dt), shutdown: () => DiplomacySystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Logistics', priority: 55,  init: () => LogisticsSystem.getInstance().init(), update: (dt) => LogisticsSystem.getInstance().update(dt), shutdown: () => LogisticsSystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Military',  priority: 60,  init: () => MilitarySystem.getInstance().init(),  update: (dt) => MilitarySystem.getInstance().update(dt),  shutdown: () => MilitarySystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Intel',     priority: 65,  init: () => IntelSystem.getInstance().init(),     update: (dt) => IntelSystem.getInstance().update(dt),     shutdown: () => IntelSystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Tactical',  priority: 70,  init: () => TacticalSystem.getInstance().init(),  update: (dt) => TacticalSystem.getInstance().update(dt),  shutdown: () => TacticalSystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'Events',    priority: 80,  init: () => EventsSystem.getInstance().init(),    update: (dt) => EventsSystem.getInstance().update(dt),    shutdown: () => EventsSystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'AI',        priority: 90,  init: () => AISystem.getInstance().init(),        update: (dt) => AISystem.getInstance().update(dt),        shutdown: () => AISystem.getInstance().shutdown() });
  gameLoop.registerSystem({ name: 'UI',        priority: 100, init: () => UISystem.getInstance().init(),        update: (dt) => UISystem.getInstance().update(dt),        shutdown: () => UISystem.getInstance().shutdown() });

  saveSystem.init();

  // Глобальные горячие клавиши
  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        gameTime.togglePause();
        break;
      case 'Digit1': gameTime.setSpeed(1); break;
      case 'Digit2': gameTime.setSpeed(2); break;
      case 'Digit3': gameTime.setSpeed(4); break;
      case 'Digit4': gameTime.setSpeed(4); break;
      case 'Digit5': gameTime.setSpeed(8); break;
      case 'KeyF5':
        e.preventDefault();
        if (saveSystem.save(1)) UISystem.getInstance().showNotification('Сохранено в слот 1', 'success');
        break;
      case 'KeyF9':
        e.preventDefault();
        if (saveSystem.load(1)) UISystem.getInstance().showNotification('Загружено из слота 1', 'info');
        break;
    }
  });

  try {
    await gameLoop.init();
    gameLoop.start();
    console.log('%c✅ MilitaRIA запущена. Горячие клавиши: Пробел=пауза, 1-5=скорость, F5=сохранить, F9=загрузить', 'color:#3fb950');
  } catch (error) {
    console.error('%c❌ Ошибка запуска:', 'color:#f85149', error);
  }
}

window.addEventListener('error', (e) => console.error('Uncaught:', e.error));
window.addEventListener('unhandledrejection', (e) => console.error('Rejection:', e.reason));

main();

// Экспорт для DevTools
export { gameLoop, gameTime, saveSystem, eventBus, GameEvents };
