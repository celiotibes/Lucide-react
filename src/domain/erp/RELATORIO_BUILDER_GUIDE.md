# RelatorioBuilder Guide

## Overview

RelatorioBuilder é a camada de infraestrutura para geração de relatórios ERP em múltiplos formatos. Implementa o padrão **Builder com API Fluente**, permitindo construção intuitiva e encadeada de relatórios.

### Características principais

- **API Fluente**: Encadeamento de métodos para configuração
- **Múltiplos Formatos**: JSON, CSV, PDF (estrutura)
- **Templates Pré-configurados**: Apontamentos, Advocacia, Contas Pessoais, Imóveis
- **Formatação Flexível**: Moeda, Data, Percentual, Saldo, Hash de Auditoria
- **Validação Integrada**: Tipos de coluna, faixas, formatos
- **Agregações**: SUM, AVG, COUNT, MAX, MIN
- **Auditoria**: Hash para integridade dos dados

---

## Quick Start

### Exemplo Básico

```typescript
import RelatorioBuilder from './relatorio-builder';

const relatorio = new RelatorioBuilder('Relatório de Apontamentos')
  .comPeriodo(2026, 1)
  .comFiltroOrigem('apontamento_prestador')
  .comCentroCusto('CC-001')
  .comFormatacao({ moeda: 'BRL', dataFormat: 'DD/MM/YYYY' })
  .comColunas([
    { nome: 'id', tipo: 'inteiro' },
    { nome: 'data', tipo: 'data' },
    { nome: 'valor', tipo: 'moeda' }
  ])
  .comDados([
    { id: 1, data: '2026-01-15', valor: 1500 },
    { id: 2, data: '2026-01-16', valor: 2000 }
  ])
  .comAgregacoes([
    { tipo: 'SUM', campo: 'valor', alias: 'total_valor' }
  ]);

// Gerar saída
const json = relatorio.gerarJSON();
const csv = relatorio.gerarCSV();
```

### Usando Templates

```typescript
import { TemplateRegistry } from './relatorio-templates';

// Obter template pré-configurado
const template = TemplateRegistry.obter('apontamentos');

const relatorio = new RelatorioBuilder('Apontamentos Mensais')
  .comPeriodo(2026, 1)
  .comColunas(template.colunas)
  .comAgregacoes(template.agregacoes)
  .comValidacoes(template.validacoes)
  .comFormatacao(template.formatacao)
  .comDados(dados);

const json = relatorio.gerarJSON();
```

---

## Métodos de Configuração

### `comPeriodo(ano, mes, dataInicio?, dataFim?)`

Define o período contábil do relatório.

```typescript
builder.comPeriodo(2026, 1);
builder.comPeriodo(2026, 1, '2026-01-01', '2026-01-31');
```

**Parâmetros:**
- `ano`: Número - Ano fiscal
- `mes`: Número (1-12) - Mês
- `dataInicio`: String ISO - Data de início (opcional)
- `dataFim`: String ISO - Data de fim (opcional)

---

### `comFiltroOrigem(modulo, origemId?, descricao?)`

Define o módulo/origem dos dados.

```typescript
builder.comFiltroOrigem('apontamento_prestador');
builder.comFiltroOrigem('advocacia', 123, 'Processos Ativos');
```

**Parâmetros:**
- `modulo`: String - Nome do módulo origem
- `origemId`: Number - ID específico (opcional)
- `descricao`: String - Descrição do filtro (opcional)

**Módulos Suportados:**
- `apontamento_prestador` - Apontamentos de prestadores
- `advocacia` - Processos e despesas legais
- `contas_pessoais` - Contas bancárias
- `imoveis` - Gestão patrimonial

---

### `comCentroCusto(id, nome?, recursivo?)`

Define filtro de centro de custo.

```typescript
builder.comCentroCusto('CC-001');
builder.comCentroCusto('CC-001', 'Centro Principal', true);
```

**Parâmetros:**
- `id`: String - ID ou código do centro
- `nome`: String - Nome do centro (opcional)
- `recursivo`: Boolean - Incluir sub-centros (default: false)

