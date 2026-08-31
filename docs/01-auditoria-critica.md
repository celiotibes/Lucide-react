# Auditoria Crítica do Escopo (Rodada Gemini) — CRMT Gestão Imobiliária

> Objetivo deste documento: não repetir a proposta anterior, e sim **auditá-la com rigor**, apontar onde ela erra ou é inviável, e justificar as decisões diferentes tomadas na arquitetura final (docs 03, 04 e 05, e `database/schema.sql`).

O material analisado (8 rodadas de conversa com um assistente Gemini) tem diagnósticos corretos em vários pontos pontuais (regra de pró-rata, régua de juros/multa, depreciação linear, split de pagamento). O problema não está nos detalhes — está no **padrão sistêmico da conversa**: a cada mensagem o escopo cresce (CRM → ERP → PMS → plataforma de Asset Management/Holding), sem que uma única linha de schema, código ou custo real tenha sido produzida em 8 rodadas. Isso é o sintoma clássico de **scope creep por validação mútua**: o assistente propõe, você aprova, ele escala mais. Ninguém perguntou "o que precisa estar rodando em 30 dias".

Abaixo, os problemas estruturais identificados, em ordem de impacto.

## 1. Escopo institucional para operação de porte pequeno/médio

O portfólio real é ~35-40 unidades (21+6+5 em Florianópolis, 6 em Curitiba), operado por você, uma economista, dois prestadores (Paulo e Cristiano) e prestadores eventuais. A proposta final desenha: cap table dinâmico com diluição societária automatizada, motor de waterfall com 3 fundos, teste de impairment anual, curva de deságio para provisões judiciais, Open Finance multi-banco, e 14 módulos.

Isso é arquitetura de **AppFolio/Yardi/Superlógica** (milhares de unidades, equipes de TI dedicadas). Para o seu porte, isso não é "mais robusto" — é **inviável de manter**. Cada módulo automatizado é superfície de bug, e não há ninguém descrito na operação cujo trabalho seja "manter este sistema". Um sistema que ninguém consegue debugar às 2h quando um boleto falha é pior do que nenhum sistema.

**Decisão:** faseamento agressivo (doc 04). MVP cobre contratos + faturamento + cobrança + portal do inquilino. Cap table/SCP formal, impairment test, curva de deságio ficam para quando (e se) o volume de investidores justificar — e mesmo assim, com acompanhamento contábil/jurídico humano, não como botão automático.

## 2. Contradição de stack: Streamlit não serve o que o próprio escopo exige

A proposta mantém Streamlit como frontend do início ao fim, mas depois pede: portal do inquilino com notificações *push*, PWA de vistoria com câmera nativa e GPS, assinatura biométrica na tela, *landing page* pública indexável no Google (e por isso propõe Webflow **separado**, rodando "desacoplado" — ou seja, admite que Streamlit não serve para isso).

Streamlit é uma ferramenta de painel interno de dados (reroda o script inteiro a cada interação, modelo de sessão fraco, sem suporte real a múltiplos papéis de usuário autenticado com UX distinta, sem PWA, sem SEO). Ele é adequado para *dashboards internos de analytics*. Não é adequado para ser a cara de um produto com 4 tipos de usuário externo (inquilino, investidor, prestador, admin) e fluxos de assinatura/câmera/notificação.

**Decisão:** um único framework full-stack (Next.js) serve back-office, portal do inquilino, portal do investidor, magic links de prestador, PWA de vistoria e landing page pública com SEO — sem gambiarra de dois sistemas desacoplados. Ver doc 03.

## 3. "Tier gratuito" é enganoso — custo real precisa estar na mesa

A proposta empilha, ao longo das rodadas: Supabase, Streamlit Cloud, n8n, Asaas, Gemini Vision, Pluggy/Belvo (Open Finance), WhatsApp Business API, ZapSign/Clicksign — sempre com o adjetivo "gratuito". Na prática:

