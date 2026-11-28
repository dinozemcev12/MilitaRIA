type EventCallback<T = unknown> = (data: T) => void;

interface EventSubscription {
  unsubscribe: () => void;
}

export class EventBus {
  private static instance: EventBus;
  private events: Map<string, Set<EventCallback>> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  on<T>(event: string, callback: EventCallback<T>): EventSubscription {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback as EventCallback<unknown>);

    return {
      unsubscribe: () => this.off(event, callback as EventCallback<unknown>)
    };
  }

  off<T>(event: string, callback: EventCallback<T>): void {
    this.events.get(event)?.delete(callback as EventCallback<unknown>);
  }

  emit<T>(event: string, data: T): void {
    this.events.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  once<T>(event: string, callback: EventCallback<T>): EventSubscription {
    const wrapper = (data: T) => {
      callback(data);
      subscription.unsubscribe();
    };
    const subscription = this.on(event, wrapper);
    return subscription;
  }

  clear(): void {
    this.events.clear();
  }
}

export const eventBus = EventBus.getInstance();

export const GameEvents = {
  // Time
  TIME_TICK: 'time:tick',
  TIME_SPEED_CHANGED: 'time:speed_changed',
  TIME_PAUSED: 'time:paused',
  TIME_RESUMED: 'time:resumed',

  // Country
  COUNTRY_SELECTED: 'country:selected',
  COUNTRY_DATA_CHANGED: 'country:data_changed',

  // Map
  MAP_MODE_CHANGED: 'map:mode_changed',
  MAP_ZOOM_CHANGED: 'map:zoom_changed',
  MAP_PAN: 'map:pan',
  PROVINCE_HOVER: 'map:province_hover',
  PROVINCE_CLICK: 'map:province_click',

  // Politics
  GOVERNMENT_CHANGED: 'politics:government_changed',
  MINISTER_APPOINTED: 'politics:minister_appointed',
  LAW_PASSED: 'politics:law_passed',
  ELECTION_STARTED: 'politics:election_started',
  STABILITY_CHANGED: 'politics:stability_changed',

  // Economy
  BUDGET_UPDATED: 'economy:budget_updated',
  GDP_CHANGED: 'economy:gdp_changed',
  RESOURCE_CHANGED: 'economy:resource_changed',
  TRADE_DEAL_SIGNED: 'economy:trade_deal_signed',

  // Diplomacy
  RELATION_CHANGED: 'diplomacy:relation_changed',
  ALLIANCE_FORMED: 'diplomacy:alliance_formed',
  WAR_DECLARED: 'diplomacy:war_declared',
  PEACE_SIGNED: 'diplomacy:peace_signed',
  SANCTIONS_IMPOSED: 'diplomacy:sanctions_imposed',

  // Military
  UNIT_CREATED: 'military:unit_created',
  UNIT_MOVED: 'military:unit_moved',
  UNIT_MERGED: 'military:unit_merged',
  UNIT_SPLIT: 'military:unit_split',
  BATTLE_STARTED: 'military:battle_started',
  BATTLE_ENDED: 'military:battle_ended',
  SUPPLY_CHANGED: 'military:supply_changed',
  CITY_CAPTURED: 'military:city_captured',
  COUNTRY_CAPITULATED: 'diplomacy:country_capitulated',
  UNIT_STANCE_CHANGED: 'military:unit_stance_changed',
  OFFENSIVE_LINE_SET: 'military:offensive_line_set',

  // Territory / front line
  TERRITORY_CAPTURED: 'territory:captured',
  TERRITORY_UPDATED: 'territory:updated',
  FRONT_CHANGED: 'territory:front_changed',

  // Tactical
  TACTICAL_MODE_ENTER: 'tactical:enter',
  TACTICAL_MODE_EXIT: 'tactical:exit',
  TACTICAL_ORDER_ISSUED: 'tactical:order_issued',
  TACTICAL_UNIT_SELECTED: 'tactical:unit_selected',

  // Events
  RANDOM_EVENT_TRIGGERED: 'events:random_triggered',
  EVENT_CHAIN_ADVANCED: 'events:chain_advanced',
  EVENT_OPTION_CHOSEN: 'events:option_chosen',

  // AI
  AI_DECISION_MADE: 'ai:decision_made',

  // Stage 7: Tech, Production, Logistics, Intel
  TECH_STARTED: 'tech:started',
  TECH_COMPLETED: 'tech:completed',
  PRODUCTION_STARTED: 'production:started',
  PRODUCTION_COMPLETED: 'production:completed',
  FACTORY_BUILT: 'production:factory_built',
  LOGISTICS_UPDATED: 'logistics:updated',
  INTEL_GATHERED: 'intel:gathered',
  AI_STRATEGY_CHANGED: 'ai:strategy_changed',

  // UI
  PANEL_OPENED: 'ui:panel_opened',
  PANEL_CLOSED: 'ui:panel_closed',
  NOTIFICATION_ADD: 'ui:notification_add',
  TOOLTIP_SHOW: 'ui:tooltip_show',
  TOOLTIP_HIDE: 'ui:tooltip_hide',

  // Save
  GAME_SAVED: 'save:game_saved',
  GAME_LOADED: 'save:game_loaded',
  AUTOSAVE: 'save:autosave'
} as const;