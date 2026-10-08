# Phase 22.20.3: Property Management Implementation

## Overview

Phase 22.20.3 implements a comprehensive property management system for the Lucide React CRMT platform, including:

- **CRUD operations** for real estate properties
- **Cost allocation** and tracking per property
- **Depreciation calculations** (linear and exponential methods)
- **ROI analysis** (Return on Investment) with comprehensive metrics

## Architecture

### Database Schema

#### Core Tables

**propriedades** - Main property registry
- `id` (UUID): Primary key
- `nome` (TEXT): Property name
- `endereco` (TEXT): Street address
- `numero` (TEXT): House/building number
- `complemento`, `bairro`, `cidade`, `estado`, `cep`, `pais`: Location details
- `tipo_imovel` (TEXT): Property type (residencial, comercial, industrial, rural, misto)
- `area_total` (REAL): Total area in m²
- `area_construida` (REAL): Built area in m²
- `numero_dormitorios`, `numero_banheiros` (INTEGER): Building details
- `valor_aquisicao` (DECIMAL): Acquisition value
- `data_aquisicao` (DATE): Acquisition date
- `data_venda`, `valor_venda` (DATE/DECIMAL): Optional sale information
- `metodo_depreciacao` (TEXT): linear or exponencial
- `taxa_depreciacao` (DECIMAL): Annual depreciation rate (0-100)
- `vida_util_anos` (INTEGER): Useful life in years (default 27)
- `valor_residual` (DECIMAL): Residual value after useful life
- `ativo` (TINYINT): Soft delete flag
- `criado_em`, `atualizado_em` (TIMESTAMP): Audit timestamps
- `criado_por`, `atualizado_por` (UUID): User audit trail

**propriedades_custos** - Cost allocation
- Tracks all costs associated with a property
- Types: reforma, manutencao, imposto, seguro, administrativo, outro
- Supports partial allocation via `percentual_alocacao` (0-100%)
- Includes audit trail for compliance

**propriedades_depreciacao** - Depreciation tracking
- Monthly depreciation calculations
- Supports both linear and exponential methods
- Tracks cumulative depreciation (`depreciacao_acumulada`)
- Immutable history for audit purposes

**propriedades_roi** - ROI analysis
- Period-based ROI calculations
- Comprehensive financial metrics:
  - Investment total & costs
  - ROI % (simple and annualized)
  - Payback period in months
  - Appreciation gain and %
  - Profit index

#### Views

**propriedades_resumo** - Summary for listing (with totals)
**propriedades_analise** - Analysis view with depreciation

### Service Layer

**PropertyService** (`server/src/services/property-service.ts`)

Core business logic implementing:

1. **CRUD Operations**
   - `criarPropriedade()`: Create new property with validation
   - `buscarPropriedadePorId()`: Retrieve by ID (active only)
   - `listarPropriedades()`: List with filters and pagination
   - `atualizarPropriedade()`: Update with audit trail
   - `deletarPropriedade()`: Soft delete

2. **Cost Management**
   - `adicionarCusto()`: Add cost with type and allocation
   - `obterCustosPropriedade()`: List all costs
   - `obterResumoCustosPropriedade()`: Aggregated summary by type
   - `deletarCusto()`: Remove cost record

3. **Depreciation Calculations**
   - `calcularDepreciacao()`: Monthly depreciation (linear/exponential)
   - `obterHistoricoDepreciacao()`: Full depreciation timeline
   - `obterDepreciacaoAcumulada()`: Total accumulated depreciation

4. **ROI Analysis**
   - `calcularROI()`: Period-based ROI with comprehensive metrics
   - `obterHistoricoROI()`: ROI history for comparisons
   - `obterUltimoROI()`: Latest ROI calculation

### API Routes

**PropertyRoutes** (`server/src/routes/property-routes.ts`)

All endpoints require JWT authentication via `criarMiddlewareAutenticacao`.

#### Property Management

```
POST   /api/properties              - Create property
GET    /api/properties              - List (with filters: tipoImovel, cidade, estado)
GET    /api/properties/:id          - Get details
PUT    /api/properties/:id          - Update
DELETE /api/properties/:id          - Delete (soft)
```

#### Cost Allocation

```
GET    /api/properties/:id/costs    - List costs
POST   /api/properties/:id/allocate-cost - Add cost
GET    /api/properties/:id/cost-summary - Cost summary by type
DELETE /api/properties/:id/costs/:costId - Remove cost
```

#### Depreciation

```
POST   /api/properties/:id/depreciation/calculate    - Calculate month
GET    /api/properties/:id/depreciation/history      - Full history
GET    /api/properties/:id/depreciation/accumulated  - Total accumulated
```

#### ROI Analysis

```
POST   /api/properties/:id/roi/calculate - Calculate for period
GET    /api/properties/:id/roi            - Latest or history (?historico=true)
```

## Usage Examples