- **n8n gratuito é self-hosted** — exige um servidor (VPS), não é zero-operação nem zero-custo (~R$20-50/mês, mais o tempo de manter atualizado).
- **Pluggy/Belvo (Open Finance)** cobram por conta bancária conectada acima de faixas gratuitas mínimas — com 6 instituições financeiras isso tem custo mensal recorrente real.
- **WhatsApp Business API oficial** cobra por conversa iniciada acima da faixa gratuita; a alternativa "gratuita" citada (Evolution API, não oficial) roda em número não homologado e tem **risco real de banimento do número da empresa** — inaceitável para cobrança e comunicação com inquilinos.
- **Assinatura eletrônica** (Clicksign/ZapSign) cobra por documento acima do plano free.
- **Gemini Vision API** tem tier gratuito com limite de requisições/dia — em produção com múltiplos imóveis e prestadores fotografando medidores, isso estoura.

**Decisão:** doc 05 traz uma estimativa de custo mensal realista por fase, e a arquitetura evita dependências pagas na Fase 0 (ex.: OFX manual antes de Open Finance; WhatsApp via provedor oficial orçado, não gambiarra).

## 4. Locação por contrato (Lei do Inquilinato) e temporada (Airbnb) foram tratadas como a mesma coisa — não são

A proposta aplica a régua de inadimplência (D+5/D+15/D+30, juros, multa, honorários) a "Módulo 1" genericamente, misturando os dois regimes. Isso é um erro de modelagem, porque a natureza jurídica e o risco operacional são diferentes:

- **Locação por contrato** (Lei 8.245/91, locação residencial/comercial "padrão"): risco é **inadimplência**; a régua de cobrança, garantias (caução/fiador/seguro-fiança) e ação de despejo fazem sentido aqui.
- **Temporada/curta duração** (Lei 8.245/91, Art. 48-50, natureza de hospedagem): normalmente **pré-paga pela plataforma** (Airbnb repassa já descontada a comissão) — quase não há inadimplência do hóspede. O risco real aqui é **outro**: overbooking/duplo booking entre canais, chargeback, dano à propriedade sem caução formal, giro de limpeza entre check-out e check-in, sazonalidade de preço.

A proposta **não tem nenhum mecanismo de calendário/channel manager** para evitar overbooking entre Airbnb, Booking e reservas diretas — que é a falha operacional nº 1 em operação de temporada com múltiplos canais. Isso é uma lacuna grave, não um detalhe.

**Decisão:** `contratos.tipo` distingue `locacao_padrao` de `temporada` com motores de regra distintos; Fase 2/3 inclui sincronização de calendário (ver docs 02 e 04).

## 5. Engenharia societária (cap table/SCP) proposta sem lastro jurídico correspondente

A situação real descrita é: dois imóveis de terceiros (Residencial Ana Maria Nunes, Apto 509B) administrados mediante contrato de administração com repasse e taxa. A proposta final trata isso como **emissão de cotas societárias com diluição automática recalculada por algoritmo** — ou seja, o sistema decidiria sozinho a variação de participação societária de terceiros sobre patrimônio real.

Isso é uma decisão que **não pode ser automatizada por software sem documento jurídico correspondente assinado a cada evento**: reclassificar reinvestimento de lucro como aumento de cota societária, sem contrato de SCP formalmente registrado e sem novo instrumento a cada diluição, cria exposição jurídica (a Receita Federal pode entender que há sociedade de fato constituída, mudando o regime tributário aplicável) e frágil defensabilidade em disputa entre sócios/investidores.

**Decisão:** o sistema implementa uma **conta corrente do investidor** (ledger simples, auditável, com saldo de "lucro retido para reinvestimento") — não um cap table que altera percentual de propriedade sozinho. Qualquer mudança de percentual de participação exige um evento manual, documentado, com aprovação e assinatura — o software registra e não decide.

## 6. Fundo de Provisão para Contingências, do jeito descrito, contraria a própria norma que cita

