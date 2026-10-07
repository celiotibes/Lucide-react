# Tax ID Validation System - CNPJ/CPF

Sistema completo de validação e verificação de agentes econômicos (pessoas físicas e jurídicas) com integração a bases de dados públicas.

## Arquitetura

### Componentes Principais

1. **agentes-tipos.ts** - Tipos, schemas e validação básica
   - Validação de formato de CPF/CNPJ
   - Cálculo de dígitos verificadores
   - Schemas Zod para validação
   - Detecção de tipo de pessoa por ID

2. **agentes-registry.ts** - Serviço de verificação em registros públicos
   - Verificação contra Receita Federal
   - Detecção de duplicatas
   - Verificação OFAC (sanções)
   - Auditoria de verificações

3. **agentes-routes.ts** - Endpoints da API
   - CRUD de agentes
   - Validação com órgãos públicos
   - Histórico de validações
   - Detecção de duplicatas

4. **agentes-economicos database** - Persistência
   - Tabelas: agentes_economicos, agentes_validacoes, agentes_duplicatas_suspeitas
   - Índices para performance
   - Foreign keys para integridade

## Validação de CPF/CNPJ

### Processo de Validação

```
Input (com ou sem formatação)
    ↓
Limpeza (remove caracteres não numéricos)
    ↓
Validação de Comprimento (11 ou 14 dígitos)
    ↓
Validação de Dígitos Verificadores
    ↓
Detecção de Padrões Inválidos (todos iguais)
    ↓
Normalização (saída padronizada)
```

### Funções de Validação

#### `cpfValido(cpf: string): ValidationResult`

Valida CPF com 11 dígitos.

**Exemplo:**
```typescript
const resultado = cpfValido("111.444.777-35");
// { 
//   valido: true, 
//   cpfLimpo: "11144477735" 
// }

const resultado = cpfValido("111.444.777-36");
// {
//   valido: false,
//   erro: "CPF inválido: erro no dígito verificador",
//   cpfLimpo: "11144477736"
// }
```

#### `cnpjValido(cnpj: string): ValidationResult`

Valida CNPJ com 14 dígitos.

**Exemplo:**
```typescript
const resultado = cnpjValido("00.000.000/0001-91");
// {
//   valido: true,
//   cnpjLimpo: "00000000000191"
// }
```

#### `normalizarCPF(cpf: string): string | null`

Normaliza CPF removendo formatação.

```typescript
const normalizado = normalizarCPF("111.444.777-35");
// "11144477735"

const invalido = normalizarCPF("123");
// null
```

#### `normalizarCNPJ(cnpj: string): string | null`

Normaliza CNPJ removendo formatação.

#### `obterTipoPorID(id: string): TipoEntidade | null`

Detecta tipo de pessoa a partir do ID (CPF ou CNPJ).

```typescript
const tipo = obterTipoPorID("11144477735");
// TipoEntidade.PESSOA_FISICA

const tipo = obterTipoPorID("00000000000191");
// TipoEntidade.PESSOA_JURIDICA
```

## Serviço de Registro (AgenteRegistryService)

### Inicialização

```typescript
import Database from "better-sqlite3";
import { AgenteRegistryService } from "./agentes-registry";

const db = new Database("database.db");
const registryService = new AgenteRegistryService(db);
```

### Métodos

#### `async verifySoleCNPJ(cnpj: string): ResultadoVerificacao`

Verifica CNPJ contra Receita Federal.

```typescript
const resultado = await registryService.verifySoleCNPJ("00.000.000/0001-91");

// {
//   valido: true,
//   nomeEmpresa: "Empresa ABC",
//   situacao: "ativo",
//   dataConstituicao: "2010-01-01",
//   dataUltimaAtualizacao: "2024-10-07",
//   fonte: "receita_federal"
// }
```

**Status possíveis:**
- `ativo` - CNPJ ativo na Receita Federal
- `cancelado` - CNPJ cancelado
- `bloqueado` - CNPJ bloqueado

#### `async verifySoleCPF(cpf: string): ResultadoVerificacao`

Verifica CPF contra banco de dados de pessoas físicas.

#### `detectarDuplicataTaxID(cpf_cnpj: string, excluir_agente_id?: string): DuplicataDetectada[]`

Busca agentes com mesmo CPF/CNPJ.

```typescript
const duplicatas = registryService.detectarDuplicataTaxID("11144477735");

// [
//   {
//     agente_id_existente: "agent-123",
//     cpf_cnpj_existente: "11144477735",
//     score_similaridade: 100,
//     motivos: ["cpf_cnpj_identico"]
//   }
// ]
```

