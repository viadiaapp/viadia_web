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
  time: string;
  lat: number;
  lng: number;
  address: string;
  attachments?: AttachmentItem[];
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
  amount: number;
  category: string;
  paidBy: string;
  splitType: 'equal' | 'custom';
  splits: Split[];
  placeId: string | null;
  date: string;
  paymentType?: string;
  spendAmount?: number;
  spendCurrency?: string;
  exchangeRate?: number;
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
  countries: string[];
  miles: number;
  travelers: string[];
  timeline: Place[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  budgetLimit?: number;
  paymentTypes?: string[];
  categories?: string[];
  checklistCategories?: string[];
  baseCurrency?: string;
  currencies?: string[];
  exchangeRates?: { [currency: string]: number };
  ownerUid?: string;
  allowOthersToModify?: boolean;
  isJoined?: boolean;

  enableHotelDailyStops?: boolean;
  hotelDailyStartTime?: string;
  hotelDailyEndTime?: string;
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
  id: string;
  name: string;
  type: SubscriptionTierType;
  durationYears: number;
  originalPrice: number;
  discountedPrice: number;
  currency: string;
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
  adTier?: boolean;
  userTier?: SubscriptionTierType | 'lifetime' | 'free';
  sub_start_date?: string;
  sub_end_date?: string;
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
  defaultCurrency?: string;
  temperatureUnit?: 'C' | 'F';
  distanceUnit?: 'km' | 'miles';
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