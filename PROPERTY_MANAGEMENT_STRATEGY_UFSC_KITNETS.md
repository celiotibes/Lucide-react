# Estratégia de Gestão Centralizada de Imóveis - Kitnets UFSC 2026

**Data**: 2026-07-11  
**Portfolio**: Kitnets & Apartamentos Região UFSC (Carvoeira/Córrego Grande)  
**Status**: 🟡 **PLANEJAMENTO ESTRATÉGICO**  
**Objetivo**: Base central integrada com anúncios multi-plataforma

---

## Executivo

Sistema proposto para centralizar gestão de 31 unidades imobiliárias com anúncios dinâmicos em Airbnb, Booking, Vrbo, Hotéis.com e canais proprietários.

**Portfolio Atual**:
- **Pottker 25**: 20 kitnets 1 qt (25-28m²) - R$1.650-1.850/mês
- **Milton Sullivan 142**: 6 apartamentos 2 qt (30-35m²) - R$2.150-2.300/mês
- **Ana Maria Nunes 214**: 5 unidades variadas (1-3 qt) - R$1.850-3.700/mês
- **Total**: 31 unidades | **Receita Potencial**: R$66-70 mil/mês | **Ocupação Target**: 85%

---

## Parte 1: Estrutura de Base Central

### 1.1 Arquitetura de Dados

```sql
-- Core Tables no Rental Sync

-- PROPRIETÁRIOS (Base Central)
CREATE TABLE property_owners (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  document VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  bank_account JSONB, -- Dados bancários
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- IMÓVEIS (Catálogo Central)
CREATE TABLE properties (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES property_owners(id),
  internal_code VARCHAR(50) UNIQUE, -- ex: "POT-25-001"
  address VARCHAR(255),
  neighborhood VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  latitude DECIMAL(10,8),
  longitude DECIMAL(10,8),
  
  -- Características Físicas
  type VARCHAR(50), -- 'kitnet', 'apt_2qt', 'apt_3qt'
  area_m2 DECIMAL(5,2),
  bedrooms INT,
  bathrooms INT,
  floor VARCHAR(50), -- 'térreo', '2º piso'
  
  -- Capacidade
  max_occupancy INT,
  target_occupancy VARCHAR(100), -- "1 pessoa", "1-2 pessoas"
  
  -- Comodidades
  amenities JSONB, -- {air_conditioning: "split/sem", furnished: true, ...}
  images JSONB, -- URLs de imagens
  
  -- Valores
  base_rent_amount DECIMAL(10,2),
  security_deposit DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'BRL',
  
  -- Configuração Multi-Canal
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'maintenance', 'off_season'
  is_furnished BOOLEAN DEFAULT true,
  minimum_stay_days INT DEFAULT 1,
  maximum_stay_days INT,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- ANÚNCIOS (Representação por Plataforma)
CREATE TABLE listings (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  platform VARCHAR(50), -- 'airbnb', 'booking', 'vrbo', 'direct'
  platform_listing_id VARCHAR(255) UNIQUE, -- ID da plataforma
  
  -- Conteúdo Dinâmico
  title_template VARCHAR(255), -- Template customizável
  description_id VARCHAR(100), -- Referência ao template
  headline_key VARCHAR(50), -- Chave de posicionamento
  
  -- Estratégia de Precificação
  price_strategy VARCHAR(50), -- 'static', 'dynamic', 'seasonal'
  base_price DECIMAL(10,2),
  min_price DECIMAL(10,2),
  max_price DECIMAL(10,2),
  occupancy_multiplier DECIMAL(3,2), -- 1.0-1.5
  
  -- Performance
  views_count INT DEFAULT 0,
  bookings_count INT DEFAULT 0,
  conversion_rate DECIMAL(5,3),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  published_at TIMESTAMP,
  synced_at TIMESTAMP,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- TIPOS DE UNIDADE (Catálogo de Templates)
CREATE TABLE unit_types (
  id UUID PRIMARY KEY,
  code VARCHAR(50), -- 'KITNET_1QT_BASIC', 'APT_2QT_STANDARD'
  name VARCHAR(100),
  category VARCHAR(50), -- 'kitnet', 'apartamento'
  area_m2_from DECIMAL(5,2),
  area_m2_to DECIMAL(5,2),
  bedrooms INT,
  bathrooms INT,
  target_occupancy VARCHAR(100),
  base_monthly_price DECIMAL(10,2),
  key_features JSONB, -- Características principais
  ideal_guest_profile JSONB, -- Segmentação
  description_template TEXT, -- Template de descrição
  
  created_at TIMESTAMP
);

-- ESTRATÉGIA DE ANÚNCIO
CREATE TABLE listing_strategies (
  id UUID PRIMARY KEY,
  listing_id UUID REFERENCES listings(id),
  
  -- Posicionamento
  market_segment VARCHAR(50), -- 'student', 'professional', 'tourist'
  seasonal_period VARCHAR(50), -- 'high', 'medium', 'low'
  occupancy_rate DECIMAL(5,3),
  
  -- Performance
  ctr DECIMAL(5,3), -- Click-through rate
  conversion_rate DECIMAL(5,3),
  booking_window_days INT, -- Dias de antecedência
  
  -- Dinâmica
  recommended_price DECIMAL(10,2),
  discounts_active BOOLEAN,
  bundle_offers JSONB,
  
  updated_at TIMESTAMP
);
```

### 1.2 Estrutura de Pastas (Backend)