A proposta cita CPC 25 para justificar o fundo de contingência (processo contra a Companhia de Água e Esgoto), mas CPC 25 é claro: **só se provisiona perda "provável"**; perda "possível" apenas se divulga em nota explicativa, e perda "remota" nem isso. "Bloquear um percentual da receita geral" de forma genérica, sem uma avaliação jurídica formal da probabilidade de perda daquele processo específico, é o oposto do que a norma manda — cria caixa artificialmente travado sem base técnica, ou pior, dá falsa sensação de proteção quando o processo é "remoto" e não precisaria reter nada.

**Decisão:** a tabela `processos_judiciais` tem campo obrigatório `probabilidade_perda` (`provavel`/`possivel`/`remota`, conforme avaliação do advogado) e só gera lançamento de provisão quando `provavel`. Ver `database/schema.sql`.

## 7. OCR tratado como fonte de verdade, sem etapa de confirmação humana

A régua de fallback (média dos últimos 3 meses quando falha) é boa, mas em nenhum momento da proposta a leitura OCR bem-sucedida é **confirmada por um humano antes de virar cobrança**. Erro de OCR em medidor de energia vira fatura errada, que vira disputa em Juizado Especial. Isso não é um detalhe de UX — é risco de passivo.

**Decisão:** toda leitura OCR entra em `leituras_energia` com status `pendente_confirmacao`; só vira base de fatura após confirmação humana (`confirmado_por`). Ver schema.

## 8. Reconstituição contábil retroativa tratada como problema puramente técnico

Classificar automaticamente extratos bancários pessoais (Caixa/Santander) via regex/IA em "receita PJ" vs "renda pessoal isolada" é um bom ponto de partida, mas **decidir isso sozinho tem risco fiscal direto** (omissão de receita, ou o oposto, mistura patrimonial documentada incorretamente). A proposta já previa uma área de revisão em lote — correto — mas não deixava explícito que **nenhuma classificação deve virar DRE oficial sem aprovação de contador**.

**Decisão:** toda importação de OFX histórico cai em `transacoes_bancarias` com `status = 'sugerido'`; passa para `status = 'aprovado'` apenas por ação humana explícita antes de qualquer relatório oficial (DIRPF/DRE) considerá-la.

## 9. Nunca foi feita a pergunta "comprar ou construir"

Existem produtos brasileiros maduros para a parte "commodity" de gestão de locação (contratos, boletos, régua de cobrança, portal do inquilino): Superlógica Imobiliária, ImobZi, Union Locação, entre outros. Para temporada, existem PMS/channel managers prontos (Stays, Guesty). Nenhuma rodada da conversa perguntou se vale a pena comprar essas partes prontas e construir apenas o que é **genuinamente específico do seu negócio**: ledger multi-investidor com taxa diferenciada por imóvel, folha de pagamento dos dois prestadores fixos com regras específicas (km, adicional noturno/feriado, déficit de retenção), e o motor de energia com OCR.

Isso não é uma recomendação de abandonar o build — você pediu para desenvolver, e a decisão de construir é legítima (dá controle total, sem lock-in, sem mensalidade por unidade). Mas a pergunta deveria ter sido feita e registrada. **Fica registrada aqui**: build completo foi a rota escolhida; o preço dessa escolha é tempo de desenvolvimento e manutenção contínua — mitigado pelo faseamento do doc 04.

## Resumo dos vieses corrigidos

| Viés da proposta anterior | Correção aplicada |
|---|---|
| Escopo cresce a cada mensagem, nunca entrega | Faseamento com MVP entregável em semanas |
| Streamlit para tudo | Next.js único, cobre back-office + portais + PWA + landing |
| "Tudo é gratuito" | Estimativa de custo real por fase (doc 05) |
| Locação e temporada tratadas igual | Motores de regra separados por `contratos.tipo` |
| Cap table automático dilui sócios sozinho | Ledger auditável; mudança de % é evento manual documentado |
| Fundo de contingência sem base técnica | Provisão só quando probabilidade jurídica = "provável" (CPC 25) |
| OCR como fonte de verdade | Confirmação humana obrigatória antes de faturar |
| Reclassificação retroativa automática vira DRE oficial | Staging com aprovação humana obrigatória |
| Nunca perguntou comprar vs construir | Pergunta registrada e decisão explícita (build, faseado) |