#### `async obterInformacaoEmpresa(cnpj: string): InformacaoEmpresa`

Retorna informações públicas da empresa.

```typescript
const info = await registryService.obterInformacaoEmpresa("00.000.000/0001-91");

// {
//   nomeEmpresa: "Empresa ABC",
//   nomeFantasia: "ABC",
//   endereco: "Rua X, 123",
//   situacao: "ativo",
//   dataConstituicao: "2010-01-01",
//   dataUltimaAtualizacao: "2024-10-07"
// }
```

#### `async verificarOFAC(cpf_cnpj: string, nome: string): boolean`

Verifica contra lista de sanções OFAC.

```typescript
const naoEstaNoOfac = await registryService.verificarOFAC("11144477735", "João Silva");

// true = não está bloqueado
// false = está bloqueado
```

#### `registrarValidacao(agente_id, tipo, resultado, usuario_id, motivo?, detalhes?): ValidacaoAgente`

Registra resultado de validação para auditoria.

```typescript
registryService.registrarValidacao(
  "agent-123",
  TipoValidacao.CPF_CNPJ,
  ResultadoValidacao.APROVADO,
  "user-1",
  "CPF validado com sucesso",
  { nomeEmpresa: "Teste" }
);
```

#### `obterUltimaValidacao(agente_id: string, tipo_validacao: TipoValidacao): ValidacaoAgente | null`

Obtém última validação registrada.

```typescript
const validacao = registryService.obterUltimaValidacao(
  "agent-123",
  TipoValidacao.CPF_CNPJ
);

// {
//   id: "val-123",
//   agente_id: "agent-123",
//   tipo_validacao: "cpf_cnpj",
//   resultado: "aprovado",
//   motivo: "CPF validado com sucesso",
//   executado_em: 2024-10-07T10:30:00Z,
//   executado_por: "user-1"
// }
```

## API REST Endpoints

### Criar Agente

**POST /api/agentes**

```bash
curl -X POST http://localhost/api/agentes \
  -H "Content-Type: application/json" \
  -d '{
    "tipo_entidade": "pessoa_fisica",
    "cpf_cnpj": "111.444.777-35",
    "nome": "João da Silva",
    "pessoa_fisica_pf_nome_mae": "Maria Silva",
    "papel": "tenant",
    "email": "joao@example.com",
    "telefone": "11999999999"
  }'
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "mensagem": "Agente criado com sucesso",
  "cpf_cnpj": "11144477735"
}
```

**Validações:**
- ✓ CPF/CNPJ deve ser válido
- ✓ CPF/CNPJ deve ser único (não pode haver duplicata)
- ✓ Email deve ser válido (se fornecido)
- ✓ Pessoa física deve ter nome da mãe
- ✓ Pessoa jurídica deve ter nome fantasia
- ✓ OFAC check (bloqueia se em lista de sanções)

**Erros:**
```json
{
  "erro": "CPF/CNPJ já cadastrado",
  "detalhes": "Encontrado agente com mesmo CPF/CNPJ: agent-123",
  "duplicatas": [
    {
      "agente_id_existente": "agent-123",
      "cpf_cnpj_existente": "11144477735",
      "score_similaridade": 100,
      "motivos": ["cpf_cnpj_identico"]
    }
  ]
}
```

### Validar Agente

**POST /api/agentes/:id/validar**

Verifica CPF/CNPJ contra órgãos públicos (Receita Federal).

```bash
curl -X POST http://localhost/api/agentes/550e8400-e29b-41d4-a716-446655440000/validar
```

**Response (200 OK):**
```json
{
  "agente_id": "550e8400-e29b-41d4-a716-446655440000",
  "validado": true,
  "resultado": "aprovado",
  "detalhes": {
    "valido": true,
    "nomeEmpresa": "Empresa ABC",
    "situacao": "ativo",
    "dataConstituicao": "2010-01-01",
    "fonte": "receita_federal"
  }
}
```

### Verificar Duplicatas

**POST /api/agentes/:id/verificar-duplicata**

```bash
curl -X POST http://localhost/api/agentes/550e8400-e29b-41d4-a716-446655440000/verificar-duplicata
```

**Response (200 OK):**
```json
{
  "agente_id": "550e8400-e29b-41d4-a716-446655440000",
  "cpf_cnpj": "11144477735",
  "tem_duplicata": false,
  "duplicatas": []
}
```

