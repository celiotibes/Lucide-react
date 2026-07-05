# Phase 2: Template IA Implementation Plan
**Status**: 🚀 In Progress  
**Feature Source**: Lawyer10 (Feature: Template IA)  
**Estimated Duration**: 3 weeks (1 week for Template IA + OCR + Automação)

---

## 📋 Overview

Implementing AI-powered petition template system with intelligent customization, variable substitution, and user preferences. This is Phase 2a of the 7-8 week expansion roadmap.

### 🎯 Objectives

1. **Template Management System** - Store, version, and organize petition templates
2. **AI-Powered Customization** - Generate template variations based on case context
3. **Variable Substitution** - Smart parameter replacement system
4. **Template Intelligence** - Learn from user preferences and tribunal requirements
5. **Multi-Language Support** - Portuguese (primary), English (secondary)
6. **Performance Optimization** - Redis caching, batch processing

---

## 🏗️ Architecture

### Database Schema

#### templates table
```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'initial', 'intermediate', 'final', 'motion'
  category VARCHAR(100), -- 'indenizacao', 'familia', 'trabalhista'
  content TEXT NOT NULL, -- RTF content
  variables JSON, -- {name, type, required, default}
  tags VARCHAR(255)[],
  jurisdiction VARCHAR(10)[], -- TJSC, TJPR, etc or [] for all
  status VARCHAR(20) DEFAULT 'active',
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  is_template BOOLEAN DEFAULT true,
  usage_count INT DEFAULT 0,
  success_rate DECIMAL(3,2),
  ai_generated BOOLEAN DEFAULT false
);

CREATE INDEX idx_templates_type_category ON templates(type, category);
CREATE INDEX idx_templates_jurisdiction ON templates USING GIN(jurisdiction);
```

#### template_versions table
```sql
CREATE TABLE template_versions (
  id UUID PRIMARY KEY,
  template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
  version INT NOT NULL,
  content TEXT NOT NULL,
  changelog TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);
```

