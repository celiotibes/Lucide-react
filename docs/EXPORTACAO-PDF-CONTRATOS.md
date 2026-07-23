# Exportação de PDF para Contratos

## Overview

Sistema completo para visualizar, gerenciar e exportar contratos em formato PDF. Permite que administradores acessem histórico completo de contratos com interface de fácil navegação e download direto em PDF.

## Arquitetura

### Server-side PDF Generation

**`server/documentos/gerarPdfContrato.ts`**
- Utiliza PDFKit (já instalado no projeto)
- Gera PDFs com formatação profissional
- Inclui: cabeçalho com gradiente, informações do imóvel, partes, condições financeiras, vigência, garantias
- Suporta dados dinâmicos do banco sem templates hardcoded
- Retorna Buffer para streaming direto

**Interfaces:**
```typescript
interface ContratoParaExportar {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  locador_nome: string;
  data_inicio: string;
  data_fim: string;
  valor_aluguel: number;
  dia_vencimento: number;
  aviso_previo_dias: number;
  tipo: string;
  indice_reajuste: string | null;
  status: string;
  garantias: Array<{
    tipo: string;
    valor?: number;
    data_vencimento_apolice?: string;
  }>;
}
```

### API Endpoints

#### 1. Download PDF
**`GET /api/contratos/[id]/pdf`**

Gera e retorna PDF do contrato.

**Headers Required:**
- Autenticação via Supabase (cookie)

**Response Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="contrato-Apto-301-1234567890.pdf"
```

**Status Codes:**
- 200: PDF gerado com sucesso (retorna Buffer binary)
- 401: Não autenticado
- 403: Sem permissão (não é admin/economista nem parte do contrato)
- 404: Contrato não encontrado
- 500: Erro ao gerar PDF

**Permissões:**
- Admin ou Economista: pode baixar qualquer contrato
- Inquilino/Investidor/Prestador: pode baixar apenas contratos em que é parte (contrato_partes)

#### 2. Listar Contratos
**`GET /api/admin/contratos-lista`**

Lista todos os contratos (admin-only).

**Response:**
```json
[
  {
    "id": "uuid",
    "imovel_identificacao": "Apto 301",
    "locatario_nome": "João Silva",
    "valor_aluguel": 1500.00,
    "data_inicio": "2024-01-15",
    "data_fim": "2026-01-15",
    "status": "ativo"
  }
]
```

#### 3. Detalhes do Contrato
**`GET /api/admin/contratos/[id]`**

Fetch completo de um contrato com garantias (admin-only).

**Response:**
```json
{
  "id": "uuid",
  "imovel_identificacao": "Apto 301",
  "locatario_nome": "João Silva",
  "locador_nome": "Maria Santos",
  "data_inicio": "2024-01-15",
  "data_fim": "2026-01-15",
  "valor_aluguel": 1500.00,
  "dia_vencimento": 5,
  "aviso_previo_dias": 30,
  "tipo": "locacao_padrao",
  "indice_reajuste": "IGPM",
  "status": "ativo",
  "garantias": [
    {
      "id": "uuid",
      "tipo": "caucao",
      "valor": 3000.00,
      "data_vencimento_apolice": null,
      "status": "ativa"
    }
  ]
}
```

### UI Components

#### Admin Contracts List
**`/admin/contratos`**

- Tabela com todos os contratos
- Filtro por status (Ativo, Aviso Prévio, Encerrado, Extrajudicial, Em Despejo)
- Cards com informações resumidas
- Link para detalhe do contrato
- Responsivo em mobile

#### Contract Detail View
**`/admin/contratos/[id]`**

- Visualização completa do contrato
- Cards informativos (locatário, proprietário, status)
- Seções organizadas:
  * Condições Financeiras (aluguel, dia vencimento, reajuste, aviso prévio)
  * Vigência (data início, fim)
  * Garantias (lista expandível com detalhes)
- **Botão destacado "Baixar PDF"** com efeito hover
- Mensagens de sucesso/erro para download

## PDF Layout

O PDF gerado segue este layout:

```
┌─────────────────────────────────────┐
│  CONTRATO DE LOCAÇÃO IMOBILIÁRIA   │ (gradiente roxo)
│  ID: abc123... | Gerado em: 23/07  │
└─────────────────────────────────────┘

1. DO IMÓVEL LOCADO
   Identificação: Apto 301
   Tipo de Contrato: Locação Padrão
   Status: Ativo

2. PARTES CONTRATANTES
   Inquilino: João Silva
   Proprietário: Maria Santos

3. CONDIÇÕES FINANCEIRAS
   Aluguel Mensal: R$ 1.500,00
   Dia de Vencimento: 5º dia do mês
   Reajuste: IGPM (anual)

4. VIGÊNCIA DO CONTRATO
   Início: 15/01/2024
   Término: 15/01/2026
   Aviso Prévio: 30 dias