### Histórico de Validações

**GET /api/agentes/:id/validacoes**

```bash
curl http://localhost/api/agentes/550e8400-e29b-41d4-a716-446655440000/validacoes
```

**Response (200 OK):**
```json
{
  "agente_id": "550e8400-e29b-41d4-a716-446655440000",
  "total": 2,
  "validacoes": [
    {
      "id": "val-1",
      "agente_id": "agent-123",
      "tipo_validacao": "cpf_cnpj",
      "resultado": "aprovado",
      "motivo": "CPF validado com sucesso",
      "executado_em": "2024-10-07T10:30:00Z",
      "executado_por": "user-1"
    },
    {
      "id": "val-2",
      "tipo_validacao": "cpf_cnpj",
      "resultado": "pendente",
      "motivo": "Aguardando validação manual",
      "executado_em": "2024-10-07T09:00:00Z",
      "executado_por": "user-1"
    }
  ]
}
```

### Obter Agente

**GET /api/agentes/:id**

```bash
curl http://localhost/api/agentes/550e8400-e29b-41d4-a716-446655440000
```

### Listar Agentes

**GET /api/agentes?limit=20&offset=0&tipo=pessoa_fisica&papel=tenant&validado=true&ativo=true**

```bash
curl "http://localhost/api/agentes?tipo=pessoa_juridica&papel=supplier&limit=50"
```

**Query Parameters:**
- `limit` - Máximo de resultados (padrão: 20, máximo: 100)
- `offset` - Deslocamento para paginação
- `tipo` - Filtrar por tipo: `pessoa_fisica` ou `pessoa_juridica`
- `papel` - Filtrar por papel: `tenant`, `supplier`, `provider`, etc
- `validado` - Filtrar por status: `true` ou `false`
- `ativo` - Filtrar por ativo: `true` ou `false`

### Atualizar Agente

**PUT /api/agentes/:id**

```bash
curl -X PUT http://localhost/api/agentes/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo@example.com",
    "telefone": "11988888888",
    "observacoes": "Atualizado em 2024-10-07"
  }'
```

## Banco de Dados

### Tabela: agentes_economicos

```sql
CREATE TABLE agentes_economicos (
  id TEXT PRIMARY KEY,
  tipo_entidade TEXT NOT NULL,  -- pessoa_fisica | pessoa_juridica
  cpf_cnpj TEXT NOT NULL UNIQUE,  -- 11 ou 14 dígitos
  nome TEXT NOT NULL,
  nome_fantasia TEXT,  -- Obrigatório para PJ
  pessoa_fisica_pf_nome_mae TEXT,  -- Obrigatório para PF
  papel TEXT NOT NULL,  -- tenant, supplier, provider, etc
  regime_tributario TEXT,  -- simples, lucro_real, lucro_presumido, MEI, outro
  email TEXT,
  telefone TEXT,
  celular TEXT,
  endereco_* TEXT,  -- logradouro, numero, complemento, bairro, cidade, estado, cep
  ativo INTEGER DEFAULT 1,
  validado INTEGER DEFAULT 0,
  validado_em DATETIME,
  validado_por TEXT,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT NOT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_agentes_economicos_cpf_cnpj ON agentes_economicos(cpf_cnpj);
```

### Tabela: agentes_validacoes

Auditoria de todas as validações realizadas.

```sql
CREATE TABLE agentes_validacoes (
  id TEXT PRIMARY KEY,
  agente_id TEXT NOT NULL,
  tipo_validacao TEXT NOT NULL,  -- cpf_cnpj, email, telefone, endereco, regime_tributario, documental, financeira, manual
  resultado TEXT NOT NULL,  -- aprovado, rejeitado, pendente
  motivo TEXT,
  detalhes TEXT,  -- JSON
  executado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executado_por TEXT NOT NULL,
  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE
);

CREATE INDEX idx_agentes_validacoes_agente ON agentes_validacoes(agente_id);
CREATE INDEX idx_agentes_validacoes_tipo ON agentes_validacoes(tipo_validacao);
```

## Mensagens de Erro

### Validação de Formato

