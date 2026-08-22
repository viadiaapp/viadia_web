import { UserConfig } from '../types';
import { getUserConfig, saveUserConfig } from './db';

export const PREF_EVENTS = {
  PREFERENCES_CHANGED: 'viadia_preferences_changed',
  CURRENCY_CHANGED: 'viadia_currency_changed',
};

export function getDefaultCurrency(): string {
  if (typeof window === 'undefined') return 'USD';
  return (localStorage.getItem('viadia_default_currency') || 'USD').toUpperCase().trim();
}

export function getTemperatureUnit(): 'C' | 'F' {
  if (typeof window === 'undefined') return 'C';
  return (localStorage.getItem('temp-unit') as 'C' | 'F') || 'C';
}

export function getDistanceUnit(): 'km' | 'miles' {
  if (typeof window === 'undefined') return 'km';
  return (localStorage.getItem('distance-unit') as 'km' | 'miles') || 'km';
}

export interface UserPreferences {
  defaultCurrency: string;
  temperatureUnit: 'C' | 'F';
  distanceUnit: 'km' | 'miles';
}

export function getAllUserPreferences(): UserPreferences {
  return {
    defaultCurrency: getDefaultCurrency(),
    temperatureUnit: getTemperatureUnit(),
    distanceUnit: getDistanceUnit(),
  };
}

/**
 * Updates user preferences in both localStorage and Firestore DB (under user_configs table)
 */
export async function setUserPreferences(
  prefs: Partial<UserPreferences>,
  userCodeParam?: string | null
): Promise<void> {
  if (typeof window === 'undefined') return;

  const currentCurrency = getDefaultCurrency();
  const currentTemp = getTemperatureUnit();
  const currentDistance = getDistanceUnit();

  const nextCurrency = prefs.defaultCurrency ? prefs.defaultCurrency.toUpperCase().trim() : currentCurrency;
  const nextTemp = prefs.temperatureUnit || currentTemp;
  const nextDistance = prefs.distanceUnit || currentDistance;

  if (prefs.defaultCurrency) {
    localStorage.setItem('viadia_default_currency', nextCurrency);
  }
  if (prefs.temperatureUnit) {
    localStorage.setItem('temp-unit', nextTemp);
  }
  if (prefs.distanceUnit) {
    localStorage.setItem('distance-unit', nextDistance);
  }

  // Notify listeners across the app
  window.dispatchEvent(
    new CustomEvent(PREF_EVENTS.PREFERENCES_CHANGED, {
      detail: {
        defaultCurrency: nextCurrency,
        temperatureUnit: nextTemp,
        distanceUnit: nextDistance,
      },
    })
  );
  window.dispatchEvent(new Event('storage'));

  // Sync to database under user_configs
  const resolvedUserCode =
    userCodeParam || localStorage.getItem('viadia_user_code') || '';

  if (resolvedUserCode && !resolvedUserCode.startsWith('guest_')) {
    try {
      const existingConfig = await getUserConfig(resolvedUserCode);
      const updatedConfig: UserConfig = {
        userCode: resolvedUserCode,
        globalChecklist: existingConfig?.globalChecklist || [],
        defaultCurrency: nextCurrency,
        temperatureUnit: nextTemp,
        distanceUnit: nextDistance,
        updatedAt: new Date().toISOString(),
      };
      await saveUserConfig(resolvedUserCode, updatedConfig);
    } catch (err) {
      console.warn('Failed to sync user preferences to user_configs in DB:', err);
    }
  }
}

/**
 * Loads preferences from remote Firestore UserConfig and caches into localStorage
 */
export function syncPreferencesFromConfig(config: UserConfig | null) {
  if (!config || typeof window === 'undefined') return;

  let changed = false;

  if (config.defaultCurrency && config.defaultCurrency.trim()) {
    const cur = config.defaultCurrency.toUpperCase().trim();
    if (localStorage.getItem('viadia_default_currency') !== cur) {
      localStorage.setItem('viadia_default_currency', cur);
      changed = true;
    }
  }

  if (config.temperatureUnit && (config.temperatureUnit === 'C' || config.temperatureUnit === 'F')) {
    if (localStorage.getItem('temp-unit') !== config.temperatureUnit) {
      localStorage.setItem('temp-unit', config.temperatureUnit);
      changed = true;
    }
  }

  if (config.distanceUnit && (config.distanceUnit === 'km' || config.distanceUnit === 'miles')) {
    if (localStorage.getItem('distance-unit') !== config.distanceUnit) {
      localStorage.setItem('distance-unit', config.distanceUnit);
      changed = true;
    }
  }

  if (changed) {
    window.dispatchEvent(
      new CustomEvent(PREF_EVENTS.PREFERENCES_CHANGED, {
        detail: getAllUserPreferences(),
      })
    );
    window.dispatchEvent(new Event('storage'));
  }
}