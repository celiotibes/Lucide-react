-- Migration: Initialize Property Management Tables
-- Run this migration to set up the complete property management database schema

-- ============================================
-- UNIT TYPES CATALOG
-- ============================================

INSERT INTO unit_types (code, name, category, area_m2_min, area_m2_max, bedrooms, bathrooms, target_occupancy, base_monthly_price, key_features, ideal_guest_profile, description_template)
VALUES
  ('KITNET_1QT_BASIC', 'Kitnet 1 Quarto Básica', 'kitnet', 20, 25, 1, 1, '1 pessoa', 1500,
   '{"wifi": true, "air_conditioning": "split", "furnished": true, "kitchen": true}',
   '{"segment": "student", "income": "low_to_medium", "stay": "long_term"}',
   'Kitnet próxima UFSC, totalmente mobiliada com WiFi de alta velocidade, ar-condicionado e cozinha completa. Ideal para estudantes e profissionais.'),

  ('APT_2QT_INTERMEDIATE', 'Apartamento 2 Quartos Intermediário', 'apartment', 40, 50, 2, 1, '2-3 pessoas', 2500,
   '{"wifi": true, "air_conditioning": "split", "furnished": true, "kitchen": true, "washer": true, "balcony": true}',
   '{"segment": "professional", "income": "medium", "stay": "medium_term"}',
   'Apartamento confortável com 2 quartos, cozinha equipada, área de serviço e varandão. Perfeito para famílias pequenas ou profissionais.'),

  ('APT_3QT_PREMIUM', 'Apartamento 3 Quartos Premium', 'apartment', 60, 75, 3, 2, '3-4 pessoas', 3500,
   '{"wifi": true, "air_conditioning": "split", "furnished": true, "kitchen": true, "washer": true, "balcony": true, "parking": true}',
   '{"segment": "family", "income": "high", "stay": "long_term"}',
   'Apartamento premium com 3 quartos, 2 banheiros, cozinha gourmet, área de serviço e garagem. Ideal para famílias.')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- PROPERTY OWNERS (UFSC Kitnets Portfolio)
-- ============================================

INSERT INTO property_owners (id, name, email, phone, document, address, city, state, zip_code, bank_account, is_active)
VALUES
  (gen_random_uuid(), 'UFSC Kitnets Management', 'admin@ufsc-kitnets.com', '(48) 3721-9500',
   '88040-900', 'Campus Reitor João David Ferreira Lima, s/n', 'Florianópolis', 'SC', '88040-900',
   '{"bank_name": "Banco do Brasil", "account_number": "1234567-8", "account_holder_name": "UFSC Kitnets Management", "account_type": "checking"}',
   true)
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- PROPERTIES - POTTKER 25 (20 kitnets)
-- ============================================

-- Insert owner for Pottker location
INSERT INTO property_owners (id, name, email, phone, document, address, city, state, zip_code, is_active)
SELECT gen_random_uuid(), 'Condomínio Pottker 25', 'pottker25@ufsc-kitnets.com', '(48) 3222-1111',
       '00000001', 'Rua Pottker, 25', 'Florianópolis', 'SC', '88015-600', true
WHERE NOT EXISTS (SELECT 1 FROM property_owners WHERE email = 'pottker25@ufsc-kitnets.com');

-- Get owner ID for Pottker location
WITH owner_data AS (
  SELECT id FROM property_owners WHERE email = 'pottker25@ufsc-kitnets.com' LIMIT 1
),
unit_type_data AS (
  SELECT id FROM unit_types WHERE code = 'KITNET_1QT_BASIC' LIMIT 1
)
INSERT INTO properties (
  owner_id, unit_type_id, internal_code, address, neighborhood, city, state, zip_code,
  type, area_m2, bedrooms, bathrooms, max_occupancy, target_occupancy, amenities,
  base_monthly_rent, security_deposit, is_furnished, minimum_stay_days
)
SELECT
  owner_data.id, unit_type_data.id, 'POT-25-' || LPAD(seq::text, 3, '0'),
  'Rua Pottker, 25 - Apto ' || seq, 'Trindade', 'Florianópolis', 'SC', '88015-600',
  'kitnet', 22.5, 1, 1, 1, '1 pessoa',
  '{"wifi": true, "air_conditioning": "split", "furnished": true, "kitchen": true}'::jsonb,
  1500, 1500, true, 30
FROM owner_data, unit_type_data, generate_series(1, 20) seq
ON CONFLICT DO NOTHING;

-- ============================================
-- PROPERTIES - MILTON SULLIVAN 142 (6 apartments)
-- ============================================

INSERT INTO property_owners (id, name, email, phone, document, address, city, state, zip_code, is_active)
SELECT gen_random_uuid(), 'Condomínio Milton Sullivan', 'milton142@ufsc-kitnets.com', '(48) 3222-2222',
       '00000002', 'Rua Milton Sullivan, 142', 'Florianópolis', 'SC', '88015-300', true
WHERE NOT EXISTS (SELECT 1 FROM property_owners WHERE email = 'milton142@ufsc-kitnets.com');

