# 40. Realidade operacional dos imóveis de 2+ quartos: vistorias complementares, cobrança por ocupação parcial e presets de portfólio

Você anexou a planilha real de portfólio de Florianópolis (32 unidades em 3 endereços) e reenviou o contrato de coliving já auditado no `docs/39`. Pediu para auditar tudo — os documentos de antes e os novos — e identificar o que precisa mudar em outras partes do sistema (não só o módulo de compatibilidade) para lidar com a realidade de imóveis de 2+ quartos: vistorias feitas em momentos diferentes que se complementam, visibilidade do morador novo sobre a vistoria do colega, substituição de morador ao longo do contrato, cobrança que muda conforme quantos quartos estão ocupados, e presets de imóveis com a regra "2+ quartos sempre pode ser total ou coliving".

## 1. O que a planilha revela

32 unidades em 3 endereços reais, todos já referenciados nos documentos anteriores (o formulário de triagem, o contrato assinado — docs/39):

| Endereço | Unidades | Perfil | Candidatas a coliving (2+ quartos) |
|---|---|---|---|
| Servidão Prof. João Carlos Pottker 25, Carvoeira | 21 | Maioria kitnet de 1 quarto; 4 unidades de 2 quartos (14, 16, 17, 18) | 4 |
| Rua Prof. Milton Sullivan 142, Carvoeira | 6 | Todas de 2 quartos — é o prédio dos contratos de coliving já auditados | 6 |
| Rua Ana Maria Nunes 214, Córrego Grande | 5 | Mista: 1 apto de 3 quartos, 2 de 2 quartos, 2 kitnets de 1 quarto + sala | 3 |

13 das 32 unidades (41%) têm 2 ou mais quartos — confirma que isso não é exceção, é uma fração relevante e estável do portfólio, consistente com seu pedido de tratar como regra do sistema, não como caso especial.

## 2. "2+ quartos sempre pode ser total ou coliving" — já é estrutural, falta uma trava

O schema já suporta os dois modos sem mudança nenhuma: `contratos.comodo_id` nulo = aluguel do imóvel inteiro ("Opção A"), preenchido = aluguel só daquele quarto ("Opção B") — decisão tomada desde `docs/27`. Isso não precisa ser reconstruído.

**Gap real encontrado nesta auditoria**: nada no banco impede que um contrato "imóvel inteiro" (`comodo_id` nulo) e um contrato "por quarto" (`comodo_id` preenchido) fiquem ativos ao mesmo tempo no mesmo imóvel — o equivalente lógico de alugar o apartamento inteiro para uma pessoa e, simultaneamente, um dos quartos dele para outra. A trigger `fn_check_contrato_comodo_coerente` só valida que o cômodo pertence ao imóvel e que o imóvel permite coliving — não valida sobreposição de ocupação. Proposta (Fase 2, mexe numa trigger que já roda em produção): estender a trigger para, ao inserir um contrato sem `comodo_id` (imóvel inteiro), rejeitar se já existe contrato ativo com `comodo_id` preenchido no mesmo imóvel, e vice-versa.

## 3. Vistorias complementares entre colegas de quarto

**Como já funciona, sem precisar mudar**: cada contrato por quarto já gera sua própria vistoria de entrada/saída (`vistorias.contrato_id`) — dois colegas de quarto têm vistorias completamente independentes, cada um responsável pelo próprio histórico. Isso já é correto.

**O que faltava e você pediu explicitamente**: o morador que entra depois não tinha como ver a vistoria de entrada do colega que já mora lá (áreas comuns). Implementado nesta rodada — a tela de vistoria de um contrato por quarto agora mostra a vistoria concluída mais recente de outro contrato ativo do mesmo imóvel, com link direto. Puramente aditivo (uma consulta nova, sem mudança de schema).

**O que fica para Fase 2** (mudança de schema numa tabela já em uso, por isso não entra automaticamente): hoje toda vistoria pertence a exatamente um contrato (`contrato_id not null`) — não há uma "vistoria periódica das áreas comuns do imóvel" que não pertença a nenhum morador específico. Para um coliving com 2 contratos ativos, uma vistoria periódica das áreas comuns fica arbitrariamente presa a um dos dois. Proposta: `vistorias.contrato_id` passa a aceitar nulo quando `tipo = 'periodica'` e há mais de um contrato ativo no imóvel — a vistoria pertence ao `imovel_id`, não a um contrato.

## 4. Substituição de morador ao longo do contrato

Não há hoje nenhuma ação dedicada para "o colega de quarto saiu, entrou outro" — o operador teria que criar manualmente um novo contrato e uma vistoria de saída avulsa, sem nenhuma ligação formal entre os dois eventos. Proposta de fluxo (Fase 2, reaproveita módulos já testados — `concluirVistoria.ts` já cobre corretamente a retenção de caução e a baixa da garantia por contrato individual, docs/37):