---

### `comFormatacao(opcoes)`

Define formatação de dados.

```typescript
builder.comFormatacao({
  moeda: 'BRL',
  dataFormat: 'DD/MM/YYYY',
  casasDecimais: 2,
  percentualPrecisao: 2,
  incluirHashAuditoria: true
});
```

**Opções:**
- `moeda`: 'BRL' | 'USD' | 'EUR' (default: BRL)
- `dataFormat`: 'DD/MM/YYYY' | 'YYYY-MM-DD' (default: DD/MM/YYYY)
- `casasDecimais`: Number (default: 2)
- `percentualPrecisao`: Number (default: 2)
- `incluirHashAuditoria`: Boolean (default: true)

---

### `comColunas(colunas) / adicionarColuna(coluna)`

Define colunas do relatório.

```typescript
// Definir múltiplas colunas
builder.comColunas([
  { nome: 'id', tipo: 'inteiro', largura: 80, alinhamento: 'direita' },
  { nome: 'descricao', tipo: 'texto', largura: 200 },
  { nome: 'valor', tipo: 'moeda', largura: 120, alinhamento: 'direita' }
]);

// Adicionar coluna individual
builder.adicionarColuna({
  nome: 'data',
  tipo: 'data',
  largura: 100,
  alinhamento: 'centro'
});
```

**Tipos de Coluna:**
- `texto` - Texto livre
- `inteiro` - Número inteiro
- `moeda` - Valor monetário
- `data` - Data
- `percentual` - Valor percentual

**Propriedades:**
- `nome`: String - Nome da coluna
- `tipo`: String - Tipo de dado
- `largura`: Number - Largura (opcional)
- `alinhamento`: 'esquerda' | 'centro' | 'direita' (opcional)
- `formatador`: Function - Formatador customizado (opcional)

---

### `comAgregacoes(agregacoes) / adicionarAgregacao(agregacao)`

Define agregações de dados.

```typescript
builder.comAgregacoes([
  { tipo: 'SUM', campo: 'valor', alias: 'total_valor' },
  { tipo: 'COUNT', campo: 'id', alias: 'total_registros' },
  { tipo: 'AVG', campo: 'valor', alias: 'media_valor' }
]);

builder.adicionarAgregacao({
  tipo: 'MAX',
  campo: 'valor',
  alias: 'maximo'
});
```

**Tipos de Agregação:**
- `SUM` - Soma
- `AVG` - Média
- `COUNT` - Contagem
- `MAX` - Máximo
- `MIN` - Mínimo

---

### `comValidacoes(validacoes) / adicionarValidacao(validacao)`

Define validações de dados.

```typescript
builder.comValidacoes([
  { campo: 'id', tipo: 'requerido' },
  {
    campo: 'valor',
    tipo: 'faixa',
    parametros: { min: 0, max: 1000000 },
    mensagem: 'Valor deve estar entre 0 e 1M'
  },
  {
    campo: 'email',
    tipo: 'formato',
    parametros: { regex: '^[^@]+@[^@]+\\.[^@]+$' }
  }
]);
```

**Tipos de Validação:**
- `requerido` - Campo obrigatório
- `faixa` - Validar intervalo (min/max)
- `formato` - Validar padrão regex
- `customizado` - Validação personalizada

---

### `comDados(dados)`

Define dados do relatório.

```typescript
builder.comDados([
  { id: 1, descricao: 'Atividade 1', valor: 1500 },
  { id: 2, descricao: 'Atividade 2', valor: 2000 }
]);
```

---

## Métodos de Saída

### `gerarJSON()`

Gera relatório em formato JSON com estrutura completa.

