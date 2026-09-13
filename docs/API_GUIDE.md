# API Reference - CRMT Lucide

## Autenticação

Todos os endpoints requerem autenticação via token JWT.

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

## Apontamentos (Timesheets)

### Criar Apontamento

**POST** `/api/prestador/apontamentos`

Request:
```json
{
  "contratoId": "uuid",
  "data": "2024-07-17",
  "horasTrabalhadas": 8,
  "descricao": "Manutenção predial",
  "residenciais": ["uuid-residencial-1", "uuid-residencial-2"]
}
```

Response:
```json
{
  "sucesso": true,
  "apontamentoId": "uuid",
  "mensagem": "Apontamento registrado com sucesso",
  "requerRateio": false
}
```

### Listar Apontamentos

**GET** `/api/prestador/apontamentos?dataInicio=2024-01-01&dataFim=2024-12-31`

Response:
```json
{
  "sucesso": true,
  "apontamentos": [
    {
      "id": "uuid",
      "data": "2024-07-17",
      "horasTrabalhadas": 8,
      "descricao": "Manutenção predial",
      "status": "pendente",
      "foiImportadoRetroativo": false
    }
  ],
  "total": 42,
  "pagina": 1
}
```

### Atualizar Apontamento

**PUT** `/api/prestador/apontamentos/{id}`

Request:
```json
{
  "horasTrabalhadas": 7.5,
  "descricao": "Manutenção - Limpeza atrasou 30min"
}
```

Response:
```json
{
  "sucesso": true,
  "mensagem": "Apontamento atualizado"
}
```

### Deletar Apontamento

**DELETE** `/api/prestador/apontamentos/{id}`

Response:
```json
{
  "sucesso": true,
  "mensagem": "Apontamento deletado"
}
```

---

## Despesas (Expenses)

### Registrar Despesa com OCR

**POST** `/api/prestador/despesa-ocr`

Request (multipart/form-data):
```
arquivo: <image>
contratoId: uuid
tipo: combustivel
valor: 75.50 (opcional)
data: 2024-07-17 (opcional)
```

Response:
```json
{
  "sucesso": true,
  "despesaId": "uuid",
  "mensagem": "Despesa registrada com sucesso",
  "dadosExtraidos": {
    "valor": 75.50,
    "data": "2024-07-17",
    "confianca": 87,
    "campos": ["valor", "data", "tipo_combustivel"]
  }
}
```

### Reprocessar OCR

**POST** `/api/prestador/despesa-ocr/reprocessar/{id}`

Response:
```json
{
  "sucesso": true,
  "mensagem": "Comprovante reprocessado",
  "dadosExtraidos": {
    "valor": 75.50,
    "confianca": 92,
    "campos": ["valor", "data", "estabelecimento"]
  }
}
```

---

## Reembolsos (Reimbursements)

### Criar Requisição de Reembolso

**POST** `/api/prestador/reembolso-insumos`

Request:
```json
{
  "contratoId": "uuid",
  "itens": [
    {
      "descricao": "Luvas de Segurança",
      "valor": 45.90,
      "dataCompra": "2024-07-10",
      "categoriaMaterial": "manutencao"
    },
    {
      "descricao": "Desinfetante",
      "valor": 28.50,
      "dataCompra": "2024-07-11",
      "categoriaMaterial": "limpeza"
    }
  ],
  "observacoes": "Notas fiscais anexadas"
}
```

Response:
```json
{
  "sucesso": true,
  "requisicaoId": "uuid",
  "totalReembolso": "74.40",
  "itemsCount": 2,
  "mensagem": "Requisição de reembolso criada com sucesso"
}
```

### Listar Reembolsos Pendentes (Admin)

**GET** `/api/admin/reembolsos-pendentes`

Response:
```json
{
  "sucesso": true,
  "requisicoes": [
    {
      "id": "uuid",
      "prestadorNome": "João Silva",
      "totalReembolso": "74.40",
      "dataLancamento": "2024-07-17",
      "status": "ativo"
    }
  ],
  "total": 5,
  "valorTotal": "385.75"
}
```

### Aprovar Reembolso (Admin)

**POST** `/api/admin/reembolso/{id}/aprovar`

Request:
```json
{
  "observacoes": "Aprovado. Pagamento em 2 dias úteis."
}
```

Response:
```json
{
  "sucesso": true,
  "requisicaoId": "uuid",
  "valor": "74.40",
  "mensagem": "Reembolso aprovado e pagamento agendado"
}
```

### Rejeitar Reembolso (Admin)

**POST** `/api/admin/reembolso/{id}/rejeitar`