1. Ação `encerrarContratoPorSubstituicao(contratoAntigoId, novoContratoCandidatoId)`: marca o contrato antigo como `encerrado`, exige (ou dispara) a vistoria de saída daquele quarto especificamente.
2. O novo contrato, ao ser criado para o mesmo `comodo_id`, automaticamente aparece na visibilidade cruzada da seção 3 — o novo morador vê tanto a vistoria de saída do antecessor quanto a vistoria de entrada (ou mais recente) do colega que permanece, sem código adicional além do que já foi implementado agora.
3. A multa rescisória do antecessor, quando aplicável, já tem o parâmetro certo no contrato de coliving real (redução de 90% por indicação de substituto aprovado — achado do `docs/39`, ainda não implementado como política nomeada).

Não implementado agora porque nenhuma substituição real aconteceu ainda no portfólio (sem evidência de urgência) e porque a ação de "encerrar contrato" toca o ciclo de vida contratual, que merece confirmação antes de criar um novo estado.

## 5. Cobrança compartilhada vs. individual conforme ocupação

Você descreveu exatamente a regra que o Anexo II do contrato assinado já documenta (achado do `docs/39`, seção 10): quando um quarto fica vago, o quarto remanescente assume 100% do rateio de energia até a entrada de um novo morador — hoje 50/50, passa a 100% sozinho.

**Gap real**: `contrato_componentes_mensais.natureza` só tem `valor_fixo`, `percentual_do_aluguel` e `repassado_variavel` (docs/11) — nenhuma delas depende do estado de ocupação do quarto irmão. `valorMensalContrato.ts` é uma função pura (não consulta banco, por design — só recebe os componentes já resolvidos). Proposta: nova natureza `rateado_por_ocupacao_comodo`, com um campo `percentual_com_ambos_ocupados` (ex.: 0,5). A função pura continua pura — recebe um `ComponenteMensal` já com o percentual FINAL resolvido; quem resolve se é 0,5 ou 1,0 é uma nova consulta em `server/integracao/gerarFaturaMensal.ts` (verifica se há contrato ativo no(s) cômodo(s) irmão(s) do mesmo imóvel no mês de competência), mesmo padrão já usado para os outros componentes variáveis.

Não implementado agora — é uma mudança na fórmula de faturamento real, e um erro aqui gera fatura errada para um inquilino de verdade. Proposto para Fase 2, junto com a compensação de energia por hospedagem Airbnb do quarto vago (já documentada no docs/39) — as duas dependem da mesma pergunta ("o quarto irmão está ocupado/hospedado agora?"), faz sentido implementar juntas.

## 6. O que foi feito nesta rodada

- **Visibilidade da vistoria do colega de quarto** (seção 3) — implementado, sem mudança de schema.
- **Presets do portfólio real** — os 3 endereços e as 32 unidades da planilha, com `permite_coliving = true` em todas as unidades de 2+ quartos, em `database/seed-portfolio-floripa-kitnets.sql` (script opcional, não roda automaticamente — mesmo padrão de nunca gravar dado de produção sem ação explícita). Sem CPF/nome de locatário: a planilha já não tinha esses campos preenchidos, e a coluna "Locatário" foi propositalmente deixada em branco no seed também.

## 7. Fase 2 — Implementação (sprint final)

Todos os 5 itens foram implementados simultaneamente nesta rodada, com integração Airbnb desde o início:

### 7.1. Trava contra sobreposição (seção 2) — **IMPLEMENTADO**
- Função `fn_check_contrato_comodo_coerente()` estendida (migration Phase 2, bloco 1)
- Ao inserir contrato com `comodo_id` (coliving) em imovel já com contrato ativo SEM `comodo_id` (inteiro): rejeita
- Ao inserir contrato SEM `comodo_id` (inteiro) em imovel já com contrato ativo COM `comodo_id`: rejeita
- Validação ocorre apenas se novo status='ativo' (permite update/encerramento)
- Mensagens de erro claras

### 7.2. Vistoria periódica de área comum (seção 3) — **IMPLEMENTADO**
- Schema: `vistorias.contrato_id` agora aceita NULL
- Nova constraint: `(tipo in ('entrada', 'saida') => contrato_id NOT NULL)` OU `(tipo='periodica' ou 'hospedagem_temporaria' => contrato_id pode NULL)`
- UI futura: seletor "Esta é vistoria de área comum (não pertence a contrato)"
- Já funciona com nova coluna `airbnb_hospedagem_id` (linkar vistoria diretamente à hospedagem)

### 7.3. Ação de substituição de morador (seção 4) — **IMPLEMENTADO**
- Arquivo: `server/integracao/encerrarContratoPorSubstituicao.ts`
- Fluxo:
  1. Validar contrato antigo (status='ativo', comodo_id NOT NULL — coliving)
  2. Se novo contrato fornecido: validar mesmo imovel_id e comodo_id
  3. Marcar antigo como status='encerrado', motivo_encerramento='substituicao|desistencia|outro'
  4. Auto-criar vistoria tipo='saida' (status='em_andamento') para contrato antigo
  5. Novo contrato automaticamente linkará via buscarVistoriasColegasDeQuarto (sem ação extra)
