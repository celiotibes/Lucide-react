# Revisão de Ponta a Ponta: Crons Órfãos e Telas Ausentes

Você pediu para revisar o projeto de ponta a ponta e evoluir. Em vez de repetir o levantamento textual já feito em auditorias anteriores (docs/19, docs/24, o relatório de status em artifact), a revisão desta vez comparou objetivamente `app/` (o que tem tela) e `vercel.json` (o que tem cron) contra `server/integracao/*.ts` (o que já existe testado) — a mesma técnica que encontrou a lacuna do doc 19. O achado: **4 funções em lote nunca eram chamadas por nada** (só por teste) e **4 funções de abertura de solicitação nunca tinham nenhuma tela** (nem admin, nem inquilino) — dois blocos de código morto do ponto de vista de uso real, apesar de 100% testados.

## Achado 1: 4 crons que não existiam

| Função já testada | Cron novo | Por quê ninguém tinha ligado antes |
|---|---|---|
| `faturarEnergiaConfirmada` (docs/11) | `/api/cron/faturar-energia` | Construída no mesmo lote do gerador de fatura de aluguel, mas o cron só foi feito para aluguel (docs/13) |
| `processarReguaCobranca` (docs/04) | `/api/cron/regua-cobranca` | Só era chamada pela suíte de teste — nunca teve rota HTTP |
| `gerarOrdensServicoPreventivas` (docs/14) | `/api/cron/gerar-os-preventivas` | Mesma situação |
| `calcularAuditoriaEnergiaSolarDoResidencial` (docs/30) | `/api/cron/calcular-auditoria-energia-solar` | Construída na rodada passada, mas só o backend — cron ficou para depois |

Mesmo padrão de `/api/cron/gerar-fatura-mensal` (docs/13): segredo compartilhado (`CRON_SECRET`, header `Authorization: Bearer`), aceita GET e POST, devolve o resultado da função em JSON. `calcular-auditoria-energia-solar` tem uma diferença deliberada: o parâmetro `competencia` default é o **mês anterior**, não o corrente (dá tempo da fatura Celesc GD do mês fechado chegar e ser confirmada antes do cálculo rodar).

Os 4 crons novos entraram em `vercel.json`, chegando a 8 no total — **atenção**: o plano Hobby da Vercel limita a quantidade de crons por projeto; confirmar o limite do plano contratado antes do deploy (detalhe em docs/13).

15 testes de integração novos cobrindo as 4 rotas (autenticação, parsing de parâmetro, execução real contra Postgres).

## Achado 2: 4 funções de abertura de solicitação sem nenhuma tela

`abrirChamado.ts`, `solicitarChaveReserva.ts`, `solicitarImagensCameras.ts` e `solicitarAutorizacaoInternetParticular.ts` existiam desde os docs 14/16/26, totalmente testados — mas nenhuma tela do sistema chamava nenhuma delas. A lista de OS (`app/ordens-servico`) só mostrava ordens já existentes; não havia como criar uma nova pela interface.

**`app/ordens-servico/novo`** (novo): formulário único "Nova solicitação" com um seletor de tipo que troca os campos:
- **Chamado geral** — natureza (emergência/financeiro/contratual/manutenção/jurídico), categoria, descrição, urgência.
- **Chave reserva/cópia** — motivo opcional; mostra o valor previsto vindo do tarifário do próprio contrato (Anexo II), não um valor fixo do sistema.
- **Imagens de câmera de segurança** — data/horário/justificativa obrigatórios; aviso explícito de que o Anexo III veda o pedido por padrão e a decisão é sempre jurídica, nunca automática.
- **Autorização de internet particular** — provedor pretendido opcional.

Quem abre é sempre o **locatário principal do contrato ativo** selecionado (resolvido no servidor a partir do `contrato_id` escolhido de uma lista real — nunca um `pessoa_id` digitado à mão, para não permitir abrir chamado em nome de qualquer pessoa) — mesma decisão de design de `app/quebras-contrato`: sem portal de autenticação do inquilino ainda (docs/09), quem opera esta tela é a gestão, registrando o pedido em nome de quem ligou/mandou mensagem.

Verificado ponta a ponta com um script chamando a Server Action diretamente contra o Postgres real (mesmo princípio de teste de integração, sem subir servidor HTTP): as 4 variações de solicitação geraram a OS certa com `categoria`/`natureza` corretos, e a variação de imagens de câmera gravou a linha em `solicitacoes_imagens_cameras` com `status = 'em_analise_juridica'`.

