# Ordens de Serviço: Cronograma, Andamento Passo a Passo e Login de Prestador

Pedido do cliente: ordens de serviço não só para o zelador e serviços gerais, mas para qualquer prestador extra (eletricista, encanador, técnico de interfone, técnico de internet, montador de móveis etc.), com (1) cronograma/agendamento — não só chamado avulso reativo —, (2) relatório passo a passo do que aconteceu durante o serviço, e (3) login restrito a cada prestador, só vendo as próprias ordens. Diferente da maioria dos outros documentos, isto não vem de um contrato assinado — é especificação direta do cliente.

## O que já existia (de fases anteriores) e não mudou

`ordens_servico` já cobria boa parte disso: `categoria` sempre foi texto livre (não precisa mudar para caber "eletricista"/"encanador"/"técnico de internet" — não existe uma lista fechada de especialidades no código, de propósito), `status` (aberto → alocado → em_execucao → concluido/cancelado), check-in/check-out com geolocalização, avaliação por estrelas, custos com nota fiscal (`ordem_servico_custos`), e um mecanismo de "fricção zero" para prestador eventual sem exigir login (`magic_links`, link tokenizado válido por tempo limitado). RLS já restringia cada prestador à própria OS via `usuarios.papel = 'prestador'` — isso é o que o pedido de "login estrito a eles" já pedia no nível de dado; o que faltava era o resto (cronograma, passo a passo) e, à parte, a UI de login em si (ver seção final).

## O que foi adicionado

### 1. Ordem de serviço pode ser da unidade ou do prédio inteiro