| Erro | Descrição |
|------|-----------|
| "CPF deve conter exatamente 11 dígitos" | Comprimento inválido |
| "CNPJ deve conter exatamente 14 dígitos" | Comprimento inválido |
| "CPF/CNPJ deve conter apenas dígitos" | Caracteres não numéricos |
| "CPF inválido: erro no dígito verificador" | Dígitos verificadores incorretos |
| "CNPJ inválido: erro no dígito verificador" | Dígitos verificadores incorretos |
| "CPF com padrão inválido (todos os dígitos iguais)" | CPF como 11111111111 |
| "CNPJ com padrão inválido (todos os dígitos iguais)" | CNPJ como 11111111111111 |

### Validação de Negócio

| Erro | Descrição | HTTP |
|------|-----------|------|
| "CPF/CNPJ já cadastrado" | Duplicata encontrada | 409 |
| "Agente bloqueado - OFAC" | Em lista de sanções | 403 |
| "CNPJ não encontrado na base de dados pública" | Receita Federal retornou cancelado | 400 |
| "CPF já cadastrado para outro agente" | Duplicata em base de dados | 409 |
| "Pessoa jurídica deve ter nome fantasia" | Campo obrigatório faltando | 400 |
| "Pessoa física deve ter nome da mãe" | Campo obrigatório faltando | 400 |

## Testes

### Executar Testes Unitários

```bash
npm test -- agentes-tipos.test.ts
npm test -- agentes-registry.test.ts
```

### Executar Testes de Integração

```bash
npm test -- agentes-routes.test.ts
```

### Coverage

```bash
npm test -- --coverage server/src/domain/erp/agentes-*
```

## Integração com Órgãos Públicos

### Receita Federal (RF)

**Endpoint simulado:** `https://www.receita.fazenda.gov.br/...`

Em produção, integrar com:
- API oficial da Receita Federal (consulta CNPJ)
- Sistema de CPF do Serpro
- Banco de dados de inscrições estaduais

### OFAC (Office of Foreign Assets Control)

**Endpoint simulado:** `https://www.treasury.gov/ofac`

Em produção:
- Consultar lista oficial OFAC
- Implementar atualização periódica
- Cache local para performance

## Boas Práticas

1. **Sempre validar CPF/CNPJ** na criação de agente
2. **Detectar duplicatas** antes de criar
3. **Usar verificação OFAC** para pessoas jurídicas
4. **Registrar todas as validações** para auditoria
5. **Implementar rate limiting** em verificações de órgãos públicos
6. **Cache de validações** para evitar múltiplas consultas
7. **Notificar usuário** quando validação falha
8. **2-tier approval** - validação automática + manual se necessário

## Troubleshooting

### "CNPJ não encontrado na base de dados pública"

1. Verificar formato: Deve ter exatamente 14 dígitos
2. Verificar dígitos verificadores: Use validação local
3. Verificar se não está cancelado: Consultar RF
4. Verificar conectividade: Se integrado com RF, verificar conexão

### "CPF já cadastrado para outro agente"

1. Buscar agente existente com mesmo CPF
2. Verificar se não é duplicata de dados
3. Considerar mesclar registros se forem o mesmo

### "OFAC - Em lista de sanções"

1. Contatar administrador
2. Arquivo de exceção para aprovação manual
3. Implementar workflow de escalação

## Performance

### Índices Recomendados

```sql
CREATE INDEX idx_agentes_cpf_cnpj ON agentes_economicos(cpf_cnpj);
CREATE INDEX idx_agentes_tipo ON agentes_economicos(tipo_entidade);
CREATE INDEX idx_agentes_papel ON agentes_economicos(papel);
CREATE INDEX idx_agentes_ativo ON agentes_economicos(ativo);
CREATE INDEX idx_validacoes_agente ON agentes_validacoes(agente_id, tipo_validacao);
```

### Query Optimization

- Usar índices em buscas por CPF/CNPJ
- Limitar resultado de listagem (padrão: 20 registros)
- Cache de verificações OFAC
- Validação assíncrona para órgãos públicos

## Segurança

- ✓ Validar todos os inputs
- ✓ Normalizar CPF/CNPJ antes de armazenar
- ✓ Usar prepared statements
- ✓ Audit trail completo
- ✓ Validação de permissões
- ✓ HTTPS para comunicação com órgãos públicos
- ✓ Criptografia de dados sensíveis em produção

## Roadmap

- [ ] Integração com API real da Receita Federal
- [ ] Cache distribuído de validações
- [ ] Verificação de IE (Inscrição Estadual)
- [ ] Verificação de IM (Inscrição Municipal)
- [ ] Webhooks para eventos de validação
- [ ] Dashboard de auditoria
- [ ] Relatórios de duplicatas
- [ ] Batch validation API
