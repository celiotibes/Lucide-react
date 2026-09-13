# Portal do Inquilino: Central de Chamados (Helpdesk Integrado)

Pedido do cliente, com uma referência de mercado explícita (ImobiBrasil, Pilota Imóveis): abertura de chamado self-service categorizada por natureza, protocolo automático, SLA por prazo, notificação a cada mudança de status, pesquisa de satisfação ao concluir, e conversão do chamado em ordem de serviço para um prestador parceiro. Este documento cobre o que já existia (auditado antes de construir, mesma metodologia de sempre), o que foi adicionado, e o que segue bloqueado — e por quê.

## Decisão central: um chamado É uma ordem de serviço, não duas entidades

`ordens_servico` (Módulo 6, existente desde as primeiras fases) já modelava "chamado aberto pelo inquilino" (`aberto_por_pessoa_id`) e "ordem de serviço de um prestador" (`prestador_id`) na MESMA linha. O pedido do cliente pede explicitamente essa conversão como recurso ("o próprio sistema permite transformar o ticket em uma O.S.") — e ela já é automática aqui: abrir o chamado grava a linha; atribuir um `prestador_id` a essa mesma linha É a conversão. Criar uma tabela `chamados` separada de `ordens_servico` exigiria sincronizar status em dois lugares para o mesmo conceito — decidi não fazer isso, mantendo a decisão original do schema.

## O que já existia e não mudou

- Categorização livre (`categoria`, texto) e severidade (`urgencia`: baixa/media/alta/urgente).
- `avaliacao_estrelas` (1-5) — já era a resposta da pesquisa de satisfação, só faltava o disparo.
- `ordem_servico_andamentos` (docs/14, turno anterior) — log passo a passo com fotos, que agora também alimenta a notificação de status.
- `notificacoes_log` (Módulo 14, desde o início) — estrutura pronta para o log de notificações, mas **nenhum código gravava nela** até agora.
- RLS já deixava o inquilino **ver** a própria OS, mas não **abrir** uma.

## O que foi adicionado

### 1. Protocolo automático (`ordens_servico.protocolo`)

Trigger `fn_gerar_protocolo_os` gera `CH-2026-000123` no insert, se não informado — sequência global (não reinicia por ano; o ano no texto é só rótulo). UUID não é algo que se fala ao telefone.

### 2. Natureza da demanda: eixo diferente de urgência

As quatro categorias exatas do pedido — `emergencia`, `financeiro`, `contratual`, `manutencao` — viram uma coluna própria (`ordens_servico.natureza`), nullable na tabela (OS geradas internamente, como o cronograma preventivo, não precisam dela) mas **obrigatória no fluxo do inquilino** (`server/integracao/abrirChamado.ts` exige o parâmetro). É esse campo que decide o prazo de SLA — `urgencia` continua existindo, mas é severidade subjetiva declarada por quem abre, um eixo diferente.

### 3. SLA por natureza (`sla_politicas` + `server/atendimento/prazoSla.ts`)

Seed inicial, ajustável sem deploy:

| Natureza | Prazo | Horas úteis? |
|---|---|---|
| Emergência | 2h | Não — relógio de parede |
| Financeiro | 24h | Sim |
| Contratual | 24h | Sim |
| Manutenção | 48h | Sim (não especificado no pedido; valor explícito na tabela, não suposição escondida em código) |

A distinção horas-corridas vs. horas-úteis vem do próprio texto do pedido: "24 horas **úteis** para dúvidas... 2 horas para emergências" — note que só "dúvidas" ganha o qualificador "úteis". Um vazamento grave às 22h de sexta não pode esperar o expediente reabrir na segunda; uma dúvida sobre boleto pode.

`server/atendimento/prazoSla.ts` (função pura, 9 testes) calcula o prazo: horas corridas somam direto; horas úteis consideram expediente seg-sex 9h-18h, avançando para o próximo início de expediente quando a abertura cai fora dele (fim de semana, antes das 9h, depois das 18h) antes de começar a contar.

"Muda de cor na tela quando vence" (pedido do cliente) não é um campo gravado — seria um booleano desatualizado no instante exato em que o relógio passasse do prazo sem um job recalculando. É uma expressão de leitura (`sla_prazo_em < now() and status not in ('concluido','cancelado')`), calculada na consulta que alimenta a tela (`app/ordens-servico`, coluna "Prazo SLA" com destaque vermelho quando vencido — mesma classe visual já usada para fatura atrasada).

### 4. Anexos no ato de abertura (`ordens_servico.anexos_urls`)

