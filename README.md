# CRMT Histórico Contábil & Financeiro

Reconstituição contábil — locação de imóveis (pessoa física). Aplicativo web
(React + TypeScript + Vite) para organizar, reconciliar e reconstituir a
contabilidade de uma atividade de fato de locação de imóveis misturada em
contas de pessoa física — pensado para gerar relatórios (DRE, inadimplência,
depósitos caução) com lastro documental para uso em perícia judicial.

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
um dataset simulado (3 anos, 6 contas, 12 imóveis, ~40 contratos, inadimplência e
cauções fictícias) e explorar todas as telas sem precisar de documentos reais.

**Nunca instalou Node.js ou rodou um projeto assim antes?** Veja
[`GUIA_INSTALACAO_E_USO.md`](./GUIA_INSTALACAO_E_USO.md) — passo a passo completo
do zero (instalar Node, baixar o projeto, primeiro uso, onde os dados ficam salvos,
backup, problemas comuns), sem presumir experiência prévia com programação. Inclui
atalhos de clique duplo (`iniciar-windows.bat` / `iniciar-mac-linux.command`) que
instalam e abrem o sistema sozinhos, e uma variante em modo produção
(`instalar-producao-windows.bat` / `instalar-producao-mac-linux.command`) que gera
o pacote otimizado (`npm run build`, falha alto sem servir nada quebrado) antes de
servi-lo em `http://localhost:4173`.

## Funcionalidades

- **Imóveis**: cadastro dos seus imóveis reais (apelido, tipo, cidade/grupo — ex: Floripa,
  Curitiba —, endereço, fração ideal, área, financiado, uso pessoal). Cidade agrupa
  relatórios e rateio por região; marcar "uso pessoal" tira o imóvel do DRE da atividade de
  locação por padrão, mantendo suas despesas rastreáveis separadamente. Ao editar um imóvel já
  salvo, um "Inventário de bens" opcional guarda o mobiliário/equipamentos entregues (o mesmo
  conteúdo do "Relação e Inventário de Bens" que contratos reais anexam na vistoria de
  entrada), usado depois como referência no Relatório de Apuração de Débitos (RAD) — ver
  Depósitos caução.
- **Cadastros**: contratos de locação completos (dados básicos, regras de reajuste,
  inadimplência), com locatários/responsáveis solidários e depósito caução gerenciados
  inline por contrato, além de contas bancárias, prestadores de serviço, financiamentos e
  obras — tudo o que antes só existia nos dados de demonstração.
- **Importar documentos** (`/importar`): arraste ou selecione extratos `.ofx`/`.qfx`,
  planilhas `.csv`, PDFs de extrato bancário ou fatura de cartão, e fotos de boleto/
  comprovante PIX. Cada arquivo é processado no navegador e as transações extraídas
  ficam em preview para revisão antes de gravar no banco.
- **Documentos e classificação**: envie contratos, recibos, faturas, pedidos comerciais
  e boletos (PDF ou foto) — o sistema extrai valor, data e CNPJ/CPF do texto (heurística
  determinística local, sem IA). Para **nota fiscal em XML** (NF-e modelo 55 ou NFS-e), a
  extração é por tag em vez de regex sobre texto de OCR: pega automaticamente valor,
  data de emissão, CNPJ/razão social do emitente, número da nota e a descrição do
  produto/serviço — a NF-e segue o layout nacional único do SEFAZ (extração confiável); a
  NFS-e não tem padrão nacional (cada prefeitura define o próprio XML), então a extração é
  best-effort pelos nomes de tag mais comuns e cai para "sem categoria automática" (nunca
  finge sucesso) se não reconhecer o layout do seu município. Em qualquer caso, o sistema
  sugere a qual pagamento/PIX cada documento corresponde por proximidade de valor/data e
  ocorrência do CNPJ/nome do fornecedor na descrição bancária. Ao confirmar um vínculo, a
  classificação do documento (categoria do plano de contas e imóvel — único ou rateio
  proporcional entre vários, se o documento cobrir mais de um) é aplicada à transação.
  Nunca classifica sozinho: toda sugestão precisa de confirmação explícita.