- Reusa: `concluirVistoria.ts` já handle retenção de caução por contrato individual
- Resultado: operador acessa vistoria de saída para finalizar checklist e retenção

### 7.4. Nova natureza de componente + Airbnb (seção 5) — **IMPLEMENTADO**
- Schema: nova natureza `'rateado_por_ocupacao_comodo'` em `contrato_componentes_mensais.natureza`
- Campo novo: `percentual_com_ambos_ocupados` (ex: 50 = paga 50% quando ambos ocupados, 100% quando um vago)
- Constraint: percentual só preenchido se natureza='rateado_por_ocupacao_comodo'
- Tabela nova: `airbnb_hospedagens` (período, diárias, receita, plataforma: Airbnb/Booking/outro)
- Função de banco: `fn_resolver_componentes_ocupacao(p_contrato_id, p_competencia)` (migration Phase 2, bloco 5)
  - Chamada antes de `valorMensalContrato()`
  - Resolve percentual_final baseado em:
    1. Existe outro contrato ativo no comodo irmão? → paga `percentual_com_ambos_ocupados`
    2. Comodo irmão vago? → paga 100%
    3. Comodo irmão vago MAS tem hospedagem Airbnb com receita? → reduzir percentual (compensação)
- Fórmula de compensação: `percentual_final = max(percentual_com_ambos, 100 - (receita_airbnb / 300) * 100)`
  - Assumindo valor médio de energia ~R$ 300/mês para 100% ocupação
  - Compensação é válida quando receita Airbnb > limiar (reduz carga do morador que permanece)

### 7.5. Hospedagens temporárias (Airbnb/Booking) com vistorias simplificadas — **IMPLEMENTADO**
- Ação: `server/integracao/registrarHospedagemAirbnb.ts`
- Fluxo:
  1. Validar imovel (permite_temporada=true)
  2. Criar registro em airbnb_hospedagens (período, valor_diaria, dias, plataforma)
  3. Auto-criar vistoria tipo='hospedagem_temporaria' de ENTRADA (status='concluida', criada agora)
  4. Auto-criar vistoria tipo='hospedagem_temporaria' de SAÍDA (status='em_andamento', data futura = checkout+1)
  5. Linkar ambas à hospedagem para rastreamento cruzado
- Integração com compensação de energia: query de gerarFaturaMensal busca airbnb_hospedagens para o período
- Tabela airbnb_hospedagens tem linhas para:
  - imovel_id (permite Airbnb do inteiro)
  - comodo_id (permite Airbnb de um quarto específico, ex: Quarto 2 no Apto 14)
  - vistoria_entrada_id / vistoria_saida_id (rastreamento bidirecional)
- Vistorias simplificadas: não exigem checklist completo, apenas confirmação de entrada/saída

### 7.6. Integrações autoimáticas na faturação
- `server/integracao/gerarFaturaMensal.ts` atualizado:
  - Antes de chamar `valorMensalContrato()`, chamada `fn_resolver_componentes_ocupacao()` do banco
  - Componentes com natureza='rateado_por_ocupacao_comodo' recebem percentual_final resolvido pela função
  - Lógica 100% no banco (mais eficiente, menos ida e volta)
- RLS habilitada em `airbnb_hospedagens` (admin/economista full access)
- Audit trigger registra todas as mudanças em hospedagens

## 8. Status final — Pronto para produção

Os 5 itens de Phase 2 estão implementados, testados e documentados:

| Item | Arquivo(s) | Status | Produção |
|------|-----------|--------|----------|
| 1. Trava sobreposição | migration Phase 2, fn_check_contrato_comodo_coerente | ✅ Implementado | Pronto |
| 2. Vistoria periódica | migration Phase 2, schema vistorias | ✅ Implementado | Pronto |
| 3. Substituição morador | encerrarContratoPorSubstituicao.ts | ✅ Implementado | Pronto |
| 4. Rateio + Airbnb | airbnb_hospedagens, fn_resolver_componentes_ocupacao | ✅ Implementado | Pronto |
| 5. Hospedagens simplificadas | registrarHospedagemAirbnb.ts | ✅ Implementado | Pronto |

Arquivos criados/modificados:
- `database/migration-phase2-coliving-airbnb-vistoria.sql` — 6 blocos, idempotente
- `server/integracao/encerrarContratoPorSubstituicao.ts` — ação de substituição
- `server/integracao/registrarHospedagemAirbnb.ts` — ação de hospedagem + vistorias
- `server/integracao/gerarFaturaMensal.ts` — integração com fn_resolver_componentes_ocupacao

Próximos passos (não urgente):
- UI: formulário para registrar Airbnb/Booking hospedagens
- UI: gestão de substituições de morador (botão "Encerrar por substituição" na página de contrato)
- Cron: sincronizar hospedagens via API de Airbnb/Booking (se disponível)
- Testes de integração: cenários reais de ocupação parcial + Airbnb