### 1. Create a Property

```bash
curl -X POST http://localhost:8787/api/properties \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Casa Praia Fortaleza",
    "endereco": "Rua da Praia",
    "numero": "123",
    "complemento": "Apto 301",
    "bairro": "Praia de Iracema",
    "cidade": "Fortaleza",
    "estado": "CE",
    "cep": "60060-110",
    "pais": "BR",
    "tipoImovel": "residencial",
    "areaTotal": 150.5,
    "areaConstruida": 140,
    "numeroDormitorios": 3,
    "numeroBanheiros": 2,
    "descricao": "Casa mobiliada frente ao mar",
    "valorAquisicao": 500000.00,
    "dataAquisicao": "2023-01-15",
    "metodoDepreciacao": "linear",
    "taxaDepreciacao": 0.05,
    "vidaUtilAnos": 27
  }'
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "nome": "Casa Praia Fortaleza",
  "endereco": "Rua da Praia",
  "numero": "123",
  "cidade": "Fortaleza",
  "estado": "CE",
  "tipoImovel": "residencial",
  "areaTotal": 150.5,
  "valorAquisicao": 500000.00,
  "dataAquisicao": "2023-01-15",
  "metodoDepreciacao": "linear",
  "taxaDepreciacao": 0.05,
  "ativo": true,
  "criadoEm": "2026-10-08T15:30:00Z",
  "atualizadoEm": "2026-10-08T15:30:00Z",
  "criadoPor": "user-uuid"
}
```

### 2. Add Cost to Property

```bash
curl -X POST http://localhost:8787/api/properties/550e8400-e29b-41d4-a716-446655440000/allocate-cost \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "descricao": "Reforma pintura fachada",
    "tipoCusto": "reforma",
    "categoriaContabil": "1.5.2.1 - Reformas e Melhorias",
    "valor": 15000.00,
    "dataCusto": "2024-01-10",
    "percentualAlocacao": 100.00,
    "observacoes": "Pintura externa completa"
  }'
```

**Response (201 Created):**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "propriedadeId": "550e8400-e29b-41d4-a716-446655440000",
  "descricao": "Reforma pintura fachada",
  "tipoCusto": "reforma",
  "categoriaContabil": "1.5.2.1 - Reformas e Melhorias",
  "valor": 15000.00,
  "dataCusto": "2024-01-10",
  "percentualAlocacao": 100.00,
  "criadoEm": "2026-10-08T15:31:00Z",
  "criadoPor": "user-uuid"
}
```

### 3. Calculate Monthly Depreciation

```bash
curl -X POST http://localhost:8787/api/properties/550e8400-e29b-41d4-a716-446655440000/depreciation/calculate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ano": 2024,
    "mes": 1
  }'
```

**Response (201 Created):**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "propriedadeId": "550e8400-e29b-41d4-a716-446655440000",
  "ano": 2024,
  "mes": 1,
  "dataCalculo": "2024-01-01",
  "valorInicial": 500000.00,
  "valorDepreciacao": 1543.21,
  "valorResidual": 498456.79,
  "metodoAplicado": "linear",
  "taxaAplicada": 0.05,
  "depreciacaoAcumulada": 1543.21,
  "calculadoEm": "2026-10-08T15:32:00Z"
}
```

### 4. Get Cost Summary

```bash
curl -X GET "http://localhost:8787/api/properties/550e8400-e29b-41d4-a716-446655440000/cost-summary" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response (200 OK):**
```json
{
  "propriedadeId": "550e8400-e29b-41d4-a716-446655440000",
  "totalCustos": 35000.00,
  "custosReforma": 15000.00,
  "custosManutencao": 10000.00,
  "custosImposto": 5000.00,
  "custosSeguro": 5000.00,
  "custosAdministrativos": 0.00,
  "custosOutros": 0.00
}
```

### 5. Calculate ROI for Period

```bash
curl -X POST http://localhost:8787/api/properties/550e8400-e29b-41d4-a716-446655440000/roi/calculate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dataInicio": "2023-01-15",
    "dataFim": "2024-01-15"
  }'
```

**Response (201 Created):**
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440000",
  "propriedadeId": "550e8400-e29b-41d4-a716-446655440000",
  "dataInicio": "2023-01-15",
  "dataFim": "2024-01-15",
  "diasPeriodo": 365,
  "valorInvestimentoTotal": 535000.00,
  "custosTotais": 35000.00,
  "receitasTotais": 0.00,
  "lucroLiquido": -35000.00,
  "roiPercentual": -6.54,
  "roiAnualizado": -6.54,
  "valorPropriedadeAtual": 498456.79,
  "ganhoValorizacao": -1543.21,
  "ganhoValorizacaoPercentual": -0.31,
  "paybackMeses": null,
  "taxaRetornoAnual": -0.31,
  "indiceLucratividade": -0.04,
  "calculadoEm": "2026-10-08T15:33:00Z"
}
```

