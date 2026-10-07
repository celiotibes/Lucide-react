# Sumário de Funcionalidades — Lucide-react (CRMT)

**Total**: 88 arquivos TypeScript + 189 testes passando  
**Cobertura**: Contabilidade, auditoria forense, patrimônio, relatórios fiscais

---

## 📊 Dimensões Principais

### 1. **DOCUMENTOS** (7 arquivos)
```
src/domain/documentos/
├── extrairCampos.ts         ← Heurística + fallback IA
├── extrairCampos.test.ts    ← 7 testes
├── classificarComIA.ts      ← Claude API (novo, fase 2)
├── matching.ts              ← Conectar doc → transação bancária
├── matching.test.ts         ← Testes
├── parseNFe.ts              ← XML de NF-e/NFS-e
└── documentos.ts            ← CRUD documentos
```

**Características**:
- ✅ Extração: valor, data, CNPJ/CPF, fornecedor, tipo
- ✅ Tipos: boleto, contrato, recibo, fatura, nota_fiscal, pedido_comercial
- ✅ Heurística: regex determinístico (nunca adia)
- ✅ Fallback IA: Claude API para edge cases
- ✅ Learned rules: CNPJ/CPF-keyed regras de classificação
- ✅ Matching: Conecta documento a pagamento por proximidade

**Padrão**: Domain honesty (undefined se incerto)

---

### 2. **CATEGORIZAÇÃO** (2 arquivos)
```
src/domain/categorize/
├── regrasAprendidas.ts      ← Learned rules para transações
└── regrasDocumentos.ts      ← Learned rules para documentos
```

**Características**:
- ✅ UNIQUE UPSERT por chave (CNPJ, conta, etc.)
- ✅ Pré-preenche campos em docs/transações
- ✅ Nunca aplica sem revisão do usuário
- ✅ Persistência: sql.js + IndexedDB

---

### 3. **IMPORTAÇÃO & PARSING** (11 arquivos)
```
src/domain/parsers/
├── ofx.ts / ofx.test.ts       ← OFX/QFX (extratos bancários)
├── csv.ts / csv.test.ts       ← CSV genérico
├── pdfDocumento.ts            ← PDF com OCR (tesseract.js)
├── ocrImagem.ts               ← Imagens (OCR local)
├── detectarTipo.ts            ← Detecta tipo de arquivo
├── linhasTransacao.ts         ← Parse de linhas de extrato
├── normalizarValor.ts         ← Normaliza valores (R$, %)
├── fitidSintetico.ts          ← FITID gerado para OFX
├── persistirTransacoes.ts     ← Grava no DB
└── pluggyClient.ts            ← Cliente Pluggy (Open Finance)
```

**Características**:
- ✅ Múltiplos formatos (OFX, CSV, PDF, imagem)
- ✅ OCR local (tesseract.js no browser)
- ✅ Normalização de valores (português/inglês)
- ✅ Opcional: Pluggy para Open Finance

---

### 4. **CONTABILIDADE** (18 arquivos)
```
src/domain/reports/
├── dre.ts / dre.test.ts                 ← Demonstração de Resultado
├── dreCascata.ts / dreCascata.test.ts   ← Cascata (waterfall)
├── dreCompetencia.ts                    ← DRE por competência
├── heatmapDespesas.ts / test.ts         ← Mapa de calor despesas
├── fluxoFinanceiro.ts / test.ts         ← Diagrama Sankey
├── rendaTributavel.ts / test.ts         ← Renda tributável
├── irpfCarneLeao.ts / test.ts           ← IRPF + Carnê-Leão
├── capacidadeContributiva.ts / test.ts  ← "Capacidade contributiva" (forense)
├── analiseVerticalHorizontal.ts / test  ← Análise financeira
├── conciliacaoBancaria.ts / test.ts     ← Reconciliação
├── comparativoFiscal.ts / test.ts       ← Comparativo multi-período
├── desempenhoPorImovel.ts               ← Ranking por propriedade
└── livroRazao.ts                        ← Livro razão (contabilidade pura)
```

**Características**:
- ✅ 12+ relatórios fiscais/contábeis
- ✅ Multi-período (mensal, anual)
- ✅ Por categoria, imóvel, conta
- ✅ Exportação CSV/XLSX
- ✅ Cálculos complexos (depreciação, reajuste, etc.)

---

### 5. **PATRIMÔNIO** (3 arquivos)
```
src/domain/patrimonio/
├── balancoPatrimonial.ts / test.ts      ← Balanço patrimonial
└── data.ts                              ← Dados de propriedades
```

**Características**:
- ✅ Balanço patrimonial (ativo/passivo)
- ✅ Depreciação de bens
- ✅ Inventário de bens por propriedade

---

### 6. **CAUÇÃO** (2 arquivos)
```
src/domain/caucao/
├── calculoCaucao.ts / test.ts           ← Cálculo de depósito caução
```

**Características**:
- ✅ Retenção de caução (locatário)
- ✅ Devolução/retenção por débito
- ✅ Reconciliação com conta caução

---

### 7. **CONTRATOS** (3 arquivos)
```
src/domain/contratos/
├── reajustes.ts / test.ts               ← Reajuste de aluguel
└── locatarios.ts                        ← Gestão de locatários
```

**Características**:
- ✅ Reajuste anual (IGPM, inflação)
- ✅ Locatários + responsáveis solidários
- ✅ Períodos de ocupação