```
src/
├── properties/
│   ├── controllers/
│   │   ├── property.controller.ts
│   │   ├── listing.controller.ts
│   │   └── unit-type.controller.ts
│   ├── services/
│   │   ├── property.service.ts
│   │   ├── listing.service.ts
│   │   ├── pricing.service.ts       # Precificação dinâmica
│   │   └── sync.service.ts          # Sincronização multi-plataforma
│   ├── models/
│   │   ├── property.model.ts
│   │   ├── listing.model.ts
│   │   └── strategy.model.ts
│   └── routes/
│       └── properties.routes.ts
│
├── listings/
│   ├── templates/
│   │   ├── airbnb/
│   │   │   ├── kitnet-template.ts
│   │   │   └── apartment-template.ts
│   │   ├── booking/
│   │   │   ├── kitnet-template.ts
│   │   │   └── apartment-template.ts
│   │   └── vrbo/
│   │       ├── kitnet-template.ts
│   │       └── apartment-template.ts
│   └── templates.registry.ts         # Registro centralizado
│
├── integrations/
│   ├── airbnb/
│   │   ├── client.ts
│   │   ├── sync.ts
│   │   └── webhook.ts
│   ├── booking/
│   │   ├── client.ts
│   │   ├── sync.ts
│   │   └── webhook.ts
│   ├── vrbo/
│   │   ├── client.ts
│   │   ├── sync.ts
│   │   └── webhook.ts
│   └── base-sync.interface.ts       # Interface comum
│
├── campaigns/
│   ├── lead-capture.service.ts
│   ├── marketing.service.ts
│   └── analytics.service.ts
│
└── workers/
    ├── sync-listings.worker.ts      # Sincroniza anúncios
    ├── update-pricing.worker.ts     # Atualiza preços dinâmicos
    └── lead-management.worker.ts    # Gestão de leads
```

---

## Parte 2: Templates de Anúncios Multi-Plataforma

### 2.1 Estrutura de Template Centralizado

```typescript
// src/listings/templates/listing-template.interface.ts

interface ListingTemplate {
  // Identificação
  unitTypeKey: string;         // ex: 'KITNET_1QT_BASIC'
  targetSegment: string;       // 'student', 'professional', 'tourist'
  
  // Conteúdo Base (único para todas plataformas)
  baseContent: {
    headline: string;
    shortDescription: string;
    fullDescription: string;
    keyBenefits: string[];
    amenitiesList: string[];
    targetGuestProfile: string;
  };
  
  // Variações por Plataforma
  platformVariations: {
    airbnb: PlatformVariation;
    booking: PlatformVariation;
    vrbo: PlatformVariation;
    direct: PlatformVariation;
  };
  
  // Estratégia de Precificação
  pricingStrategy: {
    basePrice: number;
    seasonalAdjustments: {
      season: string;
      multiplier: number;
    }[];
    occupancyPricing: {
      occupancyRange: [number, number];
      priceMultiplier: number;
    }[];
  };
  
  // SEO e Descoberta
  seo: {
    keywords: string[];
    tags: string[];
    searchOptimization: string[];
  };
}

interface PlatformVariation {
  // Específico da plataforma
  title: string;
  description: string;
  amenitiesMapping: Record<string, string>; // Mapa entre campos
  imageStrategy: 'hero_first' | 'variety' | 'detail_first';
  highlightFeatures: string[];
  cta: string; // Call-to-action customizado
  cancellationPolicy: string;
}
```

### 2.2 Template: Kitnet 1 Quarto Básica

```typescript
// src/listings/templates/airbnb/kitnet-template.ts

export const KITNET_1QT_BASIC_AIRBNB = {
  // AIRBNB TEMPLATE
  title: "Kitnet Moderna perto UFSC - WiFi e Ar Condicionado",
  
  description: `
🎓 **Ideal para Estudantes e Profissionais**

Kitnet funcional e bem localizada, perfeita para quem estuda ou trabalha na região da UFSC.

**O QUE VOCÊ TEM:**
✅ Quarto com cama casal (1.40m)
✅ Cozinha integrada com geladeira e fogão
✅ Banheiro completo com chuveiro quente
✅ WiFi 100 Mbps (incluso)
✅ Ar condicionado split (na maioria das unidades)
✅ Ventilador de teto
✅ Roupas de cama e toalhas limpas
✅ Varanda/sacada

**LOCALIZAÇÃO:**
📍 Carvoeira, a 5 minutos da UFSC
🚌 Perto de ônibus direto para o campus
🏪 Supermercado, farmácia e comércios a pé

**COMO FUNCIONA:**
- Contrato mensal (mínimo 1 mês)
- Caução de 1x o valor mensal
- Luz e água inclusos no valor
- Sem taxas administrativas

**IDEAL PARA:**
👨‍🎓 Estudantes de graduação e pós
👩‍💼 Profissionais em relocação
🏠 Quem busca rotina de estudo/trabalho

**NÃO ALUGAMOS PARA:**
- Festas/eventos
- Temporada (por noites)

Pergunte sobre descontos para contratos de 6+ meses!
  `,
  
  amenities: [
    "WiFi", "Ar Condicionado", "Cozinha", "Cama queen",
    "Chuveiro quente", "TV", "Geladeira", "Roupas de cama",
    "Toalhas", "Estacionamento (sob consulta)"
  ],
  
  highlights: [
    "Perfeito para estudantes",
    "Perto da UFSC",
    "Furnished e equipado",
    "WiFi rápida incluída"
  ],
  
  guestProfile: `
Estudantes de graduação e pós-graduação, profissionais em relocação,
pessoas que estudam/trabalham na região e buscam moradia funcional
por período determinado.
  `,
};

// src/listings/templates/booking/kitnet-template.ts

export const KITNET_1QT_BASIC_BOOKING = {
  // BOOKING.COM TEMPLATE (foco em comodidades)
  title: "Kitnet Estudantil com WiFi Rápida - UFSC Carvoeira",
  
  description: `
