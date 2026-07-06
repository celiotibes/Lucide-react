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
- **Financiamentos**: cronograma teórico SAC/Price gerado localmente e comparado
  mês a mês com o que foi de fato lançado, sinalizando divergência de juros acima
  de 5% (indício de anatocismo ou encargo não previsto em contrato).
- **Auditoria forense**: duplicidade de lançamento, outliers estatísticos (z-score)
  por categoria, lacunas em despesas recorrentes e teste da Lei de Benford — tudo
  local, sem IA paga.
- **Rateio de despesas coletivas**: qualquer transação pode ser dividida entre
  vários imóveis por fração ideal, área ou partes iguais; o DRE por imóvel já
  soma a fatia correspondente.
- **Categorização com aprendizado**: ao categorizar uma transação manualmente, dá
  para salvar o padrão como regra e aplicá-la de uma vez às pendências semelhantes.
- **Laudo pericial**: exporta um PDF com DRE, inadimplência e achados de auditoria
  do período — apoio à instrução, não uma peça jurídica pronta.
- **Múltiplos locatários e responsáveis solidários**: um contrato pode ter vários
  nomes vinculados (comum em locação estudantil/compartilhada), todos exibidos
  junto ao contrato.
- **Renda tributável (Carnê-Leão)**: separa, mês a mês, o que é Aluguel Efetivo
  (base do IRPF) do que é reembolso de rateio de custeio coletivo — para contratos
  de "valor único mensal" que decompõem o valor cobrado em duas naturezas
  jurídicas distintas.
- **DSS (Demonstrativo Semestral Simplificado)**: arrecadação do rateio × gasto
  real em custeio coletivo por contrato/imóvel — o relatório que esse tipo de
  contrato costuma obrigar o locador a enviar ao locatário periodicamente.
- **Livro razão e balancete**: cada transação é derivada em duas pernas
  (débito/crédito) na hora, sem tabela nova — dá o balancete de verificação por
  conta que um contador usa como ponto de partida para fechar um balanço formal.
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
- **Lei de Benford**: só é um sinal confiável quando os valores testados cobrem
  várias ordens de grandeza. Não aplique a categorias de valor fixo (aluguel,
  financiamento) nem a um conjunto pequeno/estreito de valores — o próprio app
  já restringe o teste a despesas variáveis, mas o resultado ainda exige leitura
  crítica, não é veredito automático.
- **Sem conciliação automática com o banco**: a importação é manual (upload de
  arquivo). Registro direto como instituição participante do Open Finance Brasil
  exigiria certificação FAPI/mTLS pelo Bacen — inviável para um app pessoal. O
  caminho realista é um agregador certificado (Pluggy, Belvo) como intermediário:
  ele já tem a certificação, expõe uma API REST simples, e você só paga por conta
  conectada — mas isso tira a garantia de "tudo local", já que seus extratos
  passariam pelo servidor do agregador. Não implementado até decidir esse trade-off.
- **Livro razão é derivado, não oficial**: `src/domain/contabilidade/livroRazao.ts`
  deriva débito/crédito de cada transação na hora (sem tabela nova, sempre
  consistente com as transações), suficiente como balancete de verificação para
  um contador formalizar — mas não substitui o livro diário registrado/autenticado
  que a legislação exige de uma empresa de fato.
- **Decomposição aluguel × rateio** (`percentual_aluguel_efetivo`) assume que o
  próprio contrato já define o percentual fixo de cada parte — não há apuração
  automática de superávit/déficit ano a ano como alguns contratos preveem
  (mecanismo de balanceamento anual); o DSS mostra o saldo do período, mas o
  ajuste dos percentuais na renovação ainda é manual.

## Estrutura

```
src/
  db/                    conexão sql.js + persistência IndexedDB
  domain/
    types.ts             tipos espelhando o schema SQL
    parsers/             OFX, CSV, PDF (pdfjs-dist), OCR (tesseract.js), dispatcher
    categorize/           regras determinísticas + regras aprendidas de categorização
    contratos/             locatários/responsáveis solidários por contrato
    reconcile/            conciliação contrato×transação, aging de inadimplência
    reports/              DRE, série mensal, renda tributável (Carnê-Leão), DSS
    caucao/                correção monetária de depósito caução
    financiamento/         cronograma SAC/Price e detector de anatocismo
    auditoria/             duplicidade, outliers, lacunas, Lei de Benford
    rateio/                divisão de despesas coletivas entre imóveis
    contabilidade/          livro razão / balancete (partida dobrada derivada)
    laudo/                 geração do PDF do laudo pericial
    seed/                  gerador de dados simulados
  components/            telas React (Dashboard, Importar, Transações, Contratos,
                          Caução, Financiamentos, Renda Tributável, Livro Razão,
                          Auditoria, Laudo)

contabilidade-reconstituicao/   scaffold Python-espelho (schema.sql canônico, notas
                                de arquitetura, roteamento de IA por custo) — ver seu
                                próprio README para o dossiê técnico completo.
```

O `schema.sql` em `contabilidade-reconstituicao/` é a fonte única do modelo de dados;
o app web importa esse mesmo arquivo (`?raw`) para inicializar o sql.js, então os dois
lados nunca divergem.