- **Painel**: DRE dos últimos 12 meses, uma cascata (waterfall) do resultado — receita
  bruta menos cada categoria de despesa, da maior para a menor, até o resultado
  líquido, mostrando visualmente como cada corte de despesa corrói o resultado —,
  série mensal de receita/despesa/resultado (36 meses), gráfico de inadimplência por
  faixa de atraso, ranking de resultado líquido por imóvel, DRE agregado por
  cidade/centro de custo (Floripa × Curitiba), um mapa de calor de despesa por
  categoria × mês (intensidade de cor proporcional ao gasto, para achar visualmente
  em qual mês cada centro de custo pesou mais) e um diagrama de fluxo (Sankey)
  mostrando de onde o dinheiro entra (imóvel/salário) → por qual conta bancária
  passa → para onde sai (categoria de despesa) — o ponto forense do diagrama é
  evidenciar visualmente que receita de locação e renda pessoal atravessam as
  mesmas contas de onde saem despesas pessoais.
- **Pendências**: worklist consolidado — reúne, ordenado por severidade, tudo que
  já é detectado nas outras abas (transação sem categoria, competência em atraso,
  possível duplicidade, lacuna em despesa recorrente, caução sem depósito
  correspondente, financiamento sem lançamento ou sem saldo/parcela informada,
  divergência entre renda declarada e reconstituída, backup desatualizado) — sem
  precisar visitar aba por aba para saber o que falta revisar.
- **Transações**: fila de revisão e categorização manual pelo plano de contas, com
  coluna PF × Negócio (derivada do grupo da conta: `pessoal` é PF, `receita`/`despesa`
  é a atividade de locação, `transferencia` — entre contas próprias, caução — fica à
  parte por não ser nem um nem outro) e exportação em CSV do mapa de conciliação
  completo (Data, Descrição, Valor, Categoria, Imóvel, PF/Negócio, Origem). Filtros
  manuais por categoria, imóvel e intervalo de data — e é o destino do drill-down do
  resto do app: uma barra da cascata do DRE, uma célula do mapa de calor, um bloco do
  Sankey, um achado da Auditoria forense ou um mês divergente em Financiamentos abrem
  aqui já filtrados nos lançamentos exatos envolvidos, em vez de só mostrar o total
  agregado.
- **Contratos e inadimplência**: lista de contratos de locação e competências em
  aberto com dias de atraso, multa e juros de mora calculados pelas cláusulas de
  cada contrato (só contratos `residencial_fixo`, que têm dia de vencimento e valor
  fixo). Contratos Airbnb/temporada têm sua própria checagem, separada: meses em
  que o contrato estava vigente e nenhuma receita (conta 1.2.01) foi lançada para o
  imóvel — sinal de repasse da plataforma ainda não importado, não uma afirmação de
  quanto deveria ter sido recebido (reserva por reserva não tem valor de referência
  mensal fixo para comparar).
- **Reajustes e rescisão**: histórico de reajuste por contrato (1ª renovação por
  percentual fixo pré-acordado, renovações seguintes pela variação acumulada do
  índice contratado desde o último reajuste) e calculadora de multa rescisória
  proporcional por quebra antecipada do prazo determinado (art. 4º, Lei 8.245/91).
- **Depósitos caução**: correção monetária mês a mês (poupança/IGPM/IPCA) a partir
  da série cadastrada em `indices_economicos`, mais um painel de passivo de caução
  que compara o total ainda retido (corrigido) contra o caixa disponível hoje —
  mostra se o dinheiro do caução está de fato reservado ou já foi consumido no
  fluxo de caixa geral (passivo descoberto). O botão de lápis em cada linha
  registra a devolução (data, valor) e/ou a dedução apurada na vistoria de saída
  (descrição + valor) — nunca calculada automaticamente, sempre digitada por você
  a partir da vistoria real. Cada linha gera o **Relatório de Apuração de Débitos
  (RAD)** em PDF — inventário de bens do imóvel (cadastrado em Imóveis →
  "Inventário de bens", opcional) + a dedução já registrada na caução + saldo a
  devolver; nunca presume dano nem inventa vistoria que não aconteceu — diz
  explicitamente "nenhum item cadastrado"/"nenhuma dedução registrada" quando é
  o caso.
