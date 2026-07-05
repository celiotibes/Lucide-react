# DataJud API - Consultas de Processos

API pública do CNJ (Conselho Nacional de Justiça) para buscar informações de processos públicos.

## Autenticação

DataJud usa autenticação por chave API (public key):

```typescript
// Configurar em .env
DATAJUD_API_KEY=sua_chave_publica
DATAJUD_API_URL=https://apipublica.cnj.jus.br/api/v2
```

## Endpoints Disponíveis

### 1. Buscar Processo por Número

```bash
curl -X GET "http://localhost:3000/api/v1/datajud/processes/0000001-12.2023.8.26.0100" \
  -H "Authorization: Bearer <jwt_token>"
```

**Resposta:**
```json
{
  "numero": "0000001-12.2023.8.26.0100",
  "numeroFormatado": "0000001-12.2023.8.26.0100",
  "cnj": "0000001-12.2023.8.26.0100",
  "tribunal": {
    "codigo": 26,
    "nome": "Tribunal de Justiça de São Paulo",
    "sigla": "TJSP"
  },
  "forum": {
    "codigo": 1,
    "nome": "Foro Central - São Paulo"
  },
  "assunto": "Ação Ordinária Cível",
  "dataRegistro": "2023-01-15",
  "dataAtualizacao": "2024-01-15",
  "status": "Em tramitação",
  "movimentacoes": [
    {
      "dataMovimentacao": "2023-01-15",
      "descricaoMovimentacao": "Processo registrado",
      "typeMovimentacao": 1
    }
  ]
}
```

### 2. Buscar por Partes

```bash
curl -X GET "http://localhost:3000/api/v1/datajud/search?parteNome=João Silva" \
  -H "Authorization: Bearer <jwt_token>"
```

**Parâmetros:**
- `parteNome`: Nome de qualquer parte (plaintiff/defendant)
- `partePessoaJuridica`: Razão social se pessoa jurídica
- `limit`: Limite de resultados (padrão: 10, máximo: 100)
- `offset`: Paginação

### 3. Buscar por Assunto

```bash
curl -X GET "http://localhost:3000/api/v1/datajud/search?subject=Ação+Ordinária" \
  -H "Authorization: Bearer <jwt_token>"
```

### 4. Buscar por Data

```bash
curl -X GET "http://localhost:3000/api/v1/datajud/search?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer <jwt_token>"
```

### 5. Obter Movimentações

```bash
curl -X GET "http://localhost:3000/api/v1/datajud/processes/0000001-12.2023.8.26.0100/movements" \
  -H "Authorization: Bearer <jwt_token>"
```

**Resposta:**
```json
[
  {
    "dataMovimentacao": "2023-01-15",
    "descricaoMovimentacao": "Processo registrado",
    "typeMovimentacao": 1
  },
  {
    "dataMovimentacao": "2023-02-20",
    "descricaoMovimentacao": "Petição inicial apresentada",
    "typeMovimentacao": 5
  }
]
```

## Filtros Avançados

### Busca Complexa

```bash
curl -X GET "http://localhost:3000/api/v1/datajud/search" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "numeroProcesso": "0000001-12.2023.8.26.0100",
    "parteNome": "João Silva",
    "dataRegistroInicio": "2023-01-01",
    "dataRegistroFim": "2023-12-31",
    "assunto": "Ação Ordinária",
    "limit": 50,
    "offset": 0
  }'
```

## Formatos de Número de Processo

A ferramenta aceita diversos formatos:

```typescript
// Todos retornam o mesmo resultado:
"0000001-12.2023.8.26.0100"
"0000001122023826010"
"0000001-12.2023"
"1234567890123456789"
```

Internamente são normalizados para o formato CNJ (20 dígitos).

## Limitações da API Pública

| Aspecto | Limite |
|--------|--------|
| Requisições por minuto | ~100 |
| Dados retornados | Apenas públicos |
| Histórico | Ultimos 10 anos |
| Formatos | JSON, XML |

## Tratamento de Erros

```json
{
  "statusCode": 429,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Limite de requisições DataJud excedido",
  "details": {
    "resetIn": 60
  }
}
```

## Casos de Uso

### 1. Monitorar Processo

```typescript
async function monitorarProcesso(numeroProcesso: string) {
  const processo = await dataJudClient.getProcessByNumber(numeroProcesso);
  
  if (processo.status !== 'Em tramitação') {
    notificarAdvogado('Processo alterou status!', processo);
  }
}

// Executar a cada 24 horas
setInterval(() => monitorarProcesso(numero), 24 * 60 * 60 * 1000);
```

### 2. Buscar Processos Recentes

```typescript
async function processosRecentes() {
  const hoje = new Date();
  const seteAnosAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const processos = await dataJudClient.searchByDateRange(seteAnosAtras, hoje);
  return processos.filter(p => p.status === 'Em tramitação');
}
```

### 3. Rastrear Partes

```typescript
async function rastrearPartes(nomes: string[]) {
  const resultados = {};
  
  for (const nome of nomes) {
    resultados[nome] = await dataJudClient.searchByParty(nome);
  }
  
  return resultados;
}
```

## Integração no Frontend

```typescript
// 1. Buscar processo
const processo = await fetch(
  `/api/v1/datajud/processes/${numeroProcesso}`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json());

// 2. Exibir movimentações
const movimentacoes = await fetch(
  `/api/v1/datajud/processes/${numeroProcesso}/movements`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json());

// 3. Atualizar em tempo real
const autoRefresh = setInterval(async () => {
  const atualizado = await fetch(
    `/api/v1/datajud/processes/${numeroProcesso}`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then(r => r.json());
  
  if (atualizado.dataAtualizacao > processo.dataAtualizacao) {
    atualizarUI(atualizado);
  }
}, 60000); // A cada minuto
```

## Rate Limiting

Se receber erro 429:
- Aguardar 60 segundos antes de retentar
- Implementar backoff exponencial
- Usar cache local quando possível

```typescript
async function buscarComRetry(numeroProcesso: string, tentativa = 0) {
  try {
    return await dataJudClient.getProcessByNumber(numeroProcesso);
  } catch (error) {
    if (error.statusCode === 429 && tentativa < 3) {
      const delay = Math.pow(2, tentativa) * 1000;
      await new Promise(r => setTimeout(r, delay));
      return buscarComRetry(numeroProcesso, tentativa + 1);
    }
    throw error;
  }
}
```
