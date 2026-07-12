// Property Management Types & Interfaces

// ============================================
// UNIT TYPES
// ============================================

export interface UnitType {
  id: string;
  code: string; // ex: 'KITNET_1QT_BASIC'
  name: string;
  category: 'kitnet' | 'apartment';
  area_m2_min?: number;
  area_m2_max?: number;
  bedrooms: number;
  bathrooms: number;
  target_occupancy: string; // ex: "1 pessoa", "1-2 pessoas"
  base_monthly_price: number;
  key_features: Record<string, unknown>;
  ideal_guest_profile: Record<string, unknown>;
  description_template: string;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// PROPERTY OWNERS
// ============================================

export interface PropertyOwner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  document?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  bank_account?: BankAccount;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface BankAccount {
  bank_name: string;
  account_number: string;
  routing_number?: string;
  account_holder_name: string;
  account_type?: 'checking' | 'savings';
}

// ============================================
// PROPERTIES (Imóveis)
// ============================================

export interface Property {
  id: string;
  owner_id: string;
  unit_type_id: string;
  internal_code: string; // ex: POT-25-001

  // Location
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  latitude?: number;
  longitude?: number;

  // Physical
  type: 'kitnet' | 'apt_2qt' | 'apt_3qt';
  area_m2: number;
  bedrooms: number;
  bathrooms: number;
  floor?: string; // 'térreo', '2º piso'

  // Capacity
  max_occupancy: number;
  target_occupancy: string;

  // Amenities & Media
  amenities: PropertyAmenities;
  images: PropertyImage[];

  // Pricing
  base_monthly_rent: number;
  security_deposit: number;
  currency: string; // 'BRL', 'USD'

  // Configuration
  status: 'active' | 'maintenance' | 'off_season' | 'archived';
  is_furnished: boolean;
  minimum_stay_days: number;
  maximum_stay_days?: number;

  created_at: Date;
  updated_at: Date;
}

export interface PropertyAmenities {
  wifi: boolean;
  air_conditioning?: 'split' | 'window' | 'none';
  kitchen: boolean;
  furnished: boolean;
  washer?: boolean;
  parking?: boolean;
  balcony?: boolean;
  tv?: boolean;
  heating?: boolean;
  microwave?: boolean;
  refrigerator?: boolean;
  [key: string]: unknown;
}

export interface PropertyImage {
  id: string;
  url: string;
  category: 'bedroom' | 'kitchen' | 'bathroom' | 'living' | 'exterior' | 'common';
  order: number;
  description?: string;
}

// ============================================
// LISTINGS (Anúncios)
// ============================================

export interface Listing {
  id: string;
  property_id: string;
  platform: 'airbnb' | 'booking' | 'vrbo' | 'direct';
  platform_listing_id?: string;

  // Content
  title: string;
  description: string;
  headline_key?: string;
  amenities_text: string;
  highlights: string[];

  // Pricing
  price_strategy: 'static' | 'dynamic' | 'seasonal';
  base_price: number;
  min_price?: number;
  max_price?: number;
  occupancy_multiplier?: number;

  // Performance
  views_count: number;
  clicks_count: number;
  bookings_count: number;
  conversion_rate?: number;

  // Status
  is_active: boolean;
  published_at?: Date;
  synced_at?: Date;
  sync_status: 'synced' | 'pending' | 'error';
  sync_error_message?: string;

  created_at: Date;
  updated_at: Date;
}

export interface ListingCreateInput {
  property_id: string;
  platform: 'airbnb' | 'booking' | 'vrbo' | 'direct';
  title: string;
  description: string;
  highlights: string[];
  base_price: number;
  price_strategy?: 'static' | 'dynamic' | 'seasonal';
}

// ============================================
// LEADS
// ============================================

export interface Lead {
  id: string;
  property_id: string;
  listing_id: string;

  // Info
  name: string;
  email?: string;
  phone?: string;
  country_code?: string;

  // Source
  source_channel: 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'ads' | 'referral';
  source_campaign?: string;
  platform_lead_id?: string;

  // Funnel
  stage: 'inquiry' | 'contacted' | 'tour_scheduled' | 'touring' | 'negotiation' | 'closed' | 'lost';

  // Timeline
  first_contact_at: Date;
  last_contact_at?: Date;
  tour_scheduled_at?: Date;
  tour_date_time?: Date;
  expected_close_date?: Date;

