# Reconstituição contábil — locação de imóveis (pessoa física)

Aplicativo web (React + TypeScript + Vite) para organizar, reconciliar e reconstituir
a contabilidade de uma atividade de fato de locação de imóveis misturada em contas de
pessoa física — pensado para gerar relatórios (DRE, inadimplência, depósitos caução)
com lastro documental para uso em perícia judicial.

**Tudo roda no navegador.** Não há backend: os dados ficam num banco SQLite
(via [sql.js](https://sql.js.org/), compilado para WebAssembly) persistido no
IndexedDB do próprio navegador. Nada é enviado para servidor nenhum — importante dado
o caráter sensível dos documentos financeiros e o contexto de quebra de sigilo bancário.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra o app e clique em **"Carregar dados de demonstração"** para popular o banco com
um dataset simulado (3 anos, 6 contas, 10 imóveis, ~40 contratos, inadimplência e
cauções fictícias) e explorar todas as telas sem precisar de documentos reais.

## Funcionalidades

- **Importar documentos** (`/importar`): arraste ou selecione extratos `.ofx`/`.qfx`,
  planilhas `.csv`, PDFs de extrato bancário ou fatura de cartão, e fotos de boleto/
  comprovante PIX. Cada arquivo é processado no navegador e as transações extraídas
  ficam em preview para revisão antes de gravar no banco.
- **Painel**: DRE dos últimos 12 meses, série mensal de receita/despesa/resultado
  (36 meses) e gráfico de inadimplência por faixa de atraso.
- **Transações**: fila de revisão e categorização manual pelo plano de contas.
- **Contratos e inadimplência**: lista de contratos de locação e competências em
  aberto com dias de atraso, multa e juros de mora calculados pelas cláusulas de
  cada contrato.
- **Depósitos caução**: correção monetária mês a mês (poupança/IGPM/IPCA) a partir
  da série cadastrada em `indices_economicos`.
- **Exportar/importar backup**: baixa ou restaura o banco inteiro como um arquivo
  `.sqlite`.

## Limitações conhecidas (leia antes de usar com dados reais)

- **OCR de imagens** (`src/domain/parsers/ocrImagem.ts`) usa
  [tesseract.js](https://github.com/naptha/tesseract.js) com worker e núcleo WASM
  vendorizados em `public/tesseract/` (não dependem de CDN), mas o **pacote de
  idioma português** (`por.traineddata`) ainda é baixado de uma CDN pública no
  primeiro uso e fica em cache no navegador depois disso. Isso não pôde ser testado
  neste ambiente de desenvolvimento porque a política de rede do sandbox bloqueia
  esse download — funciona normalmente num navegador comum com internet.
- **Extração de PDF** (`pdfDocumento.ts`, `linhasTransacao.ts`) funciona por
  heurística de regex sobre o texto extraído — cobre bem extratos e faturas com
  layout "data + descrição + valor" por linha, mas layouts muito diferentes do
  testado podem exigir ajuste da regex `REGEX_LINHA`.
- **CSV**: prefira exportações com `;` como separador (padrão de exportação
  brasileira) quando os valores usam vírgula decimal — um CSV separado por vírgula
  *e* com vírgula decimal é ambíguo e não é detectado corretamente.
- **Nenhuma chamada real de IA**: `contabilidade-reconstituicao/src/categorize/router.py`
  documenta o roteamento de custo (Gemini Flash para OCR, Ollama local para lote,
  Claude para exceções/laudo), mas nenhuma chave de API está configurada — a
  categorização hoje é 100% por regra determinística + revisão manual.
- Os **índices econômicos** pré-carregados nos dados de demonstração são
  **ilustrativos** — substitua pelos valores reais do BACEN (poupança) e IBGE
  (IGP-M/IPCA) antes de usar o cálculo de caução para qualquer fim oficial.

## Estrutura

```
src/
  db/                    conexão sql.js + persistência IndexedDB
  domain/
    types.ts             tipos espelhando o schema SQL
    parsers/             OFX, CSV, PDF (pdfjs-dist), OCR (tesseract.js), dispatcher
    categorize/           regras determinísticas de categorização
    reconcile/            conciliação contrato×transação, aging de inadimplência
    reports/              DRE e série mensal
    caucao/                correção monetária de depósito caução
    seed/                  gerador de dados simulados
  components/            telas React (Dashboard, Importar, Transações, Contratos, Caução)

contabilidade-reconstituicao/   scaffold Python-espelho (schema.sql canônico, notas
                                de arquitetura, roteamento de IA por custo) — ver seu
                                próprio README para o dossiê técnico completo.
```

O `schema.sql` em `contabilidade-reconstituicao/` é a fonte única do modelo de dados;
o app web importa esse mesmo arquivo (`?raw`) para inicializar o sql.js, então os dois
lados nunca divergem.