Kitnet bem localizada, funcional e confortável, especialmente indicada para
estudantes e profissionais que trabalham/estudam na região de Carvoeira.

Equipamento completo:
- Quarto com cama casal nova
- Cozinha com fogão, geladeira
- Banheiro privativo
- Ar condicionado (maioria) / Ventilador
- WiFi 100Mbps incluída
- Roupas de cama e toalhas limpas

Localização estratégica a 5 min da UFSC, com fácil acesso a transporte
e comércios. Disponível para contratos mensais com caução de 1x aluguel.

Ideal para estadias de 1-12 meses.
  `,
  
  amenities: [
    "Free WiFi", "Air conditioning", "Kitchen",
    "Shared kitchen", "Private bathroom", "Heating",
    "Bed linens", "Towels", "TV"
  ],
  
  highlights: [
    "Near UFSC Campus",
    "Perfect for students",
    "Fast internet included",
    "Monthly rental available"
  ],
  
  housePolicies: `
- Check-in: 14:00
- Check-out: 12:00
- Minimum stay: 1 month
- No parties or events allowed
- Smoking not allowed
- Pets not allowed (by default)
  `,
};

// src/listings/templates/vrbo/kitnet-template.ts

export const KITNET_1QT_BASIC_VRBO = {
  // VRBO TEMPLATE (foco em estadia prolongada)
  title: "Furnished Studio Near UFSC - Perfect for Students",
  
  description: `
Comfortable, fully furnished kitnet (studio apartment) located in the Carvoeira
neighborhood, just 5 minutes from UFSC campus.

WHAT'S INCLUDED:
✓ Full bedroom with quality mattress
✓ Equipped kitchen (stove, fridge, microwave)
✓ Private bathroom
✓ Air conditioning or ceiling fan
✓ High-speed WiFi (100 Mbps)
✓ Linens and towels
✓ TV
✓ Furnished and ready to live

LOCATION BENEFITS:
• Walking distance to shops and services
• Direct bus lines to UFSC campus
• Safe neighborhood
• Quiet residential area

LEASE TERMS:
- Minimum 1 month
- Security deposit: 1 month's rent
- Utilities (electricity & water) included
- Monthly contract basis
- No administrative fees

PERFECT FOR:
- Graduate and undergraduate students
- Visiting professionals
- Academics on temporary assignment
- Short to medium-term stays (1-12 months)

Available for immediate occupancy.
Contact for current pricing and availability.
  `,
  
  amenities: [
    "Kitchen", "Refrigerator", "Stove", "Microwave",
    "WiFi", "Air conditioning", "Heating", "Bedroom",
    "Bathroom", "Linens", "Towels", "TV", "Balcony"
  ],
  
  houseRules: [
    "Check-in after 2:00 PM",
    "Check-out before 12:00 PM",
    "No parties or large gatherings",
    "No smoking inside",
    "Pets not allowed",
    "Respect quiet hours (22:00-08:00)",
    "No short-term sublets"
  ],
};
```

### 2.3 Template: Apartamento 2 Quartos

```typescript
// src/listings/templates/airbnb/apartment-2qt-template.ts

export const APT_2QT_STANDARD_AIRBNB = {
  title: "Apartamento 2 Quartos com Varanda - Milton Sullivan UFSC",
  
  description: `
🏡 **Para Casais, Amigos ou Família**

Apartamento espaçoso no coração de Carvoeira, perfeito para 2 pessoas
ou equipes que trabalham/estudam juntas.

**ESPAÇO:**
✅ 2 quartos (1 cama casal, 1 cama de solteiro)
✅ 2 banheiros completos
✅ Sala integrada com TV
✅ Cozinha equipada (fogão, geladeira, micro-ondas)
✅ Área de serviço
✅ Varanda/sacada com vista

**CONFORTO:**
✅ WiFi 100 Mbps
✅ Ar condicionado split (nos quartos)
✅ Ventiladores de teto
✅ Roupas de cama premium
✅ Toalhas limpas incluídas

**LOCALIZAÇÃO:**
📍 Milton Sullivan, Carvoeira - 5 min da UFSC
🚌 Transporte público nas portas
🏪 Comércios, restaurantes e farmácia próximos

**FUNCIONA BEM PARA:**
👥 Casais
📚 Duplas de estudantes
👩‍💼👨‍💼 Profissionais que se conhecem
👨‍👩‍👧 Famílias pequenas

**TERMOS:**
- Contrato mensal
- Caução de 1x aluguel
- Luz e água inclusos
- Sem taxa administrativa
- Descontos para 6+ meses

Reserve agora e aproveite!
  `,
  
  amenities: [
    "2 Quartos", "2 Banheiros", "WiFi", "Ar Condicionado",
    "Cozinha Equipada", "Varanda", "TV", "Roupas de Cama",
    "Toalhas", "Micro-ondas", "Ventiladores"
  ],
  
  highlights: [
    "Espaço para 2+ pessoas",
    "Perto da UFSC",
    "Confortável e funcional",
    "WiFi rápida incluída"
  ],
};
```

---

## Parte 3: Estratégia de Anúncios Multi-Canal

### 3.1 Matriz de Posicionamento

