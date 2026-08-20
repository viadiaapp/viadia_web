import appConfigData from './appConfig.json';

export interface AppConfig {
  supportEmail: string;
  appName: string;
  adSenseClientId?: string;
  adSenseSlotId?: string;
}

export const APP_CONFIG: AppConfig = appConfigData;
export const SUPPORT_EMAIL = APP_CONFIG.supportEmail;
export const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID || APP_CONFIG.adSenseClientId || 'ca-pub-3940256099942544';
export const ADSENSE_SLOT_ID = import.meta.env.VITE_ADSENSE_SLOT_ID || APP_CONFIG.adSenseSlotId || '6300978111';

