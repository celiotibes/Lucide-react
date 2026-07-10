# Reconstituição contábil — locação de imóveis (pessoa física)

Aplicativo web (React + TypeScript + Vite) para organizar, reconciliar e reconstituir
a contabilidade de uma atividade de fato de locação de imóveis misturada em contas de
pessoa física — pensado para gerar relatórios (DRE, inadimplência, depósitos caução)
com lastro documental para uso em perícia judicial.

**O núcleo roda inteiramente no navegador.** Os dados ficam num banco SQLite
(via [sql.js](https://sql.js.org/), compilado para WebAssembly) persistido no
IndexedDB do próprio navegador — nada é enviado a servidor nenhum por padrão,
importante dado o caráter sensível dos documentos financeiros e o contexto de
quebra de sigilo bancário. A única exceção é **opcional**: conectar um banco
via Open Finance (Pluggy) exige um pequeno backend próprio (`server/`), porque
o Client Secret da Pluggy nunca pode ficar no navegador — ver a seção
"Conectar banco via Open Finance" abaixo.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra o app e clique em **"Carregar dados de demonstração"** para popular o banco com
um dataset simulado (3 anos, 6 contas, 10 imóveis, ~40 contratos, inadimplência e
cauções fictícias) e explorar todas as telas sem precisar de documentos reais.

## Funcionalidades

- **Imóveis**: cadastro dos seus imóveis reais (apelido, tipo, cidade/grupo — ex: Floripa,
  Curitiba —, endereço, fração ideal, área, financiado, uso pessoal). Cidade agrupa
  relatórios e rateio por região; marcar "uso pessoal" tira o imóvel do DRE da atividade de
  locação por padrão, mantendo suas despesas rastreáveis separadamente.
- **Importar documentos** (`/importar`): arraste ou selecione extratos `.ofx`/`.qfx`,
  planilhas `.csv`, PDFs de extrato bancário ou fatura de cartão, e fotos de boleto/
  comprovante PIX. Cada arquivo é processado no navegador e as transações extraídas
  ficam em preview para revisão antes de gravar no banco.
- **Documentos e classificação**: envie contratos, recibos, faturas, notas fiscais,
  pedidos comerciais e boletos — o sistema extrai valor, data e CNPJ/CPF do texto
  (heurística determinística local, sem IA) e sugere a qual pagamento/PIX cada documento
  corresponde por proximidade de valor/data e ocorrência do CNPJ/nome do fornecedor na
  descrição bancária. Ao confirmar um vínculo, a classificação do documento (categoria do
  plano de contas e imóvel — único ou rateio proporcional entre vários, se o documento
  cobrir mais de um) é aplicada à transação. Nunca classifica sozinho: toda sugestão
  precisa de confirmação explícita.
- **Painel**: DRE dos últimos 12 meses, série mensal de receita/despesa/resultado
  (36 meses) e gráfico de inadimplência por faixa de atraso.
- **Transações**: fila de revisão e categorização manual pelo plano de contas.
- **Contratos e inadimplência**: lista de contratos de locação e competências em
  aberto com dias de atraso, multa e juros de mora calculados pelas cláusulas de
  cada contrato.
- **Reajustes e rescisão**: histórico de reajuste por contrato (1ª renovação por
  percentual fixo pré-acordado, renovações seguintes pela variação acumulada do
  índice contratado desde o último reajuste) e calculadora de multa rescisória
  proporcional por quebra antecipada do prazo determinado (art. 4º, Lei 8.245/91).
- **Depósitos caução**: correção monetária mês a mês (poupança/IGPM/IPCA) a partir
  da série cadastrada em `indices_economicos`.
- **Índices econômicos**: busca IGP-M, IPCA e poupança direto da API pública do
  Banco Central (SGS), rodando no navegador — sem passar por nenhum backend deste
  projeto — com lançamento manual como fallback se a busca falhar.
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
  contrato costuma obrigar o locador a enviar ao locatário periodicamente. Junto
  dele, uma sugestão de novo percentual de rateio para o próximo ciclo, que
  amortiza o saldo (superávit/déficit) do período ao longo de 12 meses — nunca
  aplica sozinho, só sugere.
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
  categorização hoje é 100% por regra determinística + revisão manual. O mesmo vale
  para a extração de campos de documentos (`src/domain/documentos/extrairCampos.ts`):
  valor/data/CNPJ saem de regex sobre o texto extraído, e "produto/serviço a que se
  refere" é preenchido por você — nenhum modelo de linguagem lê o documento.
- **Casamento documento×transação** (`src/domain/documentos/matching.ts`) é por
  proximidade de valor (±3%) e data (±15 dias), mais bônus se o CNPJ/CPF ou o nome do
  fornecedor aparecer na descrição bancária crua — sempre revise a sugestão antes de
  confirmar, principalmente quando o score aparecer abaixo de 70%.
- Os **índices econômicos** pré-carregados nos dados de demonstração são
  **ilustrativos**. A aba "Índices econômicos" busca os valores reais do BACEN
  (IGP-M, IPCA, poupança) e sobrescreve os simulados — use-a antes de fechar
  qualquer cálculo de reajuste, mora ou caução para fim oficial. Os códigos de
  série (`SERIES_BACEN` em `src/domain/indices/bacenSgs.ts`) não puderam ser
  validados contra uma resposta real neste ambiente de desenvolvimento (a
  política de rede do sandbox bloqueia `api.bcb.gov.br`) — confira os
  primeiros valores buscados contra o que você já sabe do período antes de
  confiar neles para fins periciais.
- **Lei de Benford**: só é um sinal confiável quando os valores testados cobrem
  várias ordens de grandeza. Não aplique a categorias de valor fixo (aluguel,
  financiamento) nem a um conjunto pequeno/estreito de valores — o próprio app
  já restringe o teste a despesas variáveis, mas o resultado ainda exige leitura
  crítica, não é veredito automático.
- **Conciliação automática com o banco (Pluggy)**: implementada como recurso opcional
  em `server/` + `src/components/ConectarPluggy.tsx`. Exige rodar o backend próprio
  (guarda o Client Secret, nunca o navegador) e aceitar que os extratos passem por
  ele e pela Pluggy — não é mais "100% local" para quem usar esse caminho. Ver
  "Conectar banco via Open Finance" abaixo. Não testado ponta a ponta com credenciais
  reais neste ambiente de desenvolvimento (sandbox sem acesso às suas credenciais).
- **Livro razão é derivado, não oficial**: `src/domain/contabilidade/livroRazao.ts`
  deriva débito/crédito de cada transação na hora (sem tabela nova, sempre
  consistente com as transações), suficiente como balancete de verificação para
  um contador formalizar — mas não substitui o livro diário registrado/autenticado
  que a legislação exige de uma empresa de fato.
- **Decomposição aluguel × rateio** (`percentual_aluguel_efetivo`): o mecanismo
  de balanceamento anual que alguns contratos preveem agora tem sugestão
  automática (aba Renda tributável → "Ajuste de rateio sugerido"), mas ela
  amortiza o saldo linearmente em 12 meses — se o seu contrato prevê outro
  critério de rateio do saldo, confira a fórmula antes de aplicar.

## Conectar banco via Open Finance (opcional)

Além do upload manual, dá para conectar um banco de verdade via
[Pluggy](https://pluggy.ai) (Open Finance Brasil). Isso exige um backend
próprio, porque o Client Secret não pode ficar no navegador:

```bash
cd server
npm install
cp .env.example .env   # preencha CLIENT_ID/CLIENT_SECRET do dashboard.pluggy.ai
npm run dev            # sobe em http://localhost:8787
```

Com o backend no ar, abra **Importar documentos** no app web → "Conectar
banco via Open Finance" → aponte a URL do backend → conecte. Ver
`server/README.md` para detalhes, incluindo como testar webhooks localmente.

**Trade-off importante**: esse caminho tira a garantia de "tudo local" — os
extratos passam pelo seu backend e pela Pluggy. O upload manual de
OFX/CSV/PDF continua sendo o caminho 100% local, sem esse trade-off.

**Segurança**: nunca exponha `CLIENT_SECRET` em código, print de tela ou
mensagem. Se um Client Secret vazar por engano, regenere-o imediatamente em
dashboard.pluggy.ai antes de usar o backend em produção.

## Estrutura

```
src/
  db/                    conexão sql.js + persistência IndexedDB
  domain/
    types.ts             tipos espelhando o schema SQL
    planoDeContas.ts     plano de contas padrão — populado na abertura do banco,
                         não só em "Carregar dados de demonstração"
    parsers/             OFX, CSV, PDF (pdfjs-dist), OCR (tesseract.js), dispatcher
    categorize/           regras determinísticas + regras aprendidas de categorização
    contratos/             locatários/responsáveis solidários, histórico de reajustes
                           e multa rescisória por contrato
    reconcile/            conciliação contrato×transação, aging de inadimplência
    reports/              DRE, série mensal, renda tributável (Carnê-Leão), DSS
    caucao/                correção monetária de depósito caução
    financiamento/         cronograma SAC/Price e detector de anatocismo
    auditoria/             duplicidade, outliers, lacunas, Lei de Benford
    rateio/                divisão de despesas coletivas entre imóveis (por critério
                           ou por percentual explícito de um documento)
    documentos/            extração de campos de documento, persistência e casamento
                           documento×transação
    contabilidade/          livro razão / balancete (partida dobrada derivada)
    indices/                busca de IGP-M/IPCA/poupança direto da API do BACEN
    laudo/                 geração do PDF do laudo pericial
    seed/                  gerador de dados simulados
  components/            telas React (Dashboard, Imóveis, Importar, Documentos e
                          classificação, Transações, Contratos, Reajustes e rescisão,
                          Caução, Financiamentos, Índices econômicos, Renda
                          Tributável, Livro Razão, Auditoria, Laudo)

contabilidade-reconstituicao/   scaffold Python-espelho (schema.sql canônico, notas
                                de arquitetura, roteamento de IA por custo) — ver seu
                                próprio README para o dossiê técnico completo.

server/                        backend opcional para conectar banco via Pluggy
                                (Open Finance) — só existe pelo Client Secret.
```

O `schema.sql` em `contabilidade-reconstituicao/` é a fonte única do modelo de dados;
o app web importa esse mesmo arquivo (`?raw`) para inicializar o sql.js, então os dois
lados nunca divergem.