```
┌─────────────────────────────────────────────────────┐
│         ESTRATÉGIA DE ANÚNCIOS POR CANAL            │
└─────────────────────────────────────────────────────┘

╔════════════════╦═════════════╦════════════════════╗
║  Canal         ║ Público     ║ Posicionamento     ║
╠════════════════╬═════════════╬════════════════════╣
║ AIRBNB         ║ Turistas    ║ "Experiência local"║
║ (Alto volume)  ║ + Estudantes║ + "Comodidade"     ║
║                ║             ║ + "Flexibilidade"  ║
╠════════════════╬═════════════╬════════════════════╣
║ BOOKING        ║ Viajantes   ║ "Conforto & valor" ║
║ (Corporativo)  ║ Corporativos║ + "Localização"    ║
║                ║             ║ + "Serviços"       ║
╠════════════════╬═════════════╬════════════════════╣
║ VRBO           ║ Estadias    ║ "Home away home"   ║
║ (Long-term)    ║ Longas (6+) ║ + "Funcionalidade" ║
║                ║             ║ + "Privacidade"    ║
╠════════════════╬═════════════╬════════════════════╣
║ SITE PRÓPRIO   ║ Estudantes  ║ "Direto do dono"   ║
║ (Direto)       ║ + Locais    ║ + "Sem intermediar"║
║ + WhatsApp     ║             ║ + "Descontos"      ║
╠════════════════╬═════════════╬════════════════════╣
║ GOOGLE ADS     ║ Buscadores  ║ "UFSC + aluguel"   ║
║ + Meta Ads     ║ Segmentados ║ + "Kitnets"        ║
║ (Campanhas)    ║             ║ + "Carvoeira"      ║
╚════════════════╩═════════════╩════════════════════╝
```

### 3.2 Fluxo de Lead Integrado

```
┌──────────────────────────────────────────────────────────┐
│         FUNIL DE CONVERSÃO - INTEGRADO AO RENTAL SYNC    │
└──────────────────────────────────────────────────────────┘

       [ANÚNCIO PUBLICADO]
              │
              ↓
    ┌─────────────────────┐
    │  ATRAÇÃO (Awareness)│
    │  Airbnb / Booking   │
    │  Google Ads / Meta  │
    │  Site próprio       │
    └──────────┬──────────┘
              │
         CTR: 2-5%
              │
              ↓
    ┌─────────────────────┐
    │ CONSIDERAÇÃO (Lead) │
    │ Clique no anúncio   │
    │ Vê galeria + detalhes
    │ Primeiro contato:   │
    │ - Email automático  │
    │ - WhatsApp bot      │
    └──────────┬──────────┘
              │
      Conversion: 5-10%
              │
              ↓
    ┌─────────────────────┐
    │ CONSULTA (Inquiry)  │
    │ Contato via WhatsApp│
    │ Perguntas específicas
    │ Resposta em < 10min │
    │ Foto da unidade     │
    │ Agende visita       │
    └──────────┬──────────┘
              │
      Show-rate: 60-70%
              │
              ↓
    ┌─────────────────────┐
    │ VISITA (Touring)    │
    │ Vê in loco          │
    │ Conhece localização │
    │ Tira dúvidas        │
    └──────────┬──────────┘
              │
      Booking rate: 70-85%
              │
              ↓
    ┌─────────────────────┐
    │  FECHAMENTO (Close) │
    │ Assinatura contrato │
    │ Pagamento caução    │
    │ Data de entrada     │
    │ Onboarding          │
    └──────────┬──────────┘
              │
              ↓
    ┌─────────────────────┐
    │ RETENÇÃO (Loyalty)  │
    │ Contato pós-locação │
    │ Pedido de review    │
    │ Referências         │
    │ Renovação contrato  │
    └─────────────────────┘
```

### 3.3 Campanhas de Anúncios Recomendadas

```yaml
CAMPANHAS_RECOMENDADAS:
  
  CAMPANHA_1: "UFSC + Kitnets"
    Target: Estudantes que buscam habitação UFSC
    Canais: Google Ads + Meta Ads
    Keywords:
      - "kitnet perto UFSC"
      - "aluguel UFSC Carvoeira"
      - "habitação estudantil Florianópolis"
      - "apartamento UFSC"
    Budget_Dia: R$ 100-150
    Expected_CPL: R$ 15-25
    
  CAMPANHA_2: "Visita + Desconto"
    Target: Leads quentes (já pesquisaram)
    Tipo: Retargeting
    CTA: "Agende sua visita - Desconto de 5%"
    Budget_Dia: R$ 50
    Expected_ROI: 300-400%
    
  CAMPANHA_3: "Contrato Longo"
    Target: Profissionais + Postdocs
    Copy: "Contrato 6+ meses = Desconto"
    Budget_Dia: R$ 75
    Expected_CPL: R$ 20-30
    
  CAMPANHA_4: "Referência"
    Target: Clientes atuais
    Copy: "Indique e ganhe R$ 500"
    Channel: Email + WhatsApp
    Custo: Variável (comissão)
    
  CAMPANHA_5: "Sazonal"
    Target: Turistas + Visitantes
    Período: Jan, Jul, Dez
    Channel: Airbnb (organic boost)
    Budget_Dia: R$ 200
```

---

## Parte 4: Implementação no Rental Sync

### 4.1 Database Schema (Adições ao Rental Sync)