Request:
```json
{
  "motivo": "Documentação incompleta"
}
```

Response:
```json
{
  "sucesso": true,
  "mensagem": "Reembolso rejeitado com sucesso"
}
```

---

## Análise de Anomalias (ML)

### Analisar Anomalias em Apontamentos

**POST** `/api/admin/anomalias/analisar`

Request:
```json
{
  "dataInicio": "2024-01-01",
  "dataFim": "2024-12-31",
  "prestadorId": "uuid" (opcional)
}
```

Response:
```json
{
  "sucesso": true,
  "relatorio": {
    "totalApontamentos": 156,
    "totalAnomalias": 12,
    "taxaAnomalia": 7.69,
    "criticas": [
      {
        "apontamento_id": "uuid",
        "data": "2024-07-15",
        "horasTrabalhadas": 15,
        "motivo": "horas_extremas",
        "scoreAnomalia": 85,
        "descricao": "Apontamento com 15h é muito elevado",
        "recomendacao": "Verificar se não houve erro de lançamento"
      }
    ],
    "alerta": [],
    "info": []
  }
}
```

### Marcar Anomalia como Revisada

**POST** `/api/admin/anomalias/{apontamentoId}/marcar-revisada`

Request:
```json
{
  "observacoes": "Revisado com prestador - foi projeto especial"
}
```

Response:
```json
{
  "sucesso": true,
  "mensagem": "Anomalia marcada como revisada"
}
```

---

## Rateio de Custos (Cost Apportionment)

### Obter Custos por Residencial

**GET** `/api/admin/rateio/custos?dataInicio=2024-01-01&dataFim=2024-12-31`

Response:
```json
{
  "sucesso": true,
  "resumo": [
    {
      "residencial_id": "uuid",
      "residencial_nome": "Residencial A",
      "totalHoras": 156.5,
      "totalCusto": 3921.25,
      "apontamentos": 32
    }
  ],
  "totais": {
    "totalHoras": "450",
    "totalCusto": "11250.75",
    "residenciais": 5
  }
}
```

### Aplicar Rateio em Apontamento

**POST** `/api/admin/rateio/aplicar`

Request:
```json
{
  "apontamentoId": "uuid",
  "residenciaisHoras": {
    "residencial-1": 4,
    "residencial-2": 4
  }
}
```

Response:
```json
{
  "sucesso": true,
  "mensagem": "Rateio aplicado com sucesso",
  "custosPorResidencial": {
    "residencial-1": 200.00,
    "residencial-2": 200.00
  }
}
```

### Listar Apontamentos Não Rateados

**GET** `/api/admin/rateio/nao-rateados`

Response:
```json
{
  "sucesso": true,
  "apontamentos": [
    {
      "id": "uuid",
      "data": "2024-07-17",
      "horasTrabalhadas": 8,
      "residenciais_ids": "uuid1,uuid2,uuid3",
      "prestadorNome": "João Silva"
    }
  ]
}
```

---

## Integração ERP (n8n)

### Sincronizar com Omie

**POST** `/api/integracao/sincronizar-omie`

Request:
```json
{
  "dataInicio": "2024-01-01",
  "dataFim": "2024-12-31",
  "tiposRegistro": ["pedidos", "notas_fiscais"]
}
```

Response:
```json
{
  "sucesso": true,
  "resultado": {
    "pedidosSincronizados": 45,
    "notasGeradas": 12,
    "erros": []
  },
  "proximaSincronizacao": "2024-07-18T02:00:00Z"
}
```

### Obter Status Sincronização

**GET** `/api/integracao/status-sincronizacao`

Response:
```json
{
  "sucesso": true,
  "status": {
    "ultimaSincronizacao": "2024-07-17T10:30:00Z",
    "proximaSincronizacao": "2024-07-18T02:00:00Z",
    "statusOmie": "sincronizado",
    "statusBluesoft": "sincronizado",
    "filaProcessamento": 0
  }
}
```

---

## Códigos de Erro

| Código | Mensagem | Descrição |
|--------|----------|-----------|
| 401 | Não autenticado | Token JWT inválido ou expirado |
| 403 | Sem permissão | Usuário sem acesso ao recurso |
| 404 | Não encontrado | Recurso não existe |
| 422 | Validação | Dados inválidos |
| 429 | Rate limit | Muitas requisições |
| 500 | Erro servidor | Erro interno |

---

## Rate Limiting

- **Default**: 100 requisições por minuto
- **Auth**: 10 requisições por minuto
- **File upload**: 5 requisições por minuto

Cabeçalho de resposta:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1689687000
```

---

**Última atualização**: 2024-07-17