`ordens_servico.imovel_id` deixou de ser obrigatório; ganhou um `residencial_id` opcional, com constraint garantindo exatamente um dos dois preenchido. Necessário para o cronograma de manutenção preventiva de área comum (limpeza de caixa d'água, revisão elétrica do prédio) em residenciais de Florianópolis sem condomínio formal — em Curitiba isso já é resolvido pelo condomínio (`docs/11`), então só Florianópolis realmente precisa que o CRMT gerencie manutenção de área comum diretamente.

### 2. Cronograma: `planos_manutencao_preventiva` + `server/integracao/gerarOrdensServicoPreventivas.ts`

Um plano é recorrente: categoria, periodicidade em dias, próxima execução, prestador padrão (opcional), ativo/inativo, e um alvo (`imovel_id` OU `residencial_id`, mesma regra do item 1). O gerador roda periodicamente (mesmo padrão de `gerarFaturaMensal.ts`, docs/12/13): para cada plano vencido, cria a OS da ocorrência (com `data_agendada` e `plano_manutencao_id` apontando de volta) e avança a próxima data.

**Decisão deliberada sobre atraso acumulado**: se o job ficar sem rodar por um tempo, cada execução gera só UMA OS (a ocorrência mais atrasada), não um backlog inteiro de uma vez — evita inundar o zelador/prestador com várias ordens do mesmo tipo no mesmo dia. O atraso é recuperado gradualmente, uma ocorrência por execução do job.

`ordens_servico.data_agendada` também serve isoladamente, sem um plano por trás — um chamado avulso pode ser agendado para uma data futura (`status = 'alocado'` com `data_agendada` preenchida) em vez de exigir execução imediata.

### 3. Relatório passo a passo: `ordem_servico_andamentos` + `server/integracao/andamentosOS.ts`

Log **append-only** de etapas durante a execução — soma-se a, não substitui, `checkin_at`/`checkout_at`/`status` (que continuam sendo o estado atual, já consumidos pela RLS existente). Tipos de andamento: `atribuida`, `a_caminho`, `iniciada`, `pausada`, `material_pendente`, `retomada`, `concluida`, `cancelada`, `comentario` — cada um pode ter descrição e fotos (`fotos_urls`, array). `pausada`/`material_pendente`/`retomada`/`comentario` são granularidade dentro de "em_execucao": não criei um status novo em `ordens_servico.status` para isso, porque o log já registra o detalhe e inflar o enum de status seria duplicar a mesma informação em dois lugares.

A transição do status grosso da OS (aberto → alocado → em_execucao → concluido/cancelado) é decidida em `server/integracao/andamentosOS.ts`, não num trigger de banco — mesma decisão de arquitetura já tomada para juros/multa e pró-rata (`docs/03`): fluxo de negócio vive em código testado. A única regra reforçada é que uma OS em estado final (`concluido`/`cancelado`) não aceita novo andamento.

**Log é append-only de propósito**: RLS dá ao prestador permissão de `INSERT`/`SELECT` na própria OS, mas não `UPDATE`/`DELETE` — o relatório passo a passo é evidência de execução; uma correção depois do fato é responsabilidade do admin, não do prestador apagando o que registrou.

### 4. Página de acompanhamento no back-office (`app/ordens-servico`)

Lista somente leitura (mesmo padrão de `app/faturas`) com categoria, alvo (imóvel ou residencial), prestador, data agendada, quantidade de etapas registradas e status — dá visibilidade imediata do cronograma sem precisar consultar o banco direto.

## Login de prestador: o que já está pronto e o que ainda depende do Supabase

RLS já modela exatamente "login estrito a eles": `usuarios.papel = 'prestador'` + `usuarios.pessoa_id` decide quais OS (e agora quais andamentos) cada prestador vê e pode atualizar — um eletricista logado nunca vê a OS do encanador. Isso não mudou nesta rodada porque já estava certo.

O que **não existe ainda, em lugar nenhum do sistema** — não é uma lacuna nova do módulo de OS, é a mesma pendência já registrada em `docs/09-credenciais-necessarias.md`: nenhuma tela do sistema tem autenticação de verdade hoje. As páginas de back-office (`app/imoveis`, `app/contratos`, `app/faturas`, e agora `app/ordens-servico`/`app/relatorios`) leem o banco via `server/integracao/db.ts` com a connection string de service role, que **ignora RLS de propósito** — é a conexão de confiança do backend, não a de um usuário logado. Construir uma tela de "login do prestador" sem o projeto Supabase existir seria construir uma tela que não autentica nada de verdade — pior que não ter a tela, porque pareceria funcionar sem funcionar. Por isso não foi construída agora.

**O que falta, na ordem**: (1) o projeto Supabase de homologação (bloqueio já documentado, `docs/09`); (2) com ele, ligar o Next.js ao Supabase Auth (client-side, com a `anon key`, não a service role) para as telas de portal — login por magic link (decisão já tomada em `docs/09`, item 1.7) vale tanto para inquilino/investidor quanto para prestador; (3) uma tela de portal do prestador (`/portal/prestador` ou similar, fora do back-office) que consulta o banco **através** do cliente Supabase autenticado — aí sim RLS entra em ação de verdade, filtrando automaticamente pelas políticas que já existem (`prestador_ve_proprias_os`, `prestador_registra_andamentos_da_propria_os` etc.), sem precisar duplicar a lógica de "só vê o que é seu" no código da tela.

O mecanismo de fricção zero (`magic_links`, sem exigir login) continua existindo para o prestador eventual pontual — as duas opções não são excludentes: um prestador que trabalha com frequência (zelador, eletricista de confiança recorrente) ganha login de verdade; alguém chamado uma única vez pode continuar recebendo só o link tokenizado.

## Verificação

Schema aplicado do zero em Postgres real sem erro. 13 testes de integração novos: `andamentosOS.integration.test.ts` (7 — inclui o histórico completo de etapas, rejeição de andamento em OS já concluída/cancelada, sincronização de `checkin_at`/`checkout_at`) e `gerarOrdensServicoPreventivas.integration.test.ts` (6 — plano de unidade, plano de prédio inteiro, idempotência, e o comportamento gradual de recuperação de atraso). Página `/ordens-servico` verificada rodando contra o banco real (build de produção + servidor + requisição HTTP confirmando a lista renderizada).