#### template_usage table
```sql
CREATE TABLE template_usage (
  id UUID PRIMARY KEY,
  template_id UUID REFERENCES templates(id),
  petition_id UUID REFERENCES petitions(id),
  variables JSON, -- Filled variables
  customizations JSON, -- AI customizations
  success BOOLEAN,
  feedback TEXT,
  rating INT, -- 1-5 stars
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### template_preferences table
```sql
CREATE TABLE template_preferences (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tribunal_code VARCHAR(10),
  favorite_templates UUID[],
  preferred_style VARCHAR(50), -- 'formal', 'technical', 'aggressive'
  ai_customization_level INT DEFAULT 5, -- 1-10 scale
  auto_substitute BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### Core Components

#### 1. TemplateManager Service

```typescript
// src/services/TemplateManager.ts

export interface TemplateVariable {
  name: string;
  type: 'string' | 'date' | 'number' | 'multiline';
  required: boolean;
  default?: string;
  validation?: RegExp;
  placeholder?: string;
}

export interface Template {
  id: string;
  name: string;
  type: 'initial' | 'intermediate' | 'final' | 'motion';
  category: string;
  content: string;
  variables: TemplateVariable[];
  jurisdiction: string[];
  status: 'active' | 'inactive' | 'draft';
  version: number;
  aiGenerated: boolean;
}

export interface TemplateCustomizationRequest {
  templateId: string;
  variables: Record<string, any>;
  context?: {
    processNumber?: string;
    plaintiff?: string;
    defendant?: string;
    subject?: string;
    caseHistory?: string;
  };
  customizationLevel?: 'minimal' | 'moderate' | 'high';
}

export class TemplateManager {
  // Load template with variables
  async loadTemplate(templateId: string, jurisdiction?: string): Promise<Template>;
  
  // List templates by type/category
  async listTemplates(filter: TemplateFilter): Promise<Template[]>;
  
  // Substitute variables in template
  async substituteVariables(
    content: string,
    variables: Record<string, any>,
  ): Promise<string>;
  
  // AI-powered customization
  async customizeTemplate(
    request: TemplateCustomizationRequest,
  ): Promise<string>;
  
  // Create new template
  async createTemplate(template: Partial<Template>): Promise<Template>;
  
  // Track usage and ratings
  async recordUsage(
    templateId: string,
    petitionId: string,
    success: boolean,
    feedback?: string,
  ): Promise<void>;
  
  // Get user preferences
  async getUserPreferences(userId: string): Promise<TemplatePreferences>;
  
  // Suggest templates based on case context
  async suggestTemplates(context: CaseContext): Promise<Template[]>;
}
```

#### 2. AI Template Customizer

```typescript
// src/ai/templateCustomizer.ts

export class TemplateCustomizer {
  async adaptTemplate(
    template: string,
    variables: Record<string, any>,
    tribunal: string,
    customizationLevel: number, // 1-10
  ): Promise<string>;

  async generateVariationFromContext(
    baseTemplate: string,
    caseContext: CaseContext,
  ): Promise<string[]>; // Multiple variations

  async suggestImprovements(
    content: string,
    tribunal: string,
  ): Promise<Suggestion[]>;

  async validateTemplateLogic(
    content: string,
    variables: TemplateVariable[],
  ): Promise<ValidationError[]>;
}
```

#### 3. Template Repository

```typescript
// src/repositories/TemplateRepository.ts

export class TemplateRepository {
  // CRUD operations
  async create(template: Template): Promise<Template>;
  async findById(id: string): Promise<Template>;
  async findByType(type: string, jurisdiction?: string): Promise<Template[]>;
  async findByCategory(category: string): Promise<Template[]>;
  async update(id: string, updates: Partial<Template>): Promise<Template>;
  async delete(id: string): Promise<void>;
  
  // Version management
  async getVersion(templateId: string, version: number): Promise<Template>;
  async listVersions(templateId: string): Promise<TemplateVersion[]>;
  
  // Usage tracking
  async recordUsage(usage: TemplateUsageRecord): Promise<void>;
  async getUsageStats(templateId: string): Promise<UsageStats>;
  
  // Preferences
  async getUserPreferences(userId: string): Promise<TemplatePreferences>;
  async updateUserPreferences(
    userId: string,
    preferences: Partial<TemplatePreferences>,
  ): Promise<void>;
}
```

---

### API Endpoints

#### Template Management
```
GET    /api/v1/templates                      - List templates
GET    /api/v1/templates/search               - Search templates
GET    /api/v1/templates/:type                - By type (initial, intermediate, final)
GET    /api/v1/templates/:id                  - Get specific template
POST   /api/v1/templates                      - Create template (admin)
PUT    /api/v1/templates/:id                  - Update template
DELETE /api/v1/templates/:id                  - Delete template
GET    /api/v1/templates/:id/versions         - Version history
GET    /api/v1/templates/:id/versions/:ver    - Specific version
```

#### Template Customization
```
POST   /api/v1/templates/:id/customize        - AI customization
POST   /api/v1/templates/:id/substitute       - Variable substitution
POST   /api/v1/templates/:id/validate         - Validate template logic
GET    /api/v1/templates/:id/suggestions      - AI improvement suggestions
```

#### Usage & Analytics
```
GET    /api/v1/templates/:id/usage            - Usage statistics
POST   /api/v1/templates/:id/feedback         - Submit feedback/rating
GET    /api/v1/templates/recommendations      - Personalized recommendations
```

#### User Preferences
```
GET    /api/v1/templates/preferences          - Get user preferences
PUT    /api/v1/templates/preferences          - Update preferences
POST   /api/v1/templates/favorites/:id        - Add to favorites
DELETE /api/v1/templates/favorites/:id        - Remove from favorites
```

---

## 📊 Implementation Phases

### Phase 2a: Core Template System (3 days)
1. Database migrations
2. TemplateManager service
3. TemplateRepository implementation
4. API endpoints (GET/POST/PUT/DELETE)
5. E2E tests for template management

### Phase 2b: AI Customization (3 days)
1. TemplateCustomizer service
2. Variable substitution engine
3. AI-powered adaptations
4. Validation system
5. Caching integration

### Phase 2c: Analytics & Recommendations (2 days)
1. Usage tracking
2. Success rate calculation
3. User preferences system
4. Template recommendations
5. Performance optimization

---

## 🎯 Key Features

### 1. Template Library

**Built-in Templates by Type**:
- **Petição Inicial** (Initial Petition)
  - Indenização por Dano Moral
  - Indenização por Dano Material
  - Ação Cível Comum
  - Ação Trabalhista

- **Petição Intermediária** (Motion)
  - Impugnação de Sentença
  - Moção para Prorrogação de Prazo
  - Pedido de Esclarecimentos

- **Petição de Apelação** (Appeal)
  - Contrarrazões de Apelação
  - Apelação Cível
  - Recurso Ordinário

### 2. Smart Variable Substitution

```javascript
// Example template with variables
{
  name: "Petição Inicial - Dano Moral",
  variables: [
    { name: "plaintiff_name", type: "string", required: true },
    { name: "plaintiff_cpf", type: "string", required: true },
    { name: "defendant_name", type: "string", required: true },
    { name: "incident_date", type: "date", required: true },
    { name: "damage_description", type: "multiline", required: true },
    { name: "moral_damage_amount", type: "number", required: true },
  ]
}

// User fills: {{ plaintiff_name }} → "João Silva"
// System generates: "João Silva" properly formatted
```

### 3. AI Customization Levels

**Level 1 (Minimal)**: Only variable substitution  
**Level 5 (Moderate)**: AI adapts arguments for specific tribunal  
**Level 10 (High)**: Full AI regeneration with case-specific argumentation

### 4. Tribunal-Specific Adaptation

Templates learn tribunal preferences:
- Formatting requirements (RTF/PDF)
- Preferred argument structures
- Citation formats
- Required declarations

### 5. Usage Analytics

Track per template:
- Usage frequency
- Success rate (petitions accepted)
- Average rating (user feedback)
- Tribunal performance
- Time-to-completion

### 6. Recommendations

```typescript
// System recommends based on:
- Case type/subject
- User's tribunal
- User's past ratings
- Similar successful cases
- Current case context
```

---

## 🔧 Technology Stack

- **Database**: PostgreSQL with JSON support
- **Cache**: Redis (template cache, 1-day TTL)
- **AI**: Existing LLM pool (Gemini, Grok, Ollama)
- **RTF**: rtf-parser or similar
- **Validation**: Zod for schema validation
- **Testing**: Jest + Supertest

---

## 📈 Performance Targets

| Metric | Target |
|--------|--------|
| Template Load | < 100ms (cached) |
| Customization | < 2s (AI) |
| Variable Substitution | < 500ms |
| Search | < 1s |
| API Response | < 500ms (avg) |

---

## 🚀 Rollout Strategy

1. **Internal Testing** (1 week)
   - Load templates into dev database
   - Test AI customization
   - Validate with legal review

2. **Beta Release** (1 week)
   - Limited user group
   - Collect feedback
   - Refine templates

3. **Production Release**
   - Full rollout
   - Documentation
   - User training

---

## 📚 Documentation Deliverables

- API documentation (Postman collection)
- Template authoring guide
- Variable reference manual
- Customization level guide
- Analytics dashboard guide
- Administrator manual

---

## ✅ Success Criteria

- ✅ All templates loadable and searchable
- ✅ Variable substitution 100% accurate
- ✅ AI customization produces valid petitions
- ✅ User ratings average > 4.0/5.0
- ✅ Template usage tracked and reported
- ✅ Recommendations improve by 30%+
- ✅ API response times < 500ms
- ✅ E2E tests > 90% coverage

---

## 📋 Next Steps

1. Run database migrations for template tables
2. Seed initial template library
3. Implement TemplateManager service
4. Create API endpoints
5. Write E2E tests
6. Integrate with petition workflow

**Estimated Start**: Immediate  
**Estimated Completion**: Week 1 of Phase 2

---

## 📊 Phase 2 Complete Roadmap

- **2a** (3 days): Template System - STARTING NOW
- **2b** (3 days): AI Customization & OCR Support
- **2c** (2 days): Analytics & Automation Integration
- **2d** (1 week): Phase 3 - Projuris Features
- **2e** (1 week): Phase 4 - Astrea Features

**Total Phase 2**: 1 week (Templates, OCR, Automação)  
**Total Phase 3**: 1 week (Projuris Client Management)  
**Total Phase 4**: 1 week (Astrea Advanced Management)

---

**Status**: Ready for implementation  
**Assigned**: Claude Code  
**Priority**: HIGH
