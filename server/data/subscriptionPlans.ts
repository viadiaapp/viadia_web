// Default subscription plans, seeded into Firestore's `subscription_types` collection the first
// time it's read empty. Kept as a standalone copy (not imported from ../../src) so server/ has zero
// dependencies outside itself. Field names match src/types.ts#SubscriptionPlan exactly.
export interface SubscriptionPlanSeed {
  planId: string;
  planName: string;
  durationYears: number;
  originalPrice: number;
  discountedPrice: number;
  currency: string;
  description?: string;
  badge?: string;
  popular?: boolean;
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanSeed[] = [
  {
    planId: '1_year',
    planName: '1 Year Pro',
    durationYears: 1,
    originalPrice: 1.99,
    discountedPrice: 1.00,
    currency: 'USD',
    description: '1 Year of Ad-Free experience with full pro features.',
    badge: 'Starter',
    popular: false,
  },
  {
    planId: '2_year',
    planName: '2 Year Pro',
    durationYears: 2,
    originalPrice: 3.49,
    discountedPrice: 1.80,
    currency: 'USD',
    description: '2 Years of uninterrupted travel planning and budgeting.',
    badge: 'Flexible',
    popular: false,
  },
  {
    planId: '3_year',
    planName: '3 Year Pro',
    durationYears: 3,
    originalPrice: 4.99,
    discountedPrice: 2.50,
    currency: 'USD',
    description: '3 Years of complete ad-free multi-destination travel tracking.',
    badge: 'Most Popular',
    popular: true,
  },
  {
    planId: '5_year',
    planName: '5 Year Pro',
    durationYears: 5,
    originalPrice: 7.99,
    discountedPrice: 3.99,
    currency: 'USD',
    description: '5 Years of peace of mind with continuous sync and offline perks.',
    badge: 'Super Saver',
    popular: false,
  },
  {
    planId: 'lifetime',
    planName: 'Lifetime Pro',
    durationYears: 99,
    originalPrice: 14.99,
    discountedPrice: 7.99,
    currency: 'USD',
    description: 'One-time payment for lifetime access (valid through 2099-12-31).',
    badge: 'Best Value',
    popular: false,
  },
];
