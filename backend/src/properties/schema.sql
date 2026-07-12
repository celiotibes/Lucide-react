-- Property Management Database Schema for UFSC Kitnets
-- Phase 1 MVP Schema

-- ============================================
-- UNIT TYPES CATALOG
-- ============================================

CREATE TABLE IF NOT EXISTS unit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'kitnet', 'apartment'
  area_m2_min DECIMAL(5,2),
  area_m2_max DECIMAL(5,2),
  bedrooms INT,
  bathrooms INT,
  target_occupancy VARCHAR(100),
  base_monthly_price DECIMAL(10,2),
  key_features JSONB, -- {air_conditioning: "split", furnished: true, ...}
  ideal_guest_profile JSONB,
  description_template TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PROPERTY OWNERS
-- ============================================

CREATE TABLE IF NOT EXISTS property_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  document VARCHAR(20) UNIQUE,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  bank_account JSONB, -- {bank_name, account_number, routing_number, ...}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PROPERTIES (Imóveis)
-- ============================================

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES property_owners(id),
  unit_type_id UUID REFERENCES unit_types(id),
  internal_code VARCHAR(50) UNIQUE NOT NULL, -- ex: POT-25-001

  -- Location
  address VARCHAR(255) NOT NULL,
  neighborhood VARCHAR(100),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  zip_code VARCHAR(10),
  latitude DECIMAL(10,8),
  longitude DECIMAL(10,8),

  -- Physical Characteristics
  type VARCHAR(50) NOT NULL, -- 'kitnet', 'apt_2qt', 'apt_3qt'
  area_m2 DECIMAL(5,2),
  bedrooms INT,
  bathrooms INT,
  floor VARCHAR(50),

  -- Capacity & Occupancy
  max_occupancy INT,
  target_occupancy VARCHAR(100),

  -- Amenities
  amenities JSONB, -- {wifi: true, air_conditioning: "split", furnished: true, ...}
  images JSONB, -- [{id, url, category, order, description}, ...]

  -- Pricing
  base_monthly_rent DECIMAL(10,2),
  security_deposit DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'BRL',

  -- Configuration
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'maintenance', 'off_season', 'archived'
  is_furnished BOOLEAN DEFAULT true,
  minimum_stay_days INT DEFAULT 1,
  maximum_stay_days INT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT positive_area CHECK (area_m2 > 0),
  CONSTRAINT positive_rent CHECK (base_monthly_rent > 0)
);

-- Índices para performance
CREATE INDEX idx_properties_owner_id ON properties(owner_id);
CREATE INDEX idx_properties_unit_type_id ON properties(unit_type_id);
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_internal_code ON properties(internal_code);

-- ============================================
-- LISTINGS (Anúncios por Plataforma)
-- ============================================

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'airbnb', 'booking', 'vrbo', 'direct'
  platform_listing_id VARCHAR(255),

  -- Content
  title VARCHAR(255),
  description TEXT,
  headline_key VARCHAR(50), -- positioning key
  amenities_text TEXT,
  highlights JSONB, -- ["WiFi Rápida", "Próximo UFSC", ...]

  -- Pricing Strategy
  price_strategy VARCHAR(50) DEFAULT 'static', -- 'static', 'dynamic', 'seasonal'
  base_price DECIMAL(10,2),
  min_price DECIMAL(10,2),
  max_price DECIMAL(10,2),
  occupancy_multiplier DECIMAL(3,2),

  -- Performance Tracking
  views_count INT DEFAULT 0,
  clicks_count INT DEFAULT 0,
  bookings_count INT DEFAULT 0,
  conversion_rate DECIMAL(5,3),

  -- Status & Sync
  is_active BOOLEAN DEFAULT true,
  published_at TIMESTAMP,
  synced_at TIMESTAMP,
  sync_status VARCHAR(20) DEFAULT 'pending', -- 'synced', 'pending', 'error'
  sync_error_message TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(property_id, platform)
);

CREATE INDEX idx_listings_property_id ON listings(property_id);
CREATE INDEX idx_listings_platform ON listings(platform);
CREATE INDEX idx_listings_sync_status ON listings(sync_status);