- **Índices econômicos**: busca IGP-M, IPCA e poupança direto da API pública do
  Banco Central (SGS), rodando no navegador — sem passar por nenhum backend deste
  projeto — com lançamento manual como fallback se a busca falhar.
- **Financiamentos**: cronograma teórico SAC/Price gerado localmente e comparado
  mês a mês com o que foi de fato lançado, sinalizando divergência de juros acima
  de 5% (indício de anatocismo ou encargo não previsto em contrato).
- **Patrimônio e alavancagem**: balanço patrimonial (ativo − passivo), diferente do
  DRE — patrimônio líquido imobiliário (valor venal dos imóveis próprios menos saldo
  devedor de financiamentos e dívidas de consumo), alavancagem por imóvel, liquidez
  corrente (caixa disponível ÷ compromissos de curto prazo) e comprometimento de
  renda. Imóveis em gestão de terceiros (matrícula de outra pessoa) ficam de fora do
  patrimônio líquido, mas continuam com o fluxo de caixa rastreado normalmente. Um
  imóvel próprio com **copropriedade real cujo percentual ainda não foi confirmado**
  (Cadastros → Imóveis → "Copropriedade") continua contando 100% no patrimônio —
  o sistema nunca estima a divisão entre titulares — mas fica sinalizado como
  pendência em Pendências até você confirmar o percentual real (matrícula/escritura).
  Cadastros → Dívidas de consumo cobre consignado/empréstimo/cartão parcelado — sem
  matrícula, porque o Registrato/SCR do Bacen não tem API pública; o saldo é
  relançado manualmente a partir do relatório que você mesmo baixa em
  `registrato.bcb.gov.br`. O demonstrativo de endividamento global inclui o VPL de
  cada dívida (taxa de desconto mensal configurável) — mostra que a soma nominal das
  parcelas futuras "vale" menos hoje do que parece, mas ainda é exigibilidade
  presente sobre o patrimônio.
- **Auditoria forense**: duplicidade de lançamento, outliers estatísticos (z-score)
  por categoria, lacunas em despesas recorrentes, teste da Lei de Benford e
  consistência entre módulos (caução cadastrada sem depósito correspondente no
  extrato, transação de caução sem registro formal, financiamento sem nenhuma
  parcela lançada) — tudo local, sem IA paga. A mesma aba traz também o
  **histórico de edições**: toda criação/edição de imóvel, contrato, financiamento
  ou depósito caução grava um snapshot completo do registro antes/depois (tabela
  `log_alteracoes`) — distinto da auditoria forense (que audita os dados
  financeiros), esta é a trilha de quem mudou o quê nos próprios cadastros.
- **Rateio de despesas coletivas**: qualquer transação pode ser dividida entre
  vários imóveis por fração ideal, área ou partes iguais; o DRE por imóvel já
  soma a fatia correspondente.
- **Categorização com aprendizado**: ao categorizar uma transação manualmente, dá
  para salvar o padrão como regra e aplicá-la de uma vez às pendências semelhantes.
  Opcionalmente a regra também pode fixar um imóvel (útil para fornecedor recorrente
  de uma unidade só, ex: CEMIG/CASAN de um imóvel específico) — nunca sobrescreve um
  imóvel (ou rateio) já atribuído manualmente a uma transação.