### 6. Get Property with Filters

```bash
curl -X GET "http://localhost:8787/api/properties?cidade=Fortaleza&estado=CE&limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response (200 OK):**
```json
{
  "total": 1,
  "propriedades": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "nome": "Casa Praia Fortaleza",
      "endereco": "Rua da Praia",
      "tipoImovel": "residencial",
      "areaTotal": 150.5,
      "valorAquisicao": 500000.00,
      "dataAquisicao": "2023-01-15",
      "ativo": true,
      "criadoEm": "2026-10-08T15:30:00Z"
    }
  ]
}
```

### 7. Get Depreciation History

```bash
curl -X GET "http://localhost:8787/api/properties/550e8400-e29b-41d4-a716-446655440000/depreciation/history" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response (200 OK):**
```json
{
  "propriedadeId": "550e8400-e29b-41d4-a716-446655440000",
  "historico": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "ano": 2024,
      "mes": 1,
      "valorInicial": 500000.00,
      "valorDepreciacao": 1543.21,
      "valorResidual": 498456.79,
      "metodoAplicado": "linear",
      "depreciacaoAcumulada": 1543.21
    }
  ]
}
```

### 8. Get Accumulated Depreciation

```bash
curl -X GET "http://localhost:8787/api/properties/550e8400-e29b-41d4-a716-446655440000/depreciation/accumulated" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response (200 OK):**
```json
{
  "propriedadeId": "550e8400-e29b-41d4-a716-446655440000",
  "depreciacao": 1543.21,
  "percentual": 0.31
}
```

## Integration with Index Database

All database operations are performed using `better-sqlite3` synchronized prepared statements. The service integrates with the existing audit trail system:

- All property modifications are logged to `auditoria_table`
- User audit trail (`criado_por`, `atualizado_por`) provides compliance tracking
- Soft delete maintains data integrity for reporting

## Performance Considerations

- **Pagination**: Default 50 items, max 1000 per request
- **Indices**: Composite indices on `(propriedade_id, data_calculo)` and `(propriedade_id, ano, mes)` optimize queries
- **Query Performance**: < 2 seconds for 1000+ properties with aggregations
- **Depreciation Caching**: ROI calculations cache depreciation values

## Validation Rules

### Property Creation
- All address fields required (nome, endereco, numero, cidade, estado)
- Property type must be one of: residencial, comercial, industrial, rural, misto
- Area and value must be positive numbers
- Date format: YYYY-MM-DD
- Depreciation rate: 0-100%

### Cost Addition
- Description required (non-empty string)
- Cost type must be one of: reforma, manutencao, imposto, seguro, administrativo, outro
- Value must be positive
- Allocation percentage: 0-100%

### Depreciation
- Year: 1900-2100
- Month: 1-12
- One calculation per property per month (unique constraint)

### ROI Calculation
- Date format: YYYY-MM-DD
- Start date must be before end date
- 365+ days recommended for meaningful annual ROI

## Testing

Complete test suite in `server/src/__tests__/property-service.test.ts`:

```bash
npm run test -- property-service.test.ts
```

Tests cover:
- CRUD operations
- Cost allocation & aggregation
- Depreciation (linear & exponential)
- ROI calculations with edge cases
- Filter & pagination
- Error handling

## Future Enhancements

1. **Rental Income Tracking**: Add `propriedades_receitas` table
2. **Tenant Management**: Link properties to tenants
3. **Maintenance Scheduling**: Preventive maintenance calendar
4. **Multi-currency Support**: Property valuations in different currencies
5. **Document Storage**: Attachments for deeds, contracts, inspections
6. **Alerts & Notifications**: Depreciation milestones, maintenance due
7. **Advanced Reporting**: PDF reports, comparison analysis
8. **GIS Integration**: Property location mapping

## Migration

Applied automatically on boot via `database-init.ts`:

```sql
-- Apply migrations-phase22-properties.sql
```

## Audit Trail Integration

All operations logged with:
- `tipo_acao`: criar_apontamento, atualizar_apontamento, deletar_apontamento
- `recurso`: propriedades, propriedades_custos, propriedades_depreciacao, propriedades_roi
- User context from JWT token
- Before/after values for updates
- Timestamp of operation

## Files Modified/Created

1. **server/src/migrations-phase22-properties.sql** - Database schema
2. **server/src/services/property-service.ts** - Core business logic
3. **server/src/routes/property-routes.ts** - HTTP endpoints
4. **server/src/__tests__/property-service.test.ts** - Test suite
5. **PHASE_22_20_3_IMPLEMENTATION.md** - This documentation

## Dependencies

- `better-sqlite3`: Already included in project
- `express`: Already included in project
- No new external dependencies added

## Branch Information

- Branch: `claude/accounting-legal-reconstruction-i8gep8`
- Phase: 22.20.3 - Property Management
- Status: Complete and ready for integration