## Achado 3: energia solar sem nenhuma tela (fechando o doc 30)

`docs/30-auditoria-geracao-solar.md` já apontava isso como pendente. **`app/energia-solar`** (novo):
- Formulário de lançamento de fatura Celesc GD (residencial, competência, valor total, energia injetada/consumida da rede).
- Lista de faturas pendentes de confirmação com botão "Confirmar" por linha (mesmo padrão de `app/conciliacao-bancaria`).
- Formulário para disparar o cálculo da auditoria de um residencial/competência sob demanda (sem esperar o cron mensal) — devolve o motivo explícito quando ainda falta alguma fonte confirmada, nunca um número estimado.
- Tabela de auditorias já calculadas, com destaque visual quando `inconsistente = true`.

`confirmarFaturaCelescGD` teve o tipo do parâmetro `confirmadoPorPessoaId` relaxado de `string` para `string | null` — a coluna já era nullable no schema; o parâmetro só passou a refletir a mesma realidade documentada em `app/quebras-contrato/actions.ts`: nenhuma tela do sistema tem sessão de usuário autenticado ainda, então "confirmado por" fica null.

Verificado ponta a ponta da mesma forma que o achado 2 (chamada direta da Server Action contra Postgres real): lançar fatura → confirmar → calcular auditoria sem geração solar confirmada (devolve o motivo, não grava nada) → confirmar geração solar → calcular de novo (grava a auditoria com os valores certos).

## Achado 4: `app/ordens-servico/[id]` só lia a timeline, não escrevia nela

A tela de detalhe da OS mostrava o histórico de andamentos, mas não havia formulário nenhum para registrar um novo — só existia `server/integracao/andamentosOS.ts`, testada, sem UI. Junto disso, achei uma segunda lacuna dentro da mesma função: não havia como **atribuir um prestador** a uma OS em lugar nenhum do código (nem função, nem UI) — `ordens_servico.prestador_id` só era gravado no fixture de teste ou manualmente.

- `registrarAndamentoOS` ganhou um parâmetro opcional `prestadorPessoaId` — quando informado, atualiza `ordens_servico.prestador_id` na mesma chamada que registra o andamento (tipicamente usado com o tipo `atribuida`, mas sem regra rígida de acoplamento — nenhum pedido do cliente especificou isso, e travar demais aqui seria inventar processo). 1 teste de integração novo.
- `app/ordens-servico/[id]` ganha o formulário "Registrar andamento": tipo, prestador (opcional — "não alterar" por padrão) e descrição. Some quando a OS já está em estado final (`concluido`/`cancelado`), mostrando a mensagem em vez do formulário — mesma regra que a função já impõe no banco, só refletida na tela para não deixar o usuário preencher um formulário que vai ser rejeitado.

Verificado ponta a ponta chamando a Server Action diretamente contra Postgres real: atribuir prestador (grava `prestador_id` e muda status para `alocado`) → concluir (muda status, dispara notificação/pesquisa quando há `aberto_por_pessoa_id`) → tentar um novo andamento (rejeitado com a mensagem de estado final, mesma verificada nos testes de `andamentosOS.ts`).

## O que continua pendente

- Portal de autenticação do inquilino/investidor/prestador — bloqueio de sempre (docs/09), por isso as telas novas são operadas pela gestão, não self-service ainda.
- `server/growatt/client.ts` continua sem poder ser validado contra a API real neste ambiente sandbox (docs/30) — a tela de energia solar já avisa isso no próprio texto da página.
- Confirmar o limite de crons do plano Vercel antes do deploy (achado 1).
- Upload de fotos nos andamentos (`fotos_urls`) continua sem campo na UI — depende de um provedor de storage (Supabase Storage, bloqueado por credencial em docs/09), mesma situação de anexos em outras telas.

## Verificação

Schema sem alteração nesta rodada (nenhuma tabela nova). Typecheck, lint e build limpos. 15 testes novos de rota de cron + 1 teste novo de `registrarAndamentoOS` (atribuição de prestador) + verificação end-to-end das três telas novas/alteradas por chamada direta de Server Action contra Postgres real (não Playwright desta vez — script direto, mesmo rigor, sem a dependência pesada do navegador). Contagem de testes e execução da suíte completa registradas no commit desta rodada.