Mesmo padrão de `ordem_servico_andamentos.fotos_urls` (docs/14), mas para o que o inquilino já anexa ao abrir o chamado — fotos/vídeos do problema, pedido explícito do cliente.

### 5. `server/integracao/abrirChamado.ts` (novo)

Resolve o contrato ativo do inquilino para o imóvel (vínculo direto do chamado com o contrato vigente na abertura — um imóvel pode ter tido mais de um contrato ao longo do tempo), calcula o prazo de SLA e grava a OS. 7 testes de integração, incluindo a reprodução exata dos dois prazos do pedido (emergência ~2h, financeiro >24h corridas quando cruza expediente) e o caso de inquilino sem contrato ativo vinculado (abre mesmo assim, com `contratoId: null`, em vez de travar o self-service por um problema de cadastro).

### 6. Notificação a cada mudança de status + disparo da pesquisa

`server/integracao/andamentosOS.ts` (docs/14) agora grava uma linha em `notificacoes_log` a cada transição de status, endereçada a quem abriu o chamado. Ao concluir, além dessa notificação, marca `pesquisa_enviada_em` e loga o disparo da pesquisa de satisfação — sem isso não dava para saber se a pesquisa já tinha sido mandada (evita mandar duas vezes) nem medir taxa de resposta.

**Honestidade sobre o que "notificar" significa aqui**: `notificacoes_log.status` ganhou o valor `pendente_envio` (schema, seção 23.7) — os três valores antigos (`enviado`/`falhou`/`lido`) implicavam que um provedor real confirmou alguma coisa. Sem chave de API de um provedor de e-mail/SMS/WhatsApp (mesma classe de bloqueio de `docs/09-credenciais-necessarias.md`), gravar `'enviado'` seria afirmar uma entrega que não aconteceu. O que existe hoje é o **conteúdo da notificação gerado e logado, ligado ao chamado** (`ordem_servico_id`, coluna nova) — o disparo real por um canal de verdade é o próximo passo, quando houver credencial.

### 7. RLS: inquilino pode abrir o próprio chamado

`inquilino_abre_propria_os` (INSERT) — antes só existia SELECT. Sem isso, o pilar "self-service 24/7" não existe no nível de dado, mesmo com a tela pronta.

## O que segue bloqueado — e por quê (mesma resposta de docs/14, ainda válida)

**Login do inquilino (CPF/CNPJ + senha) e o painel self-service em si**: nenhuma tela do sistema tem autenticação de verdade ainda — não é uma lacuna nova deste módulo, é o mesmo bloqueio de `docs/09-credenciais-necessarias.md` (projeto Supabase). O back-end desta funcionalidade está pronto e testado (`abrirChamado.ts`, RLS de INSERT, SLA, protocolo) — quando o Supabase existir, a tela é um formulário fino chamando uma função já correta, não lógica nova.

**Notificação real por e-mail/SMS/WhatsApp**: `notificacoes_log` está sendo alimentada corretamente, mas o envio de verdade depende de uma conta de provedor (Resend, Twilio, WhatsApp Business API — não decidido ainda, fora do escopo desta rodada por falta de credencial e de decisão de qual provedor usar).

**Roteamento para "fila" de departamento**: não construí uma tabela de filas/departamentos. `natureza` já é o sinal de roteamento — chamados de manutenção/emergência ganham `prestador_id` (a mesma OS vira o trabalho do prestador); financeiro/contratual não têm prestador, são vistos direto pela equipe administrativa na tela de back-office (`app/ordens-servico`, já filtrável por natureza e SLA vencido). Uma tabela de fila/atribuição por pessoa da equipe seria razoável se a equipe administrativa crescer além de quem já usa o back-office direto — não construí isso sem evidência de que é necessário (mesma cautela já registrada em `docs/11` para não inventar `regime_pagamento`).

## Verificação

Schema aplicado do zero em Postgres real 3 vezes seguidas sem erro. 172 testes no total (105 unitários + 67 de integração — 25 novos: 9 de `prazoSla.ts`, 7 de `abrirChamado.ts`, 4 novos em `andamentosOS.integration.test.ts` para notificação/pesquisa, mais os 5 já existentes desse arquivo recontados). Build/lint/typecheck limpos. Página `/ordens-servico` verificada rodando contra um Postgres real com dado de fumaça (`smoke test`): protocolo gerado pelo trigger, natureza traduzida para português, e destaque visual vermelho no chamado com SLA vencido — confirmados via `curl` contra um `next start` real, não só nos testes automatizados.
