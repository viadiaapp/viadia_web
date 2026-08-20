export interface AttachmentItem {
  id: string;
  name: string;
  data: string;
  type?: 'image' | 'pdf' | string;
  size?: number;
  createdAt?: string;
}

export interface Place {
  id: string;
  title: string;
  description: string;
  time: string; // Date or text representing when
  lat: number;
  lng: number;
  address: string;
  attachments?: AttachmentItem[];
  // Extended properties for Transportation or attachments
  isTransportation?: boolean;
  isTransport?: boolean;
  transportType?: 'Flight' | 'Train' | 'Bus' | 'Ferry' | 'Car' | 'Other';
  from?: string;
  to?: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
  boardingTime?: string;
  arrivalTime?: string;
  carrier?: string;
  refNumber?: string;
  transportDesc?: string;
  ticketAttachment?: string;
  ticketAttachmentData?: string;
  attachment?: any;
  attachmentData?: string;
  attachmentName?: string;
  fromLocation?: string;
  toLocation?: string;
  departureTime?: string;
  bookingRef?: string;
  seatNum?: string;
  confirmationNum?: string;

  // Extended properties for Stay / Accommodation
  isStay?: boolean;
  hotelName?: string;
  checkInTime?: string;
  checkOutTime?: string;
  stayAddress?: string;
  stayLat?: number;
  stayLng?: number;
  stayAttachment?: string;
  stayAttachmentData?: string;
  stayDesc?: string;

  // Auto Daily Hotel Start & End Stop properties
  isDailyHotelStop?: boolean;
  isAutoDailyHotelStop?: boolean;
  hotelStopType?: 'start' | 'end';
  linkedStayId?: string;
  isCustomized?: boolean;
}

export interface Split {
  traveler: string;
  amount: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number; // Stored in trip's Base Currency
  category: string; // Dynamic custom categories
  paidBy: string; // traveler name
  splitType: 'equal' | 'custom';
  splits: Split[];
  placeId: string | null; // Tagged to a place in the timeline
  date: string;
  paymentType?: string; // Customizable payment types (e.g. credit card name, Cash)
  spendAmount?: number; // Original amount in local currency
  spendCurrency?: string; // Original currency (e.g. SGD, INR)
  exchangeRate?: number; // Forex exchange rate for this transaction
  type?: 'expense' | 'forex' | 'peer_transfer';
  forexToCurrency?: string;
  forexToAmount?: number;
  attachments?: AttachmentItem[];
  receiptAttachment?: string;
  receiptAttachmentData?: string;
  receiptName?: string;
  receiptData?: string;
  transferTo?: string;
}

export interface ChecklistItem {
  id: string;
  task: string;
  checked: boolean;
  category: string;
}

export interface Trip {
  id: string;
  code?: string;
  title: string;
  description: string;
  status: 'planned' | 'completed' | 'active' | 'cancelled';
  startDate: string;
  endDate: string;
  countries: string[]; // List of country names or ISO codes
  miles: number;
  travelers: string[]; // Master list of people
  timeline: Place[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  // New customizable properties
  budgetLimit?: number;
  paymentTypes?: string[]; // e.g. ['Cash', 'Chase Sapphire', 'Amex']
  categories?: string[]; // e.g. ['Food', 'Airline Tickets', 'Accommodation', 'Visa Fee', 'Shopping', 'Other']
  checklistCategories?: string[]; // e.g. ['Packing', 'Documents', 'Bookings', 'Other']
  baseCurrency?: string; // e.g. 'USD'
  currencies?: string[]; // e.g. ['USD', 'SGD', 'INR']
  exchangeRates?: { [currency: string]: number }; // Rate relative to base (e.g. { 'SGD': 1.34, 'INR': 83.0 })
  ownerUid?: string;
  allowOthersToModify?: boolean;
  isJoined?: boolean;

  // Daily Hotel Start & End Settings
  enableHotelDailyStops?: boolean;
  hotelDailyStartTime?: string; // e.g. "09:00"
  hotelDailyEndTime?: string; // e.g. "21:00"
  removedDailyHotelStopIds?: string[];
  updatedAt?: string;
}

export interface AppData {
  trips: { [id: string]: Trip };
  globalChecklist: ChecklistItem[];
}

export type ColorTheme = 'indigo' | 'emerald' | 'amber' | 'rose' | 'ocean' | 'teal' | 'violet' | 'midnight' | 'monalisa' | 'bright-lilac' | 'persian-pink';

export type SubscriptionTierType = '1_year' | '2_year' | '3_year' | '5_year' | 'lifetime' | 'free';

export interface SubscriptionPlan {
  id: string; // '1_year' | '2_year' | '3_year' | '5_year' | 'lifetime'
  name: string;
  type: SubscriptionTierType;
  durationYears: number;
  originalPrice: number;
  discountedPrice: number;
  currency: string; // "USD"
  description?: string;
  badge?: string;
  popular?: boolean;
}

export interface SubscriptionTransaction {
  id?: string;
  transactionId: string;
  userCode: string;
  uid?: string;
  userEmail?: string | null;
  userName?: string;
  planId: string;
  planName: string;
  planType: SubscriptionTierType;
  durationYears: number;
  amountPaid: number;
  originalPrice: number;
  currency: string;
  planStartDate: string;
  planEndDate: string;
  paymentMethod: string;
  orderId: string;
  status: 'completed' | 'pending' | 'refunded' | 'failed';
  createdAt: string;
}

export interface UserDetails {
  uid: string;
  email: string | null;
  name: string;
  userCode: string | null;
  authProvider?: 'google' | 'apple' | 'email-otp' | 'guest' | 'email-magic-link';
  adTier?: boolean; // true = ad-free subscription active, false = free tier
  userTier?: SubscriptionTierType | 'lifetime' | 'free';
  sub_start_date?: string; // ISO date string e.g. "2026-08-17T..."
  sub_end_date?: string; // ISO date string e.g. "2027-08-17T..." or "2099-12-31"
  subscription_tier?: SubscriptionTierType;
  createdAt?: any;
}

export interface SeriesCodeCounter {
  SERIES_CODE: string;
  SERIES_NUMBER: number;
  updatedAt?: string;
}

export interface UserConfig {
  userCode: string;
  globalChecklist: ChecklistItem[];
  updatedAt?: any;
}

export interface DeletedUserDetails extends UserDetails {
  deletedAt: string;
}

export interface UserTripcodeMaster {
  userCode: string;
  tripCodes: string[];
}

export interface TripMaster {
  tripCode: string;
  ownerUid: string;
  allowOthersToModify: boolean;
}

export interface StylingItem {
  id: string;
  title: string;
  category?: string;
  notes?: string;
  checked?: boolean;
  imageUrl?: string;
}

export interface TripStylingData {
  days?: {
    [dayKey: string]: StylingItem[];
  };
}

export interface TripGclistStyling {
  tripCode: string;
  dataList: [ChecklistItem[], TripStylingData];
  gclist?: ChecklistItem[];
  styling?: TripStylingData;
  updatedAt?: string;
}