```typescript
// backend/src/models/property-catalog.ts

interface PropertyCatalog {
  // Catálogo Centralizado
  id: string;
  name: string;
  address: string;
  city: 'Florianópolis';
  neighborhood: string;
  
  // Caracterização
  unitType: 'kitnet_1qt' | 'apt_2qt' | 'apt_3qt';
  area: number;
  occupancy: {
    min: number;
    max: number;
    target: string;
  };
  
  // Imagens (Galeria Central)
  images: {
    id: string;
    url: string;
    category: 'bedroom' | 'kitchen' | 'bathroom' | 'living' | 'exterior';
    order: number;
    description: string;
  }[];
  
  // Amenidades Padronizadas
  amenities: {
    wifi: boolean;
    airConditioning: 'split' | 'window' | 'none';
    kitchen: boolean;
    furnished: boolean;
    washer: boolean;
    parking: boolean;
    balcony: boolean;
    [key: string]: any;
  };
  
  // Pricing
  pricing: {
    monthlyRate: number;
    weeklyDiscount: number;
    securityDeposit: number;
    utilitiesIncluded: string[]; // ['water', 'electricity']
    currencyCode: 'BRL' | 'USD';
  };
  
  // Contratos
  contractTerms: {
    minimumStay: number;
    maximumStay: number;
    cancellationPolicy: string;
    checkInTime: string;
    checkOutTime: string;
  };
}

interface ListingCatalog {
  id: string;
  propertyId: string;
  platform: 'airbnb' | 'booking' | 'vrbo' | 'direct';
  
  // Conteúdo Customizado
  title: string;
  description: string;
  amenitiesText: string;
  highlights: string[];
  
  // Performance Tracking
  metrics: {
    views: number;
    clicks: number;
    bookings: number;
    conversionRate: number;
    lastUpdated: Date;
  };
  
  // Sincronização
  syncStatus: 'synced' | 'pending' | 'error';
  platformListingId: string;
  syncedAt: Date;
}

interface LeadRecord {
  id: string;
  propertyId: string;
  listingId: string;
  sourceChannel: 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'ads' | 'referral';
  
  // Informações do Lead
  name: string;
  email: string;
  phone: string;
  
  // Funil
  stage: 'inquiry' | 'tour_scheduled' | 'touring' | 'negotiation' | 'closed' | 'lost';
  
  // Histórico
  firstContact: Date;
  lastContact: Date;
  touchpoints: {
    channel: string;
    message: string;
    timestamp: Date;
  }[];
  
  // Analytics
  sourceAdCampaign?: string;
  cplCost?: number;
}
```

### 4.2 API Endpoints Necessários

```typescript
// backend/src/routes/properties-catalog.ts

// Gestão de Propriedades
POST   /api/v1/properties          // Criar nova propriedade
GET    /api/v1/properties          // Listar todas (com filtros)
GET    /api/v1/properties/:id      // Detalhes completos
PUT    /api/v1/properties/:id      // Atualizar propriedade
DELETE /api/v1/properties/:id      // Arquivar propriedade

// Gestão de Anúncios
POST   /api/v1/listings            // Criar anúncio em plataforma
GET    /api/v1/listings            // Listar anúncios por propriedade
GET    /api/v1/listings/:id        // Detalhes do anúncio
PUT    /api/v1/listings/:id        // Atualizar conteúdo
DELETE /api/v1/listings/:id        // Remover de plataforma

// Sincronização
POST   /api/v1/sync/publish        // Publicar em todas as plataformas
POST   /api/v1/sync/update         // Atualizar em todas as plataformas
POST   /api/v1/sync/status         // Status de sincronização

// Pricing Dinâmico
POST   /api/v1/pricing/update      // Atualizar preços
GET    /api/v1/pricing/recommendations  // Recomendações

// Leads & Funil
POST   /api/v1/leads               // Registrar novo lead
GET    /api/v1/leads               // Listar leads com filtros
PUT    /api/v1/leads/:id           // Atualizar estágio do lead
GET    /api/v1/analytics/funnel    // Analytics do funil

// Campanhas
POST   /api/v1/campaigns           // Criar campanha
GET    /api/v1/campaigns/:id       // Detalhes + performance
PUT    /api/v1/campaigns/:id/budget // Ajustar orçamento
```

### 4.3 Workers (Sincronização Automática)

```typescript
// backend/src/workers/sync-listings.worker.ts

async function syncListingsWorker() {
  // A cada 6 horas
  
  const properties = await getActiveProperties();
  
  for (const property of properties) {
    // Sincroniza em cada plataforma
    const airbnbSync = await airbnbClient.updateListing(property);
    const bookingSync = await bookingClient.updateListing(property);
    const vrboSync = await vrboClient.updateListing(property);
    
    // Registra resultados
    await logSyncStatus({
      propertyId: property.id,
      results: { airbnb: airbnbSync, booking: bookingSync, vrbo: vrboSync }
    });
  }
}

// backend/src/workers/update-pricing.worker.ts

async function updatePricingWorker() {
  // A cada 12 horas
  
  const properties = await getPropertiesForDynamicPricing();
  
  for (const property of properties) {
    // Calcula preço recomendado
    const occupancy = await getOccupancyRate(property.id);
    const seasonality = getSeasonFactor();
    const demand = await estimateDemand(property);
    
    const recommendedPrice = calculateDynamicPrice({
      basePrice: property.pricing.monthlyRate,
      occupancy,
      seasonality,
      demand
    });
    
    // Atualiza plataformas
    await airbnbClient.updatePrice(property.id, recommendedPrice);
    await bookingClient.updatePrice(property.id, recommendedPrice);
  }
}

// backend/src/workers/lead-management.worker.ts

async function leadManagementWorker() {
  // A cada hora
  
  // SLA: Responder em 10 minutos
  const pendingLeads = await getLeadsNeedingResponse();
  
  for (const lead of pendingLeads) {
    const templateData = await getLeadResponseTemplate(lead);
    
    // Envia resposta automática
    await whatsappClient.send(lead.phone, templateData);
    
    // Atualiza status
    await updateLeadStatus(lead.id, 'responded');
    
    // Agenda follow-up
    await scheduleFollowUp(lead.id, lead.stage);
  }
  
  // Limpeza: Leads sem resposta por 72h
  const staleLead = await getStaleLead(72);
  for (const lead of staleLeads) {
    await moveToWaitlist(lead.id);
  }
}
```

---

## Parte 5: Frontend (Painel de Controle)

### 5.1 Telas Principais