WITH owner_data AS (
  SELECT id FROM property_owners WHERE email = 'milton142@ufsc-kitnets.com' LIMIT 1
),
unit_type_data AS (
  SELECT id FROM unit_types WHERE code = 'APT_2QT_INTERMEDIATE' LIMIT 1
)
INSERT INTO properties (
  owner_id, unit_type_id, internal_code, address, neighborhood, city, state, zip_code,
  type, area_m2, bedrooms, bathrooms, max_occupancy, target_occupancy, amenities,
  base_monthly_rent, security_deposit, is_furnished, minimum_stay_days
)
SELECT
  owner_data.id, unit_type_data.id, 'MIL-142-' || LPAD(seq::text, 3, '0'),
  'Rua Milton Sullivan, 142 - Apto ' || seq, 'Trindade', 'Florianópolis', 'SC', '88015-300',
  'apt_2qt', 45, 2, 1, 2, '2-3 pessoas',
  '{"wifi": true, "air_conditioning": "split", "furnished": true, "kitchen": true, "washer": true, "balcony": true}'::jsonb,
  2500, 2500, true, 30
FROM owner_data, unit_type_data, generate_series(1, 6) seq
ON CONFLICT DO NOTHING;

-- ============================================
-- PROPERTIES - ANA MARIA NUNES 214 (5 apartments)
-- ============================================

INSERT INTO property_owners (id, name, email, phone, document, address, city, state, zip_code, is_active)
SELECT gen_random_uuid(), 'Condomínio Ana Maria Nunes', 'ana214@ufsc-kitnets.com', '(48) 3222-3333',
       '00000003', 'Rua Ana Maria Nunes, 214', 'Florianópolis', 'SC', '88015-400', true
WHERE NOT EXISTS (SELECT 1 FROM property_owners WHERE email = 'ana214@ufsc-kitnets.com');

-- 3 apartments 2QT + 2 apartments 3QT
WITH owner_data AS (
  SELECT id FROM property_owners WHERE email = 'ana214@ufsc-kitnets.com' LIMIT 1
),
unit_type_2qt AS (
  SELECT id FROM unit_types WHERE code = 'APT_2QT_INTERMEDIATE' LIMIT 1
),
unit_type_3qt AS (
  SELECT id FROM unit_types WHERE code = 'APT_3QT_PREMIUM' LIMIT 1
)
INSERT INTO properties (
  owner_id, unit_type_id, internal_code, address, neighborhood, city, state, zip_code,
  type, area_m2, bedrooms, bathrooms, max_occupancy, target_occupancy, amenities,
  base_monthly_rent, security_deposit, is_furnished, minimum_stay_days
)
SELECT
  owner_data.id,
  CASE WHEN seq <= 3 THEN (SELECT id FROM unit_type_2qt) ELSE (SELECT id FROM unit_type_3qt) END,
  'ANA-214-' || LPAD(seq::text, 3, '0'),
  'Rua Ana Maria Nunes, 214 - Apto ' || seq, 'Trindade', 'Florianópolis', 'SC', '88015-400',
  CASE WHEN seq <= 3 THEN 'apt_2qt' ELSE 'apt_3qt' END,
  CASE WHEN seq <= 3 THEN 45 ELSE 65 END,
  CASE WHEN seq <= 3 THEN 2 ELSE 3 END,
  CASE WHEN seq <= 3 THEN 1 ELSE 2 END,
  CASE WHEN seq <= 3 THEN 2 ELSE 4 END,
  CASE WHEN seq <= 3 THEN '2-3 pessoas' ELSE '3-4 pessoas' END,
  CASE WHEN seq <= 3
    THEN '{"wifi": true, "air_conditioning": "split", "furnished": true, "kitchen": true, "washer": true, "balcony": true}'::jsonb
    ELSE '{"wifi": true, "air_conditioning": "split", "furnished": true, "kitchen": true, "washer": true, "balcony": true, "parking": true}'::jsonb
  END,
  CASE WHEN seq <= 3 THEN 2500 ELSE 3500 END,
  CASE WHEN seq <= 3 THEN 2500 ELSE 3500 END,
  true, 30
FROM owner_data, generate_series(1, 5) seq
ON CONFLICT DO NOTHING;

-- ============================================
-- CREATE INITIAL LISTINGS (placeholder)
-- ============================================

WITH properties_list AS (
  SELECT id, internal_code FROM properties LIMIT 31
)
INSERT INTO listings (property_id, platform, title, description, highlights, base_price, price_strategy, is_active)
SELECT
  properties_list.id,
  platform,
  'Imóvel ' || properties_list.internal_code || ' - ' || platform,
  'Imóvel disponível em ' || platform,
  '["WiFi Rápida", "Mobiliado", "Próximo UFSC"]'::jsonb,
  CASE
    WHEN properties_list.internal_code LIKE 'POT%' THEN 50
    WHEN properties_list.internal_code LIKE 'MIL%' THEN 83
    ELSE 117
  END,
  'static',
  true
FROM properties_list,
     (SELECT 'airbnb' as platform UNION SELECT 'booking' UNION SELECT 'vrbo' UNION SELECT 'direct') AS platforms
ON CONFLICT (property_id, platform) DO NOTHING;

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 'Properties Created' as status, COUNT(*) FROM properties
UNION ALL
SELECT 'Listings Created', COUNT(*) FROM listings
UNION ALL
SELECT 'Owners Created', COUNT(*) FROM property_owners
UNION ALL
SELECT 'Unit Types Created', COUNT(*) FROM unit_types;
