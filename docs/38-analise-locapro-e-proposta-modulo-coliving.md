# 38. Análise do material "LocaPro" (benchmark + PRD) e proposta do módulo de Coliving

Você colou um material extenso: uma pesquisa de mercado (DoorLoop, AppFolio, Buildium, Innago, Rent Manager, TurboTenant) seguida de uma proposta chamada "LocaPro" e depois um PRD v2.0 completo — visão, personas, módulo de Coliving detalhado (com o algoritmo ColiMatch™), LocaScore™ (score de crédito próprio com ML), arquitetura de microsserviços (Kafka, Kubernetes, MongoDB), modelo de preços em camadas e roadmap de 34 semanas. Pediu para eu analisar o que é aplicável ao nosso sistema, com destaque explícito para o módulo de coliving (formulário + análise cruzada de candidatos).

O material tem a marca registrada de um LLM generalista respondendo "monte um app de gestão de locação" sem contexto do seu negócio real — é escrito como se estivéssemos construindo um SaaS multi-tenant para vender a milhares de imobiliárias, não o back-office interno de uma administradora com portfólio próprio em Curitiba e Florianópolis (que é o que este sistema é, desde `docs/01-auditoria-critica.md`). Por isso boa parte não se aplica — não porque seja tecnicamente errado, mas porque resolve um problema que você não tem.

## O que já está coberto (sem lacuna)

A tabela de "Requisitos e Funções Essenciais" do benchmark e a maior parte da "Arquitetura de Funcionalidades" do LocaPro já existem, construídos com evidência real (contrato assinado, portfólio real) em vez de genérico:

| Módulo do LocaPro | Onde já existe aqui |
|---|---|
| Cadastro de imóveis/unidades/documentos | `app/imoveis`, `app/imoveis/[id]` (docs 33-34) |
| Contratos, modelos, assinatura, renovação | `server/legaldesign/`, `app/modelos-contrato`, motor de renovação (docs 27, 60) |
| Cobrança automática, PIX/boleto | `server/asaas/`, `server/integracao/emitirCobranca.ts` (docs 17) |
| Multas por atraso, régua de cobrança | `server/financeiro/jurosMulta.ts`, `regua_cobranca_eventos` |
| Manutenção / ordens de serviço | módulo completo com SLA, andamentos, prestadores (docs 13-14, 22) |
| Portal do proprietário / repasse | `app/extratos`, `investidor_ledger`, split de pagamento (docs 18, 25) |
| Relatórios financeiros / DRE | `server/relatorios/`, `app/relatorios` (doc 15) |
| Compliance / documentos / vistorias | Fases 1-7 (upload real, extração por IA, vistorias) — docs 56-62, 37 |
| Triagem de inquilino (score básico) | `leads.score_credito` já existe no schema, mas sem motor de cálculo — ver abaixo |

## O que não é aplicável — e por quê

- **Preços em camadas (Starter/Pro/Business/Enterprise), freemium, "5.000 usuários ativos/mês", "15.000 imóveis geridos"**: pressupõe vender o sistema como produto para terceiros. Este sistema tem um único locatário de fato (a CRMT), com um portfólio de dezenas de imóveis, não milhares de contas de clientes. Não há o que precificar.
- **Arquitetura de microsserviços (Kafka como Event Bus, Kubernetes/ECS, MongoDB, Elasticsearch)**: resolve problema de escala que não existe aqui — `docs/03-arquitetura-e-stack.md` já fechou essa decisão (Next.js + Postgres único, sem fila de eventos) com a mesma lógica: infraestrutura deve ser proporcional ao volume real, não ao volume de um SaaS hipotético com milhares de clientes.
- **LocaScore™ (score de crédito 0-1000 com Machine Learning, XGBoost, Open Banking)**: exigiria treinar um modelo com uma base histórica de inadimplência que não existe ainda (poucas dezenas de contratos). Treinar ML numa base desse tamanho não produz um score confiável — produziria a aparência de rigor sobre um cálculo arbitrário. Mesmo veto já aplicado a "credit scoring via LLM" em `docs/07-selecao-de-ia-e-custos.md`. Quando houver volume de dados suficiente, um score determinístico simples (renda/aluguel, tempo de emprego, referências) é o próximo passo realista — não ML.
- **Portal público de auto-atendimento do candidato (browsing de imóveis, aplicação online, chatbot, entrevista em vídeo gravada e transcrita por IA, grupo de WhatsApp automático, sensor IoT de uso de área comum)**: este sistema não tem front público de captação (os `leads`/`anuncios` já cobrem o funil de marketing, sem precisar de portal de aplicação self-service) e gravar/transcrever entrevista de candidato por IA é um risco de LGPD desproporcional ao problema (consentimento explícito, retenção, finalidade) sem ganho claro sobre uma ficha de entrevista preenchida pelo gestor.
- **API pública `/api/v1/...`**: não há consumidor externo do sistema hoje — não é código morto por acidente, é escopo que não existe ainda.