```
┌──────────────────────────────────────────────────┐
│          DASHBOARD - PAINEL DE CONTROLE          │
└──────────────────────────────────────────────────┘

[TAB 1: VISÃO GERAL]
  ├─ Cards KPI
  │  ├─ Total Imóveis: 31
  │  ├─ Ocupação: 73%
  │  ├─ Receita Mês: R$ 48.320
  │  └─ Leads Ativos: 12
  │
  ├─ Gráficos
  │  ├─ Ocupação por Imóvel (linhas)
  │  ├─ Receita 3 meses (barras)
  │  ├─ Funil de Conversão (funil)
  │  └─ Performance por Canal (pizza)

[TAB 2: IMÓVEIS]
  ├─ Tabela com filtros
  │  ├─ Endereço, Tipo, Ocupação, Status
  │  ├─ Ações: Editar, Ver Anúncios, Analytics
  │  └─ Bulk: Publicar/Despublicar
  │
  ├─ Criar Novo Imóvel
  │  └─ Wizard: Básico → Características → Imagens → Publish

[TAB 3: ANÚNCIOS]
  ├─ Kanban por Status
  │  ├─ Rascunho → Pendente → Publicado → Sincronizado
  │  └─ Drag & drop para mudar status
  │
  ├─ Edição em Massa
  │  └─ Atualizar template para múltiplos anúncios

[TAB 4: LEADS]
  ├─ Funil Visual (Kanban)
  │  ├─ Novo (12) → Contatado (8) → Tour (3) → Fechado (2)
  │  └─ Drag & drop para próxima etapa
  │
  ├─ Detalhes do Lead
  │  ├─ Histórico de contatos
  │  ├─ Notas
  │  ├─ Próximo follow-up
  │  └─ Ações: Enviar WhatsApp, Agendar visita, etc

[TAB 5: CAMPANHAS]
  ├─ Lista de Campanhas
  │  ├─ Impressões, Clicks, Conversões, CPL
  │  ├─ Orçamento gasto vs. planejado
  │  └─ Ações: Pausar, Aumentar orçamento, etc
  │
  ├─ Criador de Campanha
  │  └─ Wizard: Segmentação → Copy → Budget → Publish

[TAB 6: PRICING]
  ├─ Tabela de Preços Atual
  │  └─ Base Price vs. Dynamic Price
  │
  ├─ Histórico e Recomendações
  │  └─ IA sugere ajustes baseado em ocupação/demanda
```

### 5.2 Painel de Criação de Anúncios

```typescript
// frontend/src/components/ListingCreator.tsx

<ListingCreator>
  
  <Step 1: Seleção de Propriedade>
    └─ Dropdown com lista de 31 imóveis
  
  <Step 2: Escolher Template>
    ├─ Kitnet 1 QT Básica (20 unidades)
    ├─ Apartamento 2 QT (6 unidades)
    └─ Apartamento 3 QT (5 unidades)
  
  <Step 3: Customização de Conteúdo>
    ├─ Título (preview por plataforma)
    ├─ Descrição (editor rich text)
    ├─ Amenidades (checklist)
    ├─ Highlights (tags)
    └─ Call-to-action customizado
  
  <Step 4: Gestão de Imagens>
    ├─ Upload/Ordem de fotos
    ├─ Descrição por foto
    ├─ Preview por plataforma
    └─ Crop/Ajustes básicos
  
  <Step 5: Configurações de Preço>
    ├─ Preço base
    ├─ Desconto para contratos longos
    ├─ Sazonalidade
    └─ Currency
  
  <Step 6: Seleção de Plataformas>
    ├─ ☑ Airbnb
    ├─ ☑ Booking
    ├─ ☑ VRBO
    ├─ ☑ Site próprio
    └─ Review final antes de publicar
  
  <Action Buttons>
    ├─ Salvar como Rascunho
    ├─ Publicar Agora
    └─ Programar Publicação
```

---

## Parte 6: Integração com Plataformas

### 6.1 Sincronização Multi-Plataforma

```typescript
// backend/src/integrations/base-sync.interface.ts

interface PlatformSyncClient {
  platform: 'airbnb' | 'booking' | 'vrbo';
  
  // Core Operations
  createListing(data: ListingData): Promise<SyncResult>;
  updateListing(id: string, data: ListingData): Promise<SyncResult>;
  deleteListing(id: string): Promise<SyncResult>;
  
  // Pricing
  updatePrice(id: string, price: number): Promise<SyncResult>;
  updateAvailability(id: string, availability: AvailabilityData): Promise<SyncResult>;
  
  // Analytics
  getListingMetrics(id: string): Promise<Metrics>;
  getConversions(id: string, dateRange: DateRange): Promise<Conversion[]>;
  
  // Webhooks
  verifyWebhookSignature(signature: string, payload: string): boolean;
  handleWebhookEvent(event: WebhookEvent): Promise<void>;
}

// Implementação para cada plataforma
export class AirbnbSyncClient implements PlatformSyncClient {
  private apiKey: string;
  private apiUrl = 'https://api.airbnb.com/v2';
  
  async createListing(data: ListingData): Promise<SyncResult> {
    // Transforma dados genéricos para formato Airbnb
    const airbnbData = this.transformToAirbnb(data);
    
    const response = await fetch(`${this.apiUrl}/listings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(airbnbData)
    });
    
    return {
      success: response.ok,
      platformId: response.json().id,
      syncedAt: new Date()
    };
  }
  
  private transformToAirbnb(data: ListingData): any {
    // Converte campos genéricos para específicos do Airbnb
    return {
      name: data.title,
      description: data.description,
      room_type: data.roomType, // 'Entire home/apt' | 'Private room'
      property_type: 'Apartment',
      accommodates: data.occupancy.max,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      amenities: this.mapAmenities(data.amenities),
      price: data.price,
      availability_settings: {
        availability: 'available_all_year'
      }
    };
  }
}

export class BookingSyncClient implements PlatformSyncClient {
  // Similar para Booking.com
  // Diferenças: formato de dados, autenticação, endpoints
}