- **Laudo pericial**: exporta um PDF com 9 seções — metodologia, capacidade
  contributiva real, DRE com análise vertical/horizontal, patrimônio líquido e
  alavancagem, inadimplência, passivo de caução, desempenho por imóvel, achados de
  auditoria forense (duplicidades, outliers, lacunas, Lei de Benford, possível
  anatocismo em financiamento e consistência entre cadastro e transação — os mesmos
  achados que a aba Auditoria forense já mostra na tela) e ressalvas — apoio à
  instrução, não uma peça jurídica pronta.
- **Histórico de documentos gerados**: todo Laudo pericial ou RAD gerado fica
  registrado no próprio banco (aba Laudo pericial → "Histórico de documentos
  gerados") com hash SHA-256 do PDF exato — diferente do hash de backup (que é do
  banco inteiro), este é por documento individual: prova de qual foi o conteúdo
  entregue numa data específica, se for questionado depois.
- **Múltiplos locatários e responsáveis solidários**: um contrato pode ter vários
  nomes vinculados (comum em locação estudantil/compartilhada), todos exibidos
  junto ao contrato.
- **Capacidade contributiva real**: consolida recebido bruto → (−) reembolso de
  rateio (não tributável) → (−) despesa operacional → = resultado líquido real,
  mês a mês e no acumulado — o argumento central de que renda bruta recebida não
  é o mesmo que capacidade de pagar. Inclui também uma análise vertical (cada
  linha do DRE como % da receita) e horizontal (variação contra o período
  imediatamente anterior de mesma duração) para evidenciar se despesa subiu na
  mesma proporção da receita ou ficou para trás.
- **Regime de caixa × regime de competência**: compara, mês a mês, o aluguel devido
  pelos contratos residenciais fixos (competência, mesmo motor do módulo de
  inadimplência) contra o efetivamente recebido no caixa — evidencia que em meses de
  atraso a renda devida supera a recebida, e é o caixa que determina capacidade de
  pagar de fato.
- **Renda tributável (Carnê-Leão)**: separa, mês a mês, o que é Aluguel Efetivo
  (base do IRPF) do que é reembolso de rateio de custeio coletivo — para contratos
  de "valor único mensal" que decompõem o valor cobrado em duas naturezas
  jurídicas distintas. O imposto do Carnê-Leão é calculado uma única vez sobre a
  base tributável agregada de TODOS os imóveis (é uma obrigação mensal pessoal do
  contribuinte, nunca por imóvel), e alocado proporcionalmente só para exibição por
  imóvel. Inclui também um comparativo declarado × reconstituído, ano-calendário a
  ano-calendário: cruza a renda reconstituída a partir dos extratos reais contra o
  que foi de fato lançado em Cadastros → Declarações fiscais (DIRPF anual ou soma
  de Carnê-Leão mensal) — nunca assume "declarado = zero" quando nada foi lançado,
  ausência de dado fica marcada como ausência de dado.
- **Simulador de Carnê-Leão por imóvel**: aplica a tabela progressiva mensal do IRPF
  (vigente desde 05/2024 — confira se mudou) sobre a renda tributável menos despesas
  dedutíveis selecionáveis por checkbox (manutenção e taxas de administração vêm
  marcadas por padrão; condomínio/IPTU fica desmarcado por padrão para evitar dupla
  dedução quando há reembolso de rateio embutido no contrato). Claramente rotulado
  como simulação, não apuração oficial — confirme com um contador antes de usar em
  juízo.