---

### 8. **FINANCIAMENTO** (2 arquivos)
```
src/domain/financiamento/
└── amortizacao.ts / test.ts             ← Tabela de amortização
```

**Características**:
- ✅ SAC e Price (principais sistemas)
- ✅ Parcelas, juros, saldo devedor
- ✅ Simulador de refinanciamento

---

### 9. **RATEIO** (2 arquivos)
```
src/domain/rateio/
├── motorRateio.ts / test.ts             ← Distribuição de custos
└── ajusteAnual.ts                       ← Ajustes pós-fechamento
```

**Características**:
- ✅ Rateio proporcional (fração ideal / área)
- ✅ Múltiplos critérios de divisão
- ✅ Ajuste retroativo

---

### 10. **AUDITORIA FORENSE** (4 arquivos)
```
src/domain/auditoria/
├── auditoriaForense.ts / test.ts        ← Análise de discrepâncias
├── logAlteracoes.ts / test.ts           ← Trilha de modificações
└── painelPendencias.ts                  ← Worklist de alertas
```

**Características**:
- ✅ Detecta discrepâncias (manual vs importado)
- ✅ Log de quem mudou o quê
- ✅ Worklist de itens a revisar

---

### 11. **RECONCILIAÇÃO** (3 arquivos)
```
src/domain/reconcile/
├── contratos.ts / test.ts               ← Valida contrato vs transação
├── inadimplencia.ts / test.ts           ← Detecção de atraso
└── airbnb.ts / test.ts                  ← Padrões Airbnb (receita pura)
```

**Características**:
- ✅ Valida pagamentos esperados vs realizados
- ✅ Detecta atraso (faixa de dias)
- ✅ Padrões específicos (Airbnb, aluguéis)

---

### 12. **SINCRONIZAÇÃO** (2 arquivos)
```
src/domain/sync/
└── clienteSincronizacao.ts / test.ts    ← Multi-dispositivo sync
```

**Características**:
- ✅ Envia DB inteiro para sync-server
- ✅ Baixa versão mais recente
- ✅ Controle de versão (rejeita send desatualizado)

---

### 13. **BACKUP & INTEGRIDADE** (1 arquivo)
```
src/domain/
└── backupIntegridade.ts                 ← Validação de backup
```

**Características**:
- ✅ Detecta data de última sincronização
- ✅ Aviso de backup desatualizado

---

### 14. **UTILITÁRIOS** (4 arquivos)
```
src/domain/
├── types.ts                             ← Tipos TypeScript compartilhados
├── planoDeContas.ts                     ← Mapa de contas (COA)
├── formatarMoeda.ts                     ← Formatação R$ (locale)
└── indices/bacenSgs.ts                  ← Índices BACEN (SGS)
```

---

### 15. **LAUDO/GERAÇÃO DE PDF** (3 arquivos)
```
src/domain/laudo/
├── gerarLaudoPdf.ts                     ← Laudo de capacidade contributiva (PDF)
├── gerarRadPdf.ts                       ← RAD (Relatório Apuração Débitos)
├── escritorPdf.ts                       ← Primitivas de escrita
└── historicoDocumentos.ts / test.ts     ← Tabelão com docs anexados
```

**Características**:
- ✅ Gera PDF com gráficos/tabelas
- ✅ Assinatura para perícia
- ✅ Rastreabilidade de documentos

---

### 16. **SEED (Dados de Demonstração)** (1 arquivo)
```
src/domain/seed/
└── dadosSimulados.ts                    ← Dataset fictício para testes
```

---

## 📈 Estatísticas

| Métrica | Valor |
|---------|-------|
| Total de arquivos TS/TSX | 88 |
| Testes unitários | 189 |
| Taxa de cobertura | Alta (~80%+) |
| Relatórios | 12+ |
| Formatos importação | 5+ (OFX, CSV, PDF, IMG, XML) |
| Linguagem | TypeScript + React 19 |
| Persistência | sql.js + IndexedDB |
| IA | Heurística + fallback Claude |

---

## 🎯 Funcionalidades Inéditas (vs app-bruxel)

1. ✅ Extração de campos de documentos (heurística + IA)
2. ✅ Regras aprendidas (learned rules)
3. ✅ 12+ relatórios contábeis sofisticados
4. ✅ Auditoria forense com log de alterações
5. ✅ Sincronização multi-dispositivo
6. ✅ Cálculo de capacidade contributiva (forense judicial)
7. ✅ Análise de inadimplência (localização de atrasos)
8. ✅ RAD (Relatório de Apuração de Débitos)
9. ✅ OCR local (sem enviar para cloud)
10. ✅ Matching automático documento→transação

---

## 🔄 Integração Recomendada no ERP-CRMT

**Copiar como-está**:
- Todo o `src/domain/` (lógica de negócio é independente de UI)
- `src/db/` (schema + migrations)
- `.env.example` (configuração de IA)

**Referenciar padrões**:
- Estrutura de componentes React (DocumentosView, TransacoesView, etc.)
- Padrão de testes (vitest + Playwright)
- Tratamento de erros (domain honesty)

**Não copiar**:
- `src/components/` (UI específica do Lucide, pode ser redesenhada)
- `src/assets/` (estilos/ícones)

---

**Status**: Mapeamento completo  
**Data**: 2026-09-14