-- ============================================
-- LEADS
-- ============================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  listing_id UUID REFERENCES listings(id),

  -- Lead Information
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  country_code VARCHAR(3),

  -- Source Tracking
  source_channel VARCHAR(50), -- 'airbnb', 'booking', 'vrbo', 'direct', 'ads', 'referral'
  source_campaign VARCHAR(100),
  platform_lead_id VARCHAR(255),

  -- Funnel Stage
  stage VARCHAR(50) DEFAULT 'inquiry', -- 'inquiry', 'contacted', 'tour_scheduled', 'touring', 'negotiation', 'closed', 'lost'

  -- Timeline
  first_contact_at TIMESTAMP DEFAULT NOW(),
  last_contact_at TIMESTAMP,
  tour_scheduled_at TIMESTAMP,
  tour_date_time TIMESTAMP,
  expected_close_date TIMESTAMP,

  -- Financial
  estimated_deal_value DECIMAL(10,2),
  actual_deal_value DECIMAL(10,2),
  cpl_cost DECIMAL(10,2), -- Cost per Lead

  -- Metadata
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leads_property_id ON leads(property_id);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_source_channel ON leads(source_channel);
CREATE INDEX idx_leads_first_contact ON leads(first_contact_at);

-- ============================================
-- LEAD TOUCHPOINTS (Communication History)
-- ============================================

CREATE TABLE IF NOT EXISTS lead_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  channel VARCHAR(50), -- 'whatsapp', 'email', 'phone', 'platform_message', 'in_person'
  message_type VARCHAR(50), -- 'inquiry', 'response', 'reminder', 'offer', 'follow_up'
  message_content TEXT,
  direction VARCHAR(20), -- 'inbound', 'outbound'

  metadata JSONB, -- platform-specific metadata

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_touchpoints_lead_id ON lead_touchpoints(lead_id);
CREATE INDEX idx_touchpoints_channel ON lead_touchpoints(channel);

-- ============================================
-- LISTINGS STRATEGY
-- ============================================

CREATE TABLE IF NOT EXISTS listing_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

  -- Market Positioning
  market_segment VARCHAR(50), -- 'student', 'professional', 'tourist', 'family'
  seasonal_period VARCHAR(50), -- 'high', 'medium', 'low'

  -- Performance Metrics
  current_occupancy_rate DECIMAL(5,3),
  ctr DECIMAL(5,3), -- Click-through rate
  conversion_rate DECIMAL(5,3),
  booking_window_days INT,

  -- Recommendations
  recommended_price DECIMAL(10,2),
  price_change_percentage DECIMAL(5,2),
  discounts_active BOOLEAN DEFAULT false,
  discount_percentage DECIMAL(5,2),
  bundle_offers JSONB,

  last_updated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_strategies_listing_id ON listing_strategies(listing_id);

-- ============================================
-- OCCUPANCY HISTORY (Analytics)
-- ============================================

CREATE TABLE IF NOT EXISTS occupancy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  status VARCHAR(50), -- 'occupied', 'available', 'blocked', 'maintenance'
  guest_name VARCHAR(255),
  booking_id VARCHAR(255),
  platform VARCHAR(50),

  price_charged DECIMAL(10,2),
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(property_id, date)
);

CREATE INDEX idx_occupancy_property_id ON occupancy_history(property_id);
CREATE INDEX idx_occupancy_date ON occupancy_history(date);

-- ============================================
-- ANALYTICS SUMMARY (Monthly aggregates)
-- ============================================

CREATE TABLE IF NOT EXISTS property_monthly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  year_month VARCHAR(7) NOT NULL, -- YYYY-MM

  -- Occupancy
  days_occupied INT,
  days_available INT,
  occupancy_rate DECIMAL(5,3),

  -- Revenue
  total_revenue DECIMAL(10,2),
  average_nightly_rate DECIMAL(10,2),
  revenue_per_sqm DECIMAL(10,2),

  -- Leads & Sales
  leads_generated INT,
  tours_completed INT,
  bookings_closed INT,
  conversion_rate DECIMAL(5,3),

  -- Quality
  average_rating DECIMAL(3,2),
  reviews_count INT,
  review_sentiment_score DECIMAL(3,2),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(property_id, year_month)
);

CREATE INDEX idx_stats_property_id ON property_monthly_stats(property_id);
CREATE INDEX idx_stats_year_month ON property_monthly_stats(year_month);

-- ============================================
-- CAMPAIGNS (Marketing)
-- ============================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,
  description TEXT,
  platform VARCHAR(50), -- 'google_ads', 'meta_ads', 'organic', 'referral'

  -- Targeting
  target_segment VARCHAR(50), -- 'student', 'professional', 'tourist'
  target_keywords JSONB,

  -- Budget & Performance
  daily_budget DECIMAL(10,2),
  total_spent DECIMAL(10,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,

  -- Results
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  conversions INT DEFAULT 0,
  cost_per_lead DECIMAL(10,2),
  roi DECIMAL(5,3),

  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campaigns_platform ON campaigns(platform);
CREATE INDEX idx_campaigns_status ON campaigns(status);