export class VrboSyncClient implements PlatformSyncClient {
  // Similar para VRBO
  // Diferenças: relacionado com Expedia, outras políticas
}
```

### 6.2 Webhooks das Plataformas

```typescript
// backend/src/integrations/webhooks.controller.ts

@Post('/webhooks/airbnb')
async handleAirbnbWebhook(@Body() payload: any, @Headers('X-Airbnb-Signature') signature: string) {
  // Verifica assinatura
  const isValid = airbnbClient.verifyWebhookSignature(signature, JSON.stringify(payload));
  
  if (!isValid) throw new UnauthorizedException();
  
  // Processa evento
  const event = payload.event_type;
  
  switch(event) {
    case 'booking.created':
      await handleNewBooking(payload);
      break;
    case 'booking.updated':
      await handleBookingUpdate(payload);
      break;
    case 'inquiry.created':
      await handleInquiry(payload);
      break;
    case 'review.created':
      await handleReview(payload);
      break;
  }
  
  return { success: true };
}

@Post('/webhooks/booking')
async handleBookingWebhook(@Body() payload: any) {
  // Similar para Booking
}

@Post('/webhooks/vrbo')
async handleVrboWebhook(@Body() payload: any) {
  // Similar para VRBO
}
```

---

## Parte 7: KPIs e Analytics

### 7.1 Dashboard de Performance

```
╔════════════════════════════════════════════════╗
║        MÉTRICAS CHAVE POR PROPRIEDADE          ║
╠════════════════════════════════════════════════╣

📊 POT-25 (Kitnet 1QT - Pottker)
  Unidades: 20 | Ocupação: 78% | Taxa: R$ 1.750/mês
  ├─ Receita Mês: R$ 27.300 (de R$ 35.000 potencial)
  ├─ Leads Mês: 45 (CPL: R$18)
  ├─ Taxa Conversão: 8.9% (4 bookings)
  ├─ Reviews: 4.6/5 (18 reviews)
  └─ Maior Canal: Google Ads (40%), Airbnb (35%)

📊 MS-142 (Apt 2QT - Milton Sullivan)
  Unidades: 6 | Ocupação: 67% | Taxa: R$ 2.250/mês
  ├─ Receita Mês: R$ 9.045 (de R$ 13.500 potencial)
  ├─ Leads Mês: 12 (CPL: R$22)
  ├─ Taxa Conversão: 6.7% (0-1 booking)
  ├─ Reviews: 4.4/5 (8 reviews)
  └─ Maior Canal: Booking (45%), Airbnb (30%)

📊 AMN-214 (Misto - Ana Maria Nunes)
  Unidades: 5 | Ocupação: 72% | Taxa Média: R$ 2.450/mês
  ├─ Receita Mês: R$ 8.820 (de R$ 12.250 potencial)
  ├─ Leads Mês: 8 (CPL: R$25)
  ├─ Taxa Conversão: 12.5% (1 booking)
  ├─ Reviews: 4.7/5 (12 reviews)
  └─ Maior Canal: VRBO (50%), Booking (30%)

═════════════════════════════════════════════════

📈 CONSOLIDADO (31 unidades)
  Receita Total: R$ 45.165 (de R$ 60.750 potencial)
  Ocupação Média: 72% (Target: 85%)
  Leads Mês: 65
  Conversão Média: 8.5%
  CPL Médio: R$ 21
  Reviews Médio: 4.6/5
```

### 7.2 Metricas a Rastrear

```typescript
interface PropertyMetrics {
  // Ocupação & Disponibilidade
  occupancyRate: number;          // 0-100%
  daysBooked: number;             // mês atual
  daysAvailable: number;
  bookingsCount: number;
  
  // Financeiro
  monthlyRevenue: number;
  projectedRevenue: number;
  averageNightlyRate: number;
  pricePerSqm: number;
  
  // Leads & Vendas
  incomingLeads: number;
  conversionsCount: number;
  conversionRate: number;         // %
  cplCost: number;                // R$
  daysToClose: number;            // média
  
  // Qualidade
  averageRating: number;          // 1-5
  reviewsCount: number;
  reviewSentimentScore: number;   // -1 a 1
  
  // Plataformas
  channelPerformance: {
    airbnb: ChannelMetrics;
    booking: ChannelMetrics;
    vrbo: ChannelMetrics;
    direct: ChannelMetrics;
    ads: ChannelMetrics;
  };
  
  // Sazonalidade
  seasonalPattern: {
    month: string;
    occupancy: number;
    revenue: number;
  }[];
}

interface ChannelMetrics {
  views: number;
  clicks: number;
  inquiries: number;
  bookings: number;
  conversionRate: number;
  avgRating: number;
  lastSync: Date;
}
```

---

## Parte 8: Implementação Faseada

### 8.1 Roadmap de Desenvolvimento

```
FASE 1: MVP (Semanas 1-3)
├─ Database de propriedades (31 unidades)
├─ Templates básicos (3 tipos de unidade)
├─ Manual listing creation (Airbnb + Booking)
├─ Dashboard simples
└─ Lead tracking básico

FASE 2: Automação (Semanas 4-6)
├─ Sincronização automática multi-plataforma
├─ Workers: sync-listings, pricing, leads
├─ Webhooks das plataformas
├─ Pricing dinâmico
└─ Funil de leads integrado

FASE 3: Otimização (Semanas 7-9)
├─ Campanhas Google Ads + Meta
├─ Templates por segmento de mercado
├─ Analytics avançado
├─ Recomendações de IA (preço, conteúdo)
└─ Automação de follow-up

