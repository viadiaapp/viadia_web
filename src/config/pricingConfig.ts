import pricingData from './pricing.json';

export interface PricingConfig {
  amount: number;
  currency: string;
  currencySymbol: string;
  originalAmount: number;
  discountBadge: string;
  tierName: string;
  billingLabel: string;
}

export const LIFETIME_PASS_CONFIG: PricingConfig = pricingData.lifetimePass;

export function getFormattedPrice(amount: number = LIFETIME_PASS_CONFIG.amount, symbol: string = LIFETIME_PASS_CONFIG.currencySymbol): string {
  return `${symbol}${amount.toFixed(2)}`;
}

export function getFormattedOriginalPrice(amount: number = LIFETIME_PASS_CONFIG.originalAmount, symbol: string = LIFETIME_PASS_CONFIG.currencySymbol): string {
  return `${symbol}${amount.toFixed(2)}`;
}