  // Financial
  estimated_deal_value?: number;
  actual_deal_value?: number;
  cpl_cost?: number;

  // Metadata
  notes?: string;
  is_active: boolean;

  created_at: Date;
  updated_at: Date;
}

export interface LeadCreateInput {
  property_id: string;
  listing_id: string;
  name: string;
  email?: string;
  phone?: string;
  source_channel: string;
  source_campaign?: string;
  platform_lead_id?: string;
  notes?: string;
}

export interface LeadUpdateInput {
  stage?: string;
  last_contact_at?: Date;
  tour_scheduled_at?: Date;
  tour_date_time?: Date;
  notes?: string;
  actual_deal_value?: number;
}

// ============================================
// LEAD TOUCHPOINTS
// ============================================

export interface LeadTouchpoint {
  id: string;
  lead_id: string;
  channel: 'whatsapp' | 'email' | 'phone' | 'platform_message' | 'in_person';
  message_type: 'inquiry' | 'response' | 'reminder' | 'offer' | 'follow_up';
  message_content: string;
  direction: 'inbound' | 'outbound';
  metadata?: Record<string, unknown>;
  created_at: Date;
}

// ============================================
// LISTING STRATEGIES
// ============================================

export interface ListingStrategy {
  id: string;
  listing_id: string;

  // Positioning
  market_segment: 'student' | 'professional' | 'tourist' | 'family';
  seasonal_period: 'high' | 'medium' | 'low';

  // Metrics
  current_occupancy_rate: number;
  ctr?: number;
  conversion_rate?: number;
  booking_window_days?: number;

  // Recommendations
  recommended_price?: number;
  price_change_percentage?: number;
  discounts_active: boolean;
  discount_percentage?: number;
  bundle_offers?: Record<string, unknown>;

  updated_at: Date;
}

// ============================================
// OCCUPANCY HISTORY
// ============================================

export interface OccupancyRecord {
  id: string;
  property_id: string;
  date: string; // YYYY-MM-DD
  status: 'occupied' | 'available' | 'blocked' | 'maintenance';
  guest_name?: string;
  booking_id?: string;
  platform?: string;
  price_charged?: number;
  notes?: string;
  created_at: Date;
}

// ============================================
// MONTHLY STATISTICS
// ============================================

export interface PropertyMonthlyStats {
  id: string;
  property_id: string;
  year_month: string; // YYYY-MM

  // Occupancy
  days_occupied: number;
  days_available: number;
  occupancy_rate: number;

  // Revenue
  total_revenue: number;
  average_nightly_rate: number;
  revenue_per_sqm: number;

  // Leads & Sales
  leads_generated: number;
  tours_completed: number;
  bookings_closed: number;
  conversion_rate: number;

  // Quality
  average_rating: number;
  reviews_count: number;
  review_sentiment_score?: number;

  created_at: Date;
  updated_at: Date;
}

// ============================================
// CAMPAIGNS
// ============================================

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  platform: 'google_ads' | 'meta_ads' | 'organic' | 'referral';

  // Targeting
  target_segment?: 'student' | 'professional' | 'tourist';
  target_keywords?: string[];

  // Budget
  daily_budget: number;
  total_spent: number;
  start_date: Date;
  end_date?: Date;

  // Results
  impressions: number;
  clicks: number;
  conversions: number;
  cost_per_lead?: number;
  roi?: number;

  // Status
  status: 'draft' | 'active' | 'paused' | 'completed';

  created_at: Date;
  updated_at: Date;
}

// ============================================
// DTOs & API Responses
// ============================================

export interface PropertyWithListings extends Property {
  listings: Listing[];
  monthly_stats: PropertyMonthlyStats[];
  current_occupancy_rate?: number;
  average_rating?: number;
}

export interface PropertyDashboard {
  property: Property;
  occupancy_rate: number;
  revenue_month: number;
  revenue_potential: number;
  leads_month: number;
  conversion_rate: number;
  average_rating: number;
  reviews_count: number;
  listings_sync_status: Record<string, 'synced' | 'pending' | 'error'>;
}

export interface LeadFunnelStats {
  total_leads: number;
  by_stage: Record<string, number>;
  conversion_rate_inquiry_to_close: number;
  average_days_to_close: number;
  by_channel: Record<string, number>;
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