```typescript
const json = builder.gerarJSON();

// Resultado:
{
  "header": {
    "titulo": "Relatório de Apontamentos",
    "periodo": "01/2026",
    "dataGeracao": "2026-01-20T10:30:00Z"
  },
  "metadata": {
    "modulo": "apontamento_prestador",
    "versao": "1.0",
    "totalRegistros": 2,
    "hashAuditoria": "abc123def456"
  },
  "colunas": [...],
  "corpo": [...],
  "summary": {
    "totalLinhas": 2,
    "totalValor": 3500,
    "agregacoes": { "total_valor": 3500 }
  },
  "footer": {
    "dataHora": "20/01/2026 10:30:00",
    "versaoSistema": "1.0"
  }
}
```

---

### `gerarCSV(incluirHeader?)`

Gera relatório em formato CSV.

```typescript
const csv = builder.gerarCSV();
// ou
const csv = builder.gerarCSV(true); // com cabeçalho

// Resultado:
# Relatório: Relatório de Apontamentos
# Período: 1/2026
# Data de Geração: 20/01/2026 10:30:00

"id","descricao","valor"
"1","Atividade 1","1500"
"2","Atividade 2","2000"

# RESUMO
# total_valor: 3500
```

---

### `gerarPDF()`

Gera estrutura para PDF (requer biblioteca externa).

```typescript
const pdf = builder.gerarPDF();

// Usar com PDFKit ou similar:
// const doc = new PDFDocument();
// doc.text(pdf.estrutura.header.titulo);
// // ... renderizar estrutura
```

---

## Templates Pré-configurados

### TemplateApontamentos

Relatório de apontamentos de prestadores.

```typescript
const template = new TemplateApontamentos();

const relatorio = new RelatorioBuilder('Apontamentos')
  .comColunas(template.colunas)
  .comAgregacoes(template.agregacoes)
  .comValidacoes(template.validacoes)
  .comFormatacao(template.formatacao)
  .comDados(dados);
```

**Colunas:**
- id, data_apontamento, prestador_nome, centro_custo_codigo
- descricao_atividade, horas_apontadas, valor_hora, valor_total
- status_auditoria, observacoes

**Agregações:**
- total_valor (SUM), total_horas (SUM), total_apontamentos (COUNT)
- media_valor_hora (AVG)

---

### TemplateAdvocacia

Relatório de processos legais.

```typescript
const template = new TemplateAdvocacia();
```

**Colunas:**
- id, numero_processo, tipo_processo, descricao, status, foro
- valor_causa, estimativa_despesa, despesa_realizada, risco_potencial
- data_ajuizamento, advogado_responsavel

**Agregações:**
- total_processos, total_valor_causas, total_estimativa_despesas
- total_despesa_realizada, media_valor_causa

---

### TemplateContas

Relatório de contas pessoais.

```typescript
const template = new TemplateContas();
```

**Colunas:**
- id, correntista_nome, banco_codigo, banco_nome, agencia
- numero_conta, tipo_conta, saldo_anterior, total_creditos
- total_debitos, saldo_final, status, data_atualizacao

---

### TemplateImoveis

Relatório de imóveis.

```typescript
const template = new TemplateImoveis();
```

**Colunas:**
- id, endereco_completo, tipo_imovel, metragem
- valor_aquisicao, valor_mercado, uso_pessoal, financiado
- saldo_financiamento, instituicao_financeira, data_aquisicao
- status, documentacao_ok

---

## Formatadores de Dados

### FormatadorMoeda

```typescript
import { FormatadorMoeda } from './relatorio-formatacoes';

const fmt = new FormatadorMoeda('BRL', 2);
fmt.formatar(1500.50); // "R$ 1.500,50"
fmt.desformatar("R$ 1.500,50"); // 1500.50
```

### FormatadorData

```typescript
import { FormatadorData } from './relatorio-formatacoes';

const fmt = new FormatadorData('DD/MM/YYYY');
fmt.formatar('2026-01-15'); // "15/01/2026"
fmt.desformatar('15/01/2026'); // Date object
```

### FormatadorPercentual

```typescript
import { FormatadorPercentual } from './relatorio-formatacoes';

const fmt = new FormatadorPercentual(2);
fmt.formatar(0.75); // "75.00%"
fmt.desformatar("75%"); // 0.75
```

### FormatadorSaldo