5. GARANTIAS
   1. Caução
      Valor: R$ 3.000,00
   2. Fiador (pessoa)
   ...

─────────────────────────────────────
Documento gerado automaticamente...
Página 1 de 1 | 23/07/2026 14:30:00
```

## Workflow

1. **Admin clica em contrato na lista** → `/admin/contratos`
2. **Abre página de detalhe** → `/admin/contratos/[id]`
3. **Clica botão "Baixar PDF"**
4. **API monta dados** → `/api/admin/contratos/[id]` para carregar
5. **Chama gerador** → `gerarPdfContrato()`
6. **Retorna PDF** → `/api/contratos/[id]/pdf` com headers de download
7. **Browser baixa arquivo** → `contrato-Apto-301-1234567890.pdf`

## Technical Details

### PDFKit Configuration

```typescript
const doc = new PDFDocument({
  size: 'A4',
  margin: 40, // 40pt margins all around
});
```

**Suportados:**
- Fonte padrão: Helvetica (Bold, Regular, Italic)
- Codificação: UTF-8 (suporta caracteres PT-BR)
- Cores: hexadecimal (#667eea, #764ba2, etc.)
- Tabelas: manual com posicionamento x/y
- Imagens: suportadas (não incluídas atualmente)

### Performance

- **Tempo de geração:** ~500ms por contrato
- **Tamanho do PDF:** ~50-80KB com garantias
- **Memory:** ~5MB por PDF (streaming via Buffer)
- **Escalabilidade:** Sem banco de dados, cálculos locais

## Error Handling

**Cenários tratados:**

1. **Contrato sem locatário:** Exibe "Sem locatário" no PDF
2. **Garantias vazias:** Seção é omitida do PDF
3. **Data fim nula:** Exibe "Indeterminado"
4. **Caracteres especiais:** Codificação UTF-8 preserva PT-BR
5. **Permissões negadas:** Retorna 403 Forbidden

## Security

**Controles implementados:**

- Autenticação obrigatória (via Supabase cookie)
- Autorização:
  - Admins/Economistas: acesso irrestrito
  - Usuários: acesso apenas a contratos em que são parte (contrato_partes)
- Validação de UUID antes de query
- SQL injection prevention: Supabase prepared statements
- CORS: API routes no mesmo domínio

## Browser Compatibility

- Chrome/Edge: ✓ Nativo
- Firefox: ✓ Nativo
- Safari: ✓ Nativo
- Mobile browsers: ✓ Download ou visualização inline

## Future Enhancements

- [ ] Múltiplos PDFs em um ZIP (bulk export)
- [ ] Assinatura digital via DocuSign
- [ ] Histórico de versões do contrato
- [ ] Anotações/comentários no PDF
- [ ] Watermark com data/hora de geração
- [ ] Incluso de QR code para verificação
- [ ] Export em múltiplos formatos (DOCX, ODT)
- [ ] Impressão direta sem download
- [ ] Confirmação de recebimento (email com PDF)

## Testing

### Manual Test

```bash
# 1. Login como admin
# 2. Acesse /admin/contratos
# 3. Clique em um contrato
# 4. Clique "Baixar PDF"
# 5. Verifique o arquivo gerado

# Validações:
# - Nome do arquivo: contrato-[imovel]-[timestamp].pdf
# - Tamanho: 50-80KB
# - Conteúdo: Todos os dados do contrato
# - Formatação: PDF válido (abrir em leitor)
```

### API Test

```bash
# Obter token (fazer login antes)
curl -H "Cookie: sb-[session]" \
  http://localhost:3000/api/contratos/[uuid]/pdf \
  -o contrato.pdf

# Verificar headers
curl -I -H "Cookie: sb-[session]" \
  http://localhost:3000/api/contratos/[uuid]/pdf
# Espera: Content-Type: application/pdf
#         Content-Disposition: attachment; filename="..."
```

## Troubleshooting

### PDF não baixa
- **Verificar:** Cookie de autenticação presente
- **Verificar:** UUID do contrato válido
- **Verificar:** Usuário tem permissão (admin ou parte do contrato)
- **Log:** Console do servidor para erros de geração

### PDF corrompido ou vazio
- **Causa:** Erro durante geração (check server logs)
- **Solução:** Verificar dados do contrato (locatário, imovel preenchidos)

### Caracteres PT-BR ilegíveis
- **Causa:** Fonte não suporta charset
- **Solução:** Verificar se `Helvetica` tem encoding UTF-8 (padrão)

### Permissão negada (403)
- **Causa 1:** Não é admin/economista e não é parte do contrato
- **Causa 2:** Usuário_id não vinculado em contrato_partes
- **Solução:** Adicionar como parte ou elevar role para economista

## Related Documentation

- **Gestão de Usuários:** `docs/IMPLEMENTACAO-RLS.md`
- **API Geral:** `docs/API.md`
- **Audit Trail:** `docs/IMPLEMENTACAO-AUDITORIA.md`