## O que É aplicável, com evidência de necessidade real

O pedido explícito foi: **critérios de seleção e compatibilidade para apartamentos incluídos em coliving, com formulário e análise cruzada de candidatos.** Isso preenche uma lacuna real e concreta: `comodos` já existe desde `docs/27-motor-de-contratos.md` (quarto individual, área, valor de referência) e `imoveis.permite_coliving` também, mas **não existe absolutamente nenhum dado de perfil, regra da casa, ou score de compatibilidade** — hoje um contrato de coliving é decidido sem nenhum critério sistematizado.

Diferente do resto do PRD, não vou adotar o ColiMatch™ como descrito (ML com Open Banking, matching automático, decisão automática por faixa de score liberando aprovação sem revisão humana) — mas o núcleo do pedido é legítimo e pode ser implementado do mesmo jeito que todo o resto deste sistema: **cálculo determinístico e auditável, sempre como insumo para decisão humana, nunca aprovação automática** (mesmo princípio de `multaRescisoria.ts`/`calcularReajuste.ts`/quebra de contrato: o sistema calcula, a gestão decide).

### Proposta de escopo (pronta para implementar, pendente sua confirmação)

**Schema — 2 tabelas novas, seguindo o padrão de `comodos`/`leads` já existentes:**

- `regras_convivencia_imovel` (1:1 com `imoveis`, só relevante quando `permite_coliving`): horário de silêncio, política de visitas/pets/fumo/festas, uso da cozinha — os mesmos eixos configuráveis do PRD, sem o vocabulário de marca.
- `perfis_convivencia` (1:1 com `pessoas`, preenchido tanto por morador atual quanto por candidato): as mesmas dimensões do formulário do PRD (rotina, perfil social, hábitos, objetivos, preferências de colegas) — como respostas categóricas simples (enum), não vetores de ML.

Nenhuma tabela de "cache de compatibilidade" — o cálculo é barato o suficiente (poucos moradores por imóvel) para ser sob demanda, sem precisar de cache/expiração.

**Cálculo — função pura, testável, sem ML:** `server/coliving/calcularCompatibilidade.ts`. Mesma fórmula estrutural do PRD (similaridade de rotina/social/hábitos/objetivos, com peso maior para incompatibilidades críticas como fumante × não-fumante), mas como comparação de categorias discretas (tabela de compatibilidade par-a-par), não distância euclidiana de vetores — mais simples, mais explicável para o gestor, e testável com casos concretos em vez de "confiar no score". Saída: um score 0-100 **e a lista dos pontos de atrito/afinidade que geraram esse score** (nunca só o número) — é isso que faz o gestor confiar na "análise cruzada", não a nota isolada.

**Fluxo (decisão sempre humana):**
1. Cadastro do perfil de convivência de cada morador atual do imóvel (formulário simples, mesmo padrão dos formulários existentes).
2. Candidato a um quarto de coliving preenche o mesmo formulário (via `leads` existente, com `imovel_interesse_id` apontando para o imóvel/`comodo_id`).
3. Tela de **análise cruzada**: para um candidato, mostra o score de compatibilidade com cada morador atual, individualmente e a média do grupo, junto com os pontos de atrito específicos (ex.: "candidato fuma, morador do quarto 2 não tolera") — nunca uma aprovação/reprovação automática, sempre um insumo para o gestor decidir, com a decisão registrada (aprovado/reprovado/entrevista, com parecer) no mesmo padrão de `app/quebras-contrato`.

**O que fica de fora deliberadamente, mesmo dentro do escopo do pedido:** score mínimo de crédito diferenciado para coliving (depende do LocaScore™, que não existe), decisão automática por faixa de score, entrevista em vídeo gravada/transcrita, e monitoramento de convivência pós-mudança (reclamações, sentimento de chat) — nenhum desses tem urgência declarada por você e cada um é um módulo à parte, não uma extensão trivial do formulário+matching pedido.

## Próximo passo

Este documento é a análise pedida. A implementação do módulo de Coliving (schema + função de compatibilidade + formulário + tela de análise cruzada, com testes) fica pronta para começar assim que você confirmar o escopo acima — é a única peça deste material inteiro com pedido explícito e lacuna real comprovada; o resto (LocaScore™, microsserviços, portal público, preços em camada) fica descartado pelos motivos acima, não por falta de tempo.