```typescript
import { FormatadorSaldo } from './relatorio-formatacoes';

const fmt = new FormatadorSaldo('BRL', 2);
fmt.formatar(1500); // "CRE R$ 1.500,00"
fmt.formatar(-1500); // "DEV R$ 1.500,00"
```

### FormatadorHashAuditoria

```typescript
import { FormatadorHashAuditoria } from './relatorio-formatacoes';

const fmt = new FormatadorHashAuditoria(32, true);
fmt.formatar('abc123'); // "ABC123 ..." (segmentado)
fmt.validar(hash); // boolean
fmt.calcularChecksum(hash); // string
```

---

## Estendendo RelatorioBuilder

### Criar Template Customizado

```typescript
import { TemplateRelatorio } from './relatorio-templates';

export class TemplateCustomizado extends TemplateRelatorio {
  nome = 'Meu Relatório Customizado';
  descricao = 'Descrição do meu relatório';

  colunas = [
    { nome: 'campo1', tipo: 'texto' },
    { nome: 'campo2', tipo: 'moeda' }
  ];

  agregacoes = [
    { tipo: 'SUM', campo: 'campo2', alias: 'total' }
  ];

  validacoes = [
    { campo: 'campo1', tipo: 'requerido' }
  ];

  formatacao = {
    moeda: 'BRL',
    dataFormat: 'DD/MM/YYYY'
  };
}

// Usar:
const template = new TemplateCustomizado();
const builder = new RelatorioBuilder('Meu Relatório')
  .comColunas(template.colunas)
  .comAgregacoes(template.agregacoes);
```

### Formatador Customizado

```typescript
import { IFormatador } from './relatorio-formatacoes';

class MeuFormatador implements IFormatador {
  formatar(valor: any): string {
    // Implementar lógica de formatação
    return String(valor).toUpperCase();
  }

  desformatar(valor: string): any {
    return valor.toLowerCase();
  }
}

// Usar em coluna:
builder.adicionarColuna({
  nome: 'campo',
  tipo: 'texto',
  formatador: (v) => new MeuFormatador().formatar(v)
});
```

---

## Validação de Dados

### Validar Relatório

```typescript
const erros = builder.validarDados();

if (erros.length > 0) {
  console.error('Erros de validação:', erros);
} else {
  const json = builder.gerarJSON();
}
```

### Tipos de Validação

**Requerido:**
```typescript
{ campo: 'id', tipo: 'requerido' }
```

**Faixa:**
```typescript
{
  campo: 'valor',
  tipo: 'faixa',
  parametros: { min: 0, max: 10000 }
}
```

**Formato (Regex):**
```typescript
{
  campo: 'email',
  tipo: 'formato',
  parametros: { regex: '^[^@]+@[^@]+\\.[^@]+$' }
}
```

**Customizado:**
```typescript
{
  campo: 'status',
  tipo: 'customizado',
  parametros: { validar: (v) => ['ativo', 'inativo'].includes(v) }
}
```

---

## Agregações

### Cálculo Automático

O builder calcula automaticamente todas as agregações:

```typescript
builder
  .comAgregacoes([
    { tipo: 'SUM', campo: 'valor', alias: 'total' },
    { tipo: 'AVG', campo: 'valor', alias: 'media' },
    { tipo: 'MAX', campo: 'valor', alias: 'maximo' },
    { tipo: 'MIN', campo: 'valor', alias: 'minimo' },
    { tipo: 'COUNT', campo: 'id', alias: 'quantidade' }
  ])
  .comDados([...]);

const json = builder.gerarJSON();
const agregacoes = JSON.parse(json).summary.agregacoes;

console.log(agregacoes);
// {
//   total: 3500,
//   media: 1750,
//   maximo: 2000,
//   minimo: 1500,
//   quantidade: 2
// }
```

---

## Auditoria e Integridade

### Hash de Auditoria

O builder gera automaticamente hash para integridade:

```typescript
builder.comFormatacao({ incluirHashAuditoria: true });

const json = builder.gerarJSON();
const hash = JSON.parse(json).metadata.hashAuditoria;

// Hash é calculado baseado no conteúdo dos dados
```

