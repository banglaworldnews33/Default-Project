import type { DeliveryZone, PaymentMethod } from '@/types'

/**
 * Store-wide configuration. Values here are intentionally centralized so the
 * future Admin > Settings page can mutate them (and later persist to a DB).
 */
export const STORE_CONFIG = {
  name: 'Nextgen Shop',
  tagline: 'Quality fashion & lifestyle, delivered across Bangladesh.',
  phone: '+880 1700-000000',
  email: 'support@nextgenshop.com.bd',
  address: 'House 12, Road 5, Dhanmondi, Dhaka 1205',
  currency: {
    symbol: '৳',
    code: 'BDT',
  },
  /** Free-shipping threshold; set to Infinity to disable. */
  freeShippingOver: 5000,
  lowStockThreshold: 10,
} as const

export const DELIVERY_CHARGES: Record<DeliveryZone, number> = {
  'inside-dhaka': 80,
  'outside-dhaka': 130,
}

export const deliveryZoneLabel = (zone: DeliveryZone): string =>
  zone === 'inside-dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'

export const PAYMENT_METHODS: { id: PaymentMethod; description: string }[] = [
  {
    id: 'Cash on Delivery',
    description: 'Pay in cash when your parcel arrives.',
  },
  {
    id: 'bKash',
    description: 'Pay via bKash mobile wallet (coming soon).',
  },
  {
    id: 'Nagad',
    description: 'Pay via Nagad mobile wallet (coming soon).',
  },
]

export const DIVISIONS: Record<string, string[]> = {
  Dhaka: [
    'Dhaka', 'Gazipur', 'Narayanganj', 'Tangail', 'Kishoreganj', 'Manikganj',
    'Munshiganj', 'Narsingdi', 'Faridpur', 'Gopalganj', 'Madaripur', 'Rajbari', 'Shariatpur',
  ],
  Chattogram: [
    'Chattogram', 'Cox\u2019s Bazar', 'Cumilla', 'Feni', 'Brahmanbaria', 'Noakhali',
    'Chandpur', 'Lakshmipur', 'Khagrachhari', 'Rangamati', 'Bandarban',
  ],
  Rajshahi: [
    'Rajshahi', 'Bogura', 'Pabna', 'Sirajganj', 'Natore', 'Naogaon', 'Joypurhat',
    'Chapainawabganj', 'Kushtia', 'Meherpur', 'Jhenaidah', 'Chuadanga',
  ],
  Khulna: ['Khulna', 'Jashore', 'Satkhira', 'Bagerhat', 'Magura', 'Narail', 'Jhalokati', 'Pirojpur'],
  Barishal: ['Barishal', 'Patuakhali', 'Bhola', 'Pirojpur', 'Jhalokati', 'Barguna'],
  Sylhet: ['Sylhet', 'Moulvibazar', 'Habiganj', 'Sunamganj', 'Kishoreganj'],
  Rangpur: ['Rangpur', 'Dinajpur', 'Kurigram', 'Gaibandha', 'Nilphamari', 'Panchagarh', 'Thakurgaon'],
  Mymensingh: ['Mymensingh', 'Jamalpur', 'Netrokona', 'Sherpur'],
}

export const sampleCoupons = [
  { code: 'NEXTGEN10', type: 'percentage', value: 10, minOrderAmount: 1000, active: true },
] as const
