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

## 7. Fica para Fase 2 (confirmação antes de implementar)

Trava contra sobreposição imóvel-inteiro/por-quarto (seção 2), vistoria periódica de área comum sem contrato único (seção 3), ação de substituição de morador (seção 4), e a nova natureza de componente mensal por ocupação parcial + compensação de energia por hospedagem Airbnb do quarto vago (seção 5, já citada no docs/39). As quatro mexem em constraints/fórmulas já usadas por dados reais — cada uma merece sua própria rodada de implementação e teste, não um pacote só.