FASE 4: Escala (Semana 10+)
├─ Mais plataformas (Hotéis.com, etc)
├─ Multi-idioma
├─ Integração com CRM
├─ Relatórios customizados
└─ Mobile app
```

### 8.2 Modelo de Dados Completo (SQL)

```sql
-- Executar após criar banco Rental Sync

-- Tipos de Unidade (Catálogo)
INSERT INTO unit_types VALUES
('kitnet-1qt-basic', 'Kitnet 1 Quarto Básica', 'kitnet', 25, 28, 1, 1, '1 pessoa', 1700.00, ...),
('apt-2qt-compact', 'Apartamento 2 Quartos Compacto', 'apartamento', 30, 35, 2, 2, '2 pessoas', 2250.00, ...),
('apt-3qt-deluxe', 'Apartamento 3 Quartos Deluxe', 'apartamento', 80, 80, 3, 2, '3-4 pessoas', 3700.00, ...);

-- Proprietários
INSERT INTO property_owners (name, email, phone) VALUES
('UFSC Habitação', 'habitat@ufsc.br', '(48) 3721-9000'),
('Gestor Locação', 'gestor@imov.br', '(48) 9999-9999');

-- Imóveis (Dados reais)
INSERT INTO properties VALUES
('pot-25-001', ..., 'Pottker 25', 'Carvoeira', ..., 'kitnet', 25.0, 1, 1, 'Térreo', 1, '1 pessoa', ..., 1650.00, 1650.00),
('pot-25-002', ..., 'Pottker 25', 'Carvoeira', ..., 'kitnet', 25.0, 1, 1, 'Térreo', 1, '1 pessoa', ..., 1650.00, 1650.00),
-- ... mais 18 de Pottker
('ms-142-001', ..., 'Milton Sullivan 142', 'Carvoeira', ..., 'apt-2qt', 30.0, 2, 1, 'Térreo', 2, '2 pessoas', ..., 2150.00, 2150.00),
-- ... mais 5 de Milton Sullivan
('amn-214-001', ..., 'Ana Maria Nunes 214', 'Córrego Grande', ..., 'apt-3qt', 80.0, 3, 2, '2º piso', 4, '3-4 pessoas', ..., 3700.00, 3700.00),
-- ... mais 4 de Ana Maria Nunes;
```

---

## Parte 9: Estratégia de Marketing

### 9.1 Copy por Segmento

```
🎓 ESTUDANTE
├─ Headline: "Kitnet para Estudante UFSC - WiFi Rápida"
├─ Copy: "Funcional, seguro e a 5 minutos da UFSC"
├─ CTA: "Agende sua visita"
└─ Desconto: 5% por 6+ meses

👨‍💼 PROFISSIONAL/POSTDOC
├─ Headline: "Apartamento para Profissional - Conforto & Localização"
├─ Copy: "Espaço completo para quem trabalha em Florianópolis"
├─ CTA: "Consulte disponibilidade"
└─ Desconto: Contrato anual

🏖️ TURISTA/VISITANTE
├─ Headline: "Explore Florianópolis - Estadia Confortável"
├─ Copy: "Bem localizado, espaçoso, pronto para sua chegada"
├─ CTA: "Reserve agora"
└─ Desconto: Early booking 10%

👨‍👩‍👧 FAMÍLIA
├─ Headline: "Apartamento Espaçoso para Sua Família"
├─ Copy: "Localização segura, completo e aconchegante"
├─ CTA: "Solicite mais informações"
└─ Desconto: Contrato longo
```

### 9.2 Calendário de Campanhas

```
JANEIRO - FEVEREIRO (Alta Demanda Turística)
├─ Foco: Airbnb + VRBO (turistas)
├─ Budget: R$ 400/dia
├─ Copy: "Explore Florianópolis"
└─ Desconto: Early booking -10%

MARÇO - JULHO (Época Acadêmica)
├─ Foco: Google Ads + Meta (estudantes)
├─ Budget: R$ 200/dia
├─ Copy: "Kitnet para Estudante"
└─ Desconto: 5% por 6+ meses

AGOSTO - DEZEMBRO (Misto)
├─ Foco: Booking (corporativo) + Airbnb
├─ Budget: R$ 250/dia
├─ Copy: "Múltiplos públicos"
└─ Desconto: Contrato anual

ESPECIAL: Feriados
├─ Ponte de feriados: +20% orçamento
├─ Copy: "Fuja para Floripa"
└─ Limite: Últimas 4 semanas
```

---

## Parte 10: Próximos Passos

### 10.1 Ações Imediatas (Próximas 2 semanas)

1. **Preparar Dados**
   - [ ] Fotografia profissional de todas as 31 unidades
   - [ ] Descrições detalhadas por tipo de unidade
   - [ ] Vídeo de tour de cada endereço

2. **Estruturar BD**
   - [ ] Criar tabelas de propriedades, listings, leads
   - [ ] Importar dados das 31 unidades
   - [ ] Configurar conexões com plataformas

3. **Desenvolver MVP**
   - [ ] Dashboard básico
   - [ ] Criação manual de anúncios
   - [ ] Gestão de leads

### 10.2 Métricas de Sucesso

```
Target 30 dias:
├─ 31 imóveis listados em Airbnb + Booking
├─ 50+ leads capturados
├─ 70%+ ocupação
├─ R$ 45.000+ faturamento
└─ 4.5+ média de reviews
```

---

## Conclusão

Sistema proposto oferece:
- ✅ Base centralizada de 31 unidades
- ✅ Anúncios customizados por plataforma
- ✅ Sincronização automática multi-canal
- ✅ Gestão completa de leads com funil
- ✅ Analytics em tempo real
- ✅ Preços dinâmicos baseado em demanda
- ✅ Integração com campanhas de marketing

**Próximo Passo**: Aprovar estrutura e iniciar Fase 1 (MVP).