- **DSS (Demonstrativo Semestral Simplificado)**: arrecadação do rateio × gasto
  real em custeio coletivo por contrato/imóvel — o relatório que esse tipo de
  contrato costuma obrigar o locador a enviar ao locatário periodicamente. Junto
  dele, uma sugestão de novo percentual de rateio para o próximo ciclo, que
  amortiza o saldo (superávit/déficit) do período ao longo de 12 meses — nunca
  aplica sozinho, só sugere. Um contrato pode ter, opcionalmente, a composição
  **contratada** da Cota de Custeio cadastrada por sub-rubrica (Cadastros →
  Contratos → linha expandida) — ex: "conservação de mobiliário de áreas
  comuns", "lavanderia coletiva", cada uma com seu percentual/valor na data da
  assinatura, conforme contratos reais costumam itemizar. Isso aparece no DSS
  como referência documental ao lado do gasto real, nunca somado a ele: a
  conciliação bancária das transações só existe no grão do plano de contas
  (condomínio, manutenção, prestadores), não seria correto fingir que cada
  transação foi reclassificada nessas sub-rubricas quando isso não aconteceu.
  Mesmo espírito para a **franquia hídrica contratada por ocupação** (mesma
  linha expandida do contrato) — matriz de referência para quando não há
  hidrômetro individualizado por unidade (ex: "1 pessoa → 5,8 m³/mês →
  R$35,73"); documenta o que foi contratado, não mede consumo real nem
  calcula rateio extraordinário por excedente, porque o sistema não tem
  leitura de hidrômetro nenhuma para basear esse cálculo.
- **Livro razão e balancete**: cada transação é derivada em duas pernas
  (débito/crédito) na hora, sem tabela nova — dá o balancete de verificação por
  conta que um contador usa como ponto de partida para fechar um balanço formal.
- **Exportar/importar backup**: baixa ou restaura o banco inteiro como um arquivo
  `.sqlite`, com hash SHA-256 exibido e copiável a cada exportação — prova de
  integridade de que o arquivo apresentado depois (num laudo, numa petição) é
  exatamente aquele, sem alteração posterior. Um indicador no cabeçalho avisa
  quando existe alteração feita depois do último backup exportado.

## Limitações conhecidas (leia antes de usar com dados reais)

- **Migração de schema** (`src/db/migracoes.ts`): o banco vive persistido no IndexedDB do
  navegador entre sessões, então uma coluna ou tabela nova adicionada ao `schema.sql` não
  aparece automaticamente num banco salvo por uma versão anterior do app. `abrirBanco()`
  e `importarArquivo()` rodam o `schema.sql` atual de novo (idempotente — todo
  `CREATE TABLE`/`INDEX` usa `IF NOT EXISTS`) e depois `garantirColunasAtualizadas()`,
  que compara cada tabela contra `PRAGMA table_info` e roda `ALTER TABLE ADD COLUMN` para
  o que faltar. Verificado importando um backup real gerado com o schema anterior a este
  módulo de Patrimônio — sem essa migração, editar um imóvel, abrir Patrimônio, Dívidas
  de consumo ou salvar uma regra quebrava para qualquer usuário com dados salvos antes da
  mudança.
- **Simulador de Carnê-Leão** (`src/domain/reports/irpfCarneLeao.ts`): é uma simulação
  para organização/estimativa, não uma apuração fiscal oficial. A tabela progressiva
  mensal do IRPF pré-carregada é a vigente desde 05/2024 (Lei nº 14.848/2024) — pode ter
  mudado; confira em gov.br/receitafederal antes de qualquer uso oficial. As categorias
  de despesa dedutível marcadas por padrão (manutenção, taxas de administração) são uma
  seleção conservadora, não uma lista fiscal fechada — condomínio/IPTU fica desmarcado
  por padrão justamente para evitar dupla dedução com o reembolso de rateio já excluído
  da renda tributável. O imposto é calculado sobre a média mensal do período (não mês a
  mês real), o que tende a subestimar levemente períodos com receita muito irregular.
  Confirme sempre com um contador antes de apresentar este número em juízo.
- **XML de nota fiscal** (`src/domain/documentos/parseNFe.ts`): NF-e (modelo 55) segue o
  layout nacional único do SEFAZ, extração confiável por tag. NFS-e (nota de serviço) não
  tem padrão nacional — cada prefeitura define seu próprio XML — a extração tenta os nomes
  de tag mais comuns (variações do padrão ABRASF) e **não finge sucesso**: se o layout do
  seu município não bater com nenhum candidato reconhecido, o documento cai para "Outro"
  com campos vazios em vez de inventar valor/CNPJ. Sempre confira o texto extraído.
- **OCR de imagens** (`src/domain/parsers/ocrImagem.ts`) usa
  [tesseract.js](https://github.com/naptha/tesseract.js) com worker e núcleo WASM
  vendorizados em `public/tesseract/` (não dependem de CDN), mas o **pacote de
  idioma português** (`por.traineddata`) ainda é baixado de uma CDN pública no
  primeiro uso e fica em cache no navegador depois disso. Testado neste ambiente com
  a CDN bloqueada pela política de rede do sandbox: sem o timeout de 30s embutido em
  `ocrImagem()`, a falha do worker interno do tesseract.js travava a tela em
  "Extraindo texto…" para sempre em vez de mostrar erro — corrigido; funciona
  normalmente (sem timeout) num navegador comum com internet.
- **Extração de PDF** (`pdfDocumento.ts`, `linhasTransacao.ts`) funciona por
  heurística de regex sobre o texto extraído — cobre bem extratos e faturas com
  layout "data + descrição + valor" por linha, mas layouts muito diferentes do
  testado podem exigir ajuste da regex `REGEX_LINHA`.
- **CSV**: prefira exportações com `;` como separador (padrão de exportação
  brasileira) quando os valores usam vírgula decimal — um CSV separado por vírgula
  *e* com vírgula decimal é ambíguo e não é detectado corretamente.
- **Nenhuma chamada real de IA**: a categorização é 100% por regra determinística
  (`src/domain/categorize/regrasAprendidas.ts`) + revisão manual. O mesmo vale para a
  extração de campos de documentos (`src/domain/documentos/extrairCampos.ts`): valor/data/
  CNPJ saem de regex sobre o texto extraído, e "produto/serviço a que se refere" é preenchido
  por você — nenhum modelo de linguagem lê o documento.
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
- **Patrimônio e alavancagem**: valor venal, valor de aquisição e matrícula são
  inteiramente informados por você (aba Imóveis) — o sistema nunca estima nem busca
  isso automaticamente. Sem valor venal cadastrado, o imóvel fica de fora da soma
  do patrimônio líquido (avisado explicitamente na tela), nunca com um valor
  aproximado. **O Registrato/SCR do Bacen não tem API pública** — é um portal de
  autoatendimento do cidadão (`registrato.bcb.gov.br`, login gov.br); não há como o
  sistema "puxar" isso automaticamente, ao contrário do que a Open Finance permite
  para extrato bancário. O caminho real é baixar seu próprio relatório
  periodicamente e relançar o saldo devedor em Cadastros → Dívidas de consumo.
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
    patrimonio/             balanço patrimonial: patrimônio líquido, alavancagem por
                           imóvel, liquidez corrente, comprometimento de renda,
                           demonstrativo de endividamento global, VPL de dívida
    laudo/                 geração do PDF do laudo pericial
    seed/                  gerador de dados simulados
  components/            telas React (Dashboard, Imóveis, Cadastros, Importar,
                          Documentos e classificação, Transações, Contratos, Reajustes
                          e rescisão, Caução, Financiamentos, Patrimônio e
                          alavancagem, Índices econômicos, Renda Tributável, Livro
                          Razão, Pendências, Auditoria, Laudo)
    cadastros/             sub-telas de Cadastros (contratos, contas bancárias,
                           prestadores, financiamentos, obras)

contabilidade-reconstituicao/   só o schema.sql — fonte única do modelo de dados (o
                                protótipo Python que existiu aqui foi removido por estar
                                obsoleto: o app web já cobre e supera tudo que ele fazia).

server/                        backend opcional para conectar banco via Pluggy
                                (Open Finance) — só existe pelo Client Secret.
```

O `schema.sql` em `contabilidade-reconstituicao/` é a fonte única do modelo de dados;
o app web importa esse mesmo arquivo (`?raw`) para inicializar o sql.js.
