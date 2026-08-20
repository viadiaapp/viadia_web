import { AppData } from '../types';

export const DEFAULT_APP_DATA: AppData = {
  trips: {},
  globalChecklist: [
  // Documents
  {
    id: 'doc-photo-id',
    task: 'Photo ID / Driving License',
    checked: false,
    category: 'Documents'
  },
  {
    id: 'doc-passport',
    task: 'Passport / Visa',
    checked: false,
    category: 'Documents'
  },
  {
    id: 'doc-boarding-pass',
    task: 'Boarding passes',
    checked: false,
    category: 'Documents'
  },
  {
    id: 'doc-confirmations',
    task: 'Booking confirmation receipts',
    checked: false,
    category: 'Documents'
  },
  {
    id: 'doc-emergency',
    task: 'Emergency documents (insurance, contacts, allergy list)',
    checked: false,
    category: 'Documents'
  },

  // Money
  {
    id: 'money-wallet',
    task: 'Wallet',
    checked: false,
    category: 'Money'
  },
  {
    id: 'money-cards',
    task: 'Credit cards',
    checked: false,
    category: 'Money'
  },
  {
    id: 'money-cash',
    task: 'Cash',
    checked: false,
    category: 'Money'
  },

  // Essentials
  {
    id: 'ess-phone',
    task: 'Cell phone & charger',
    checked: false,
    category: 'Essentials'
  },
  {
    id: 'ess-keys',
    task: 'Keys',
    checked: false,
    category: 'Essentials'
  },
  {
    id: 'ess-glasses',
    task: 'Glasses / Contact lenses',
    checked: false,
    category: 'Essentials'
  },
  {
    id: 'ess-prescriptions',
    task: 'Prescription medication',
    checked: false,
    category: 'Essentials'
  },

  // Personal Comfort
  {
    id: 'comfort-neck-pillow',
    task: 'Neck pillow',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-warm-layer',
    task: 'Warm layer',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-warm-socks',
    task: 'Warm socks',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-eye-mask',
    task: 'Eye mask',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-headphones',
    task: 'Headphones / Earplugs',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-book',
    task: 'Book / Magazines',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-water',
    task: 'Water bottle',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-snacks',
    task: 'Snacks / Gum',
    checked: false,
    category: 'Personal Comfort'
  },
  {
    id: 'comfort-change-clothes',
    task: 'Change of clothes',
    checked: false,
    category: 'Personal Comfort'
  },

  // Electronics
  {
    id: 'elec-laptop',
    task: 'Laptop',
    checked: false,
    category: 'Electronics'
  },
  {
    id: 'elec-tablet',
    task: 'iPad / Tablet',
    checked: false,
    category: 'Electronics'
  },
  {
    id: 'elec-ereader',
    task: 'E-reader',
    checked: false,
    category: 'Electronics'
  },
  {
    id: 'elec-camera',
    task: 'Camera',
    checked: false,
    category: 'Electronics'
  },
  {
    id: 'elec-chargers',
    task: 'All chargers',
    checked: false,
    category: 'Electronics'
  },
  {
    id: 'elec-adapters',
    task: 'Travel adapters / converters',
    checked: false,
    category: 'Electronics'
  },

  // Toiletries
  {
    id: 'toiletries-toothbrush',
    task: 'Toothbrush & toothpaste',
    checked: false,
    category: 'Toiletries'
  },
  {
    id: 'toiletries-soap',
    task: 'Body wash / Soap',
    checked: false,
    category: 'Toiletries'
  },
  {
    id: 'toiletries-facewash',
    task: 'Facewash',
    checked: false,
    category: 'Toiletries'
  },
  {
    id: 'toiletries-deodorant',
    task: 'Deodorant',
    checked: false,
    category: 'Toiletries'
  },
  {
    id: 'toiletries-eye-drops',
    task: 'Eye drops / Contact solution',
    checked: false,
    category: 'Toiletries'
  },
  {
    id: 'toiletries-shampoo',
    task: 'Shampoo & conditioner',
    checked: false,
    category: 'Toiletries'
  },
  {
    id: 'toiletries-lotion',
    task: 'Hand / Body lotion',
    checked: false,
    category: 'Toiletries'
  },

  // Health & Beauty
  {
    id: 'health-medicine',
    task: 'Basic medications',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-first-aid',
    task: 'Basic first aid kit',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-vitamins',
    task: 'Vitamins',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-sunscreen',
    task: 'Sunscreen',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-shaving',
    task: 'Shaving items',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-hair-product',
    task: 'Hair products',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-hair-tools',
    task: 'Hair tools',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-brush',
    task: 'Brush, hair ties & bobby pins',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-makeup',
    task: 'Makeup',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-perfume',
    task: 'Perfume / Cologne',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-feminine',
    task: 'Feminine care items',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-tweezers',
    task: 'Tweezers',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-cotton',
    task: 'Q-tips, tissues & cotton rounds',
    checked: false,
    category: 'Health & Beauty'
  },
  {
    id: 'health-nails',
    task: 'Nail polish',
    checked: false,
    category: 'Health & Beauty'
  },

  // Clothing
  {
    id: 'clothing-casual-tops',
    task: 'Casual tops',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-dress-tops',
    task: 'Dress tops',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-tshirts',
    task: 'T-shirts',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-jeans',
    task: 'Jeans',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-casual-pants',
    task: 'Casual pants',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-dress-pants',
    task: 'Dress pants',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-shorts',
    task: 'Shorts',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-dresses',
    task: 'Dresses',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-skirts',
    task: 'Skirts',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-blazers',
    task: 'Blazers & suit coats',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-ties',
    task: 'Ties & pocket squares',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-sweaters',
    task: 'Sweaters',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-outerwear',
    task: 'Outerwear (coat / jacket)',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-activewear',
    task: 'Activewear',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-swimwear',
    task: 'Swimwear & cover-ups',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-pajamas',
    task: 'Pajamas & loungewear',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-underwear',
    task: 'Underwear',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-socks',
    task: 'Socks',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-bras',
    task: 'Bras',
    checked: false,
    category: 'Clothing'
  },
  {
    id: 'clothing-tights',
    task: 'Tights / Hosiery',
    checked: false,
    category: 'Clothing'
  },

  // Shoes
  {
    id: 'shoes-tennis',
    task: 'Tennis shoes',
    checked: false,
    category: 'Shoes'
  },
  {
    id: 'shoes-dress',
    task: 'Dress shoes / Heels',
    checked: false,
    category: 'Shoes'
  },
  {
    id: 'shoes-flats',
    task: 'Flats',
    checked: false,
    category: 'Shoes'
  },
  {
    id: 'shoes-sandals',
    task: 'Sandals',
    checked: false,
    category: 'Shoes'
  },
  {
    id: 'shoes-boots',
    task: 'Boots',
    checked: false,
    category: 'Shoes'
  },
  {
    id: 'shoes-speciality',
    task: 'Speciality shoes (water, cycling, hiking)',
    checked: false,
    category: 'Shoes'
  },

  // Accessories
  {
    id: 'acc-sunglasses',
    task: 'Sunglasses',
    checked: false,
    category: 'Accessories'
  },
  {
    id: 'acc-watch',
    task: 'Watch',
    checked: false,
    category: 'Accessories'
  },
  {
    id: 'acc-jewelry',
    task: 'Jewelry',
    checked: false,
    category: 'Accessories'
  },
  {
    id: 'acc-belts',
    task: 'Belts',
    checked: false,
    category: 'Accessories'
  },
  {
    id: 'acc-scarf',
    task: 'Scarf',
    checked: false,
    category: 'Accessories'
  },
  {
    id: 'acc-hat',
    task: 'Hat',
    checked: false,
    category: 'Accessories'
  },
  {
    id: 'acc-purse',
    task: 'Purse',
    checked: false,
    category: 'Accessories'
  },
  {
    id: 'acc-umbrella',
    task: 'Umbrella',
    checked: false,
    category: 'Accessories'
  }
  ]
};