### Rastreabilidade

```typescript
const json = JSON.parse(builder.gerarJSON());

const auditoria = {
  modulo: json.metadata.modulo,
  dataGeracao: json.metadata.dataGeracao,
  totalRegistros: json.metadata.totalRegistros,
  hash: json.metadata.hashAuditoria,
  usuario: json.header.usuario // se preenchido
};
```

---

## Casos de Uso

### Relatório Mensal de Apontamentos

```typescript
const relatorio = new RelatorioBuilder('Apontamentos - Janeiro 2026')
  .comPeriodo(2026, 1)
  .comFiltroOrigem('apontamento_prestador')
  .comCentroCusto('CC-GERAL', 'Geral', true)
  .comFormatacao({ moeda: 'BRL', dataFormat: 'DD/MM/YYYY' })
  .comColunas([...])
  .comAgregacoes([...])
  .comValidacoes([...])
  .comDados(apontamentos)
  .validarDados();

if (erros.length === 0) {
  const json = relatorio.gerarJSON();
  const csv = relatorio.gerarCSV();
  salvarArquivos(json, csv);
}
```

### Relatório de Conformidade Legal

```typescript
const relatorio = new RelatorioBuilder('Conformidade Legal')
  .comPeriodo(2026, 1)
  .comFiltroOrigem('advocacia')
  .comFormatacao({ incluirHashAuditoria: true })
  .comColunas(TemplateAdvocacia.colunas)
  .comAgregacoes(TemplateAdvocacia.agregacoes)
  .comDados(processos);

const json = relatorio.gerarJSON();
const hashIntegridade = JSON.parse(json).metadata.hashAuditoria;
```

### Relatório de Saldo de Contas

```typescript
const relatorio = new RelatorioBuilder('Saldo de Contas')
  .comPeriodo(2026, 1)
  .comFiltroOrigem('contas_pessoais')
  .comColunas([...])
  .comAgregacoes([
    { tipo: 'SUM', campo: 'saldo_final', alias: 'saldo_total' }
  ])
  .comDados(contas);

const json = relatorio.gerarJSON();
const csv = relatorio.gerarCSV();
```

---

## Performance e Otimizações

### Dados Grandes

Para relatórios com muitos registros:

```typescript
// Usar paginação
const lote = dados.slice(0, 1000);
builder.comDados(lote);

// Limitar agregações
builder.comAgregacoes([
  { tipo: 'SUM', campo: 'valor', alias: 'total' }
]);
```

### Reusabilidade

```typescript
// Clonar para reutilizar configuração
const base = new RelatorioBuilder('Base')
  .comPeriodo(2026, 1)
  .comColunas([...]);

const relatorio1 = base.clonar().comDados(dados1);
const relatorio2 = base.clonar().comDados(dados2);
```

---

## Troubleshooting

### Erros Comuns

**"Período não definido"**
- Sempre chamar `comPeriodo()` antes de gerar relatório

**"Nenhuma coluna definida"**
- Chamar `comColunas()` com array de colunas

**"Validação falha"**
- Verificar dados com `validarDados()` antes de gerar

**Hash inválido**
- Verificar se `comFormatacao({ incluirHashAuditoria: true })`

---

## Links Relacionados

- [relatorio-builder.ts](./relatorio-builder.ts) - Implementação principal
- [relatorio-templates.ts](./relatorio-templates.ts) - Templates
- [relatorio-formatacoes.ts](./relatorio-formatacoes.ts) - Formatadores
- [Testes](./\_\_tests\_\_/relatorio-builder.test.ts) - Suite de testes

---

## Roadmap Futuro

- [ ] Suporte a PDF nativo (PDFKit integration)
- [ ] Export para Excel/XLSX
- [ ] Gráficos e visualizações
- [ ] Comparação entre períodos
- [ ] Alertas baseados em regras
- [ ] Agendamento automático de relatórios
- [ ] API REST para geração remota
