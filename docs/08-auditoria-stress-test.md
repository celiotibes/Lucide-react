# Auditoria em Loop e Stress-Test — Resultados

> **Atualização (2ª rodada completa):** uma varredura sistemática de todas as 49 tabelas encontrou 39 sem RLS habilitado — incluindo `pessoas`. Detalhe no final deste documento, seção "Rodada 3".

Ciclo de auditoria automática: montei um ambiente que simula os papéis reais do Supabase (não só um superusuário do Postgres), estressei o schema com dados em volume e cenários adversos, encontrei bugs reais, corrigi, e retestei — repetindo até não sobrar nenhum problema conhecido. Este documento é o relatório desse ciclo, não uma reafirmação do que já foi dito nos docs anteriores.

## Metodologia

Diferente da validação anterior (que rodava como superusuário do Postgres, sem RLS de verdade em jogo), esta rodada criou os papéis `authenticated`/`anon` do Supabase, uma função `auth.uid()` que lê a claim JWT de sessão (como o PostgREST faz de verdade), e testou cada tabela **impersonando cada papel de usuário** (admin, inquilino, investidor, prestador) via `SET ROLE` + `SET request.jwt.claim.sub`. É assim que bugs de política de acesso aparecem — testar como superusuário nunca os revela, porque superusuário ignora RLS.

## Bugs encontrados e corrigidos (rodada 1 — RLS)

Ao consultar cada tabela protegida por RLS como o papel `authenticated`, 5 de 5 cenários testados falharam na primeira versão:

| # | Bug | Efeito prático | Correção |
|---|---|---|---|
| 1 | `contratos` tinha RLS habilitado sem nenhuma política | **Admin ficava bloqueado de ver a própria carteira de contratos** — o back-office inteiro quebraria em produção | Política `admin_full_access_contratos` (bypass via nova função `fn_eh_admin_ou_economista()`) |
| 2 | Mesma causa | Inquilino também não via o próprio contrato | Política `inquilino_ve_proprio_contrato` |
| 3 | `investidor_ledger` só tinha política para o investidor dono da linha | Admin/economista não conseguiam auditar o ledger de ninguém pelo portal | Política de bypass admin adicionada |
| 4 | `ordens_servico` só tinha política de `SELECT` | **Prestador não conseguia gravar check-in/check-out** — o fluxo operacional inteiro do Módulo 5 (campo/manutenção) não funcionaria | Política `prestador_atualiza_propria_os` (UPDATE) |
| 5 | Mesma tabela sem bypass admin | Admin não via nenhuma ordem de serviço pelo portal | Política de bypass admin adicionada |

Verifiquei cada correção **repetindo exatamente o mesmo teste que falhou** (mesmo usuário, mesma query) e confirmando que passa a retornar o resultado esperado — não apenas que "não dá mais erro". Também rodei um teste de não-regressão: investidor continua **sem** conseguir ver `contratos` de outros (a correção não abriu acesso demais).

Aproveitando o mesmo ciclo, apliquei o mesmo padrão preventivamente a três tabelas que ainda não tinham RLS habilitado e deveriam (identificadas na auditoria de cobertura, não por um teste que falhou explicitamente): `garantias`, `leituras_energia` e `cobrancas_asaas` — todas expõem dado que o portal do inquilino precisa mostrar (caução, consumo de energia, status de boleto/PIX), e `extrato_mensal_itens`, cujo RLS eu tinha esquecido de habilitar quando essa tabela foi criada na rodada anterior — **RLS de uma tabela pai não protege a tabela filha automaticamente**, e esse é exatamente o tipo de lacuna silenciosa que só aparece testando, não lendo o schema.

## Bugs encontrados e corrigidos (rodada 2 — integridade financeira)

Testei inserir dados absurdos que uma UI com bug, uma migração malfeita ou uma chamada de API errada poderiam produzir:

| # | Bug | Teste que expôs | Correção |
|---|---|---|---|
| 6 | Aluguel negativo aceito sem erro | `INSERT contratos ... valor_aluguel = -500` funcionou | `CHECK (valor_aluguel > 0)` |
| 7 | Contrato com `data_fim` anterior a `data_inicio` aceito | `INSERT` com datas invertidas funcionou | `CHECK (data_fim IS NULL OR data_fim > data_inicio)` |
| 8 | Um único proprietário podia ter 350% de um imóvel | `INSERT imovel_propriedade ... percentual = 3.5` funcionou | `CHECK (percentual > 0 AND percentual <= 1)` |
| 9 | Nada impedia a **soma** de percentuais de vários sócios do mesmo imóvel de ultrapassar 100% | Dois sócios em 60%+40% (ok) mais um terceiro em 10% somavam 110% e eram aceitos | Trigger `fn_check_soma_percentual_imovel` — bloqueia qualquer INSERT/UPDATE que faça a soma ativa (`data_fim IS NULL`) ultrapassar 100%, com tolerância de arredondamento |

Também adicionei constraints de valor não-negativo/positivo a mais 10 tabelas com campos monetários (`faturas`, `garantias`, `split_pagamento`, `lancamentos_prestador`, `ativos_comodato`, `depreciacao_mensal`, `investidor_ledger`, `extratos_mensais_proprietario`, `notas_fiscais_servico`, `ordem_servico_custos`, `tributos_municipais`, `confissoes_divida`) — não porque um teste individual falhou em cada uma, mas porque a mesma classe de bug (valor negativo sem sentido de negócio aceito silenciosamente) se aplicava a todas por analogia direta com os bugs 6-8. Duas exceções deliberadas ficaram documentadas no próprio schema: `transacoes_bancarias.valor` (negativo representa débito, por design) e `fatura_itens.valor` (pode ser um item de crédito/desconto dentro de uma fatura consolidada).

Retestei os 3 bugs originais (devem falhar agora) mais 3 cenários válidos (contrato correto, dois sócios em exatamente 100%, terceiro sócio estourando o total) — todos os 6 resultados vieram como esperado.

## Verificações que passaram sem precisar de correção

- **Anti-overbooking (constraint de exclusão)**: retestada depois de todas as mudanças acima — continua bloqueando reserva sobreposta entre canais e aceitando reserva sem conflito. Sem regressão.
- **Trigger CPC 25**: retestado — continua bloqueando provisão com probabilidade "possível" e aceitando com "provável". Sem regressão.
- **Audit log genérico**: retestado sob carga (492 faturas inseridas em lote) — dispara corretamente para cada linha sem erro nem degradação perceptível nesse volume.
- **Proteção contra exclusão indevida**: tentei apagar um imóvel com contrato vinculado e uma pessoa com propriedade de imóvel vinculada — ambos falharam com violação de chave estrangeira, como deveria ser (a via correta para "remover" é mudar status/anonimizar, nunca `DELETE`, especialmente por causa da obrigação de retenção de histórico financeiro e da rotina de anonimização por LGPD do gap 19).
- **Uso de índice sob volume**: com 40 imóveis, ~492 faturas e 5.000 transações bancárias sintéticas, `EXPLAIN` confirmou que os índices (`idx_faturas_status_vencimento`, `idx_transacoes_conta_data`, `idx_transacoes_status`) são de fato usados pelo planejador nas consultas mais comuns (faturas atrasadas, transações por conta/período, transações pendentes de aprovação). Uma consulta inicialmente pareceu ignorar o índice (*sequential scan*) — investiguei antes de tratar como bug e confirmei que era o comportamento correto do otimizador: naquele momento 100% das linhas de teste tinham o mesmo status, e nesse caso variar sem usar o índice é mais rápido. Com uma distribuição realista de status (a maioria `aprovado`, poucas `sugerido`), o índice passou a ser usado — não era um bug, era eu precisando de dados de teste mais realistas.

## Ciclo do código (`server/ai-gateway`)

Adicionei 3 testes de contrato que não existiam: a flag `hardwareOllamaDisponivel` não pode vazar para tarefas onde não se aplica (testado — continua roteando para Gemini normalmente), toda decisão retornada tem um `motivo` não vazio (contrato de auditabilidade, testado para todas as tarefas permitidas), e o bloqueio de *credit scoring* vale mesmo se `hardwareOllamaDisponivel: true` for passado por engano (testado). Total: 12 testes, todos passando; `npm run build`, `npm run lint` e `tsc -p tsconfig.server.json` seguem limpos.

## Rodada 3 — varredura sistemática de RLS em todas as tabelas (achado mais grave até aqui)

As duas rodadas anteriores corrigiram RLS tabela por tabela, conforme cada bug aparecia num teste específico. Isso deixou uma lacuna óbvia em retrospecto: **nunca fiz um inventário de todas as tabelas do schema para conferir quais tinham RLS habilitado**. Fiz isso desta vez com uma query direta ao catálogo do Postgres (`pg_class.relrowsecurity`):

```sql
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';
```

Resultado: **39 das 49 tabelas não tinham RLS habilitado**, incluindo `pessoas`, `usuarios` e `pessoa_papeis` — exatamente as tabelas com o dado mais sensível do sistema (CPF, papel de acesso). Testei concretamente, não apenas inferi do catálogo: logado como um inquilino comum via papel `authenticated`, rodei `select nome, cpf_cnpj from pessoas` e o retorno trouxe **as quatro pessoas cadastradas no teste — inquilinos, investidor e admin, todo mundo**. Qualquer inquilino do sistema, com a arquitetura de antes desta correção, conseguiria ver o CPF de todos os outros inquilinos e investidores via um client autenticado comum (sem precisar de nenhuma credencial elevada). Isso é uma violação de LGPD real, não uma vulnerabilidade teórica — e é o achado mais grave de todo o processo de auditoria até aqui.

### Correção
Todas as 39 tabelas ganharam RLS + política, organizadas em 4 categorias:

1. **Identidade e dado pessoal** (`pessoas`, `usuarios`, `pessoa_papeis`, `contrato_partes`, `imovel_propriedade`, `reajustes_contrato`, `notificacoes_preferencia_venda`, `fatura_itens`, `vistorias`, `vistoria_fotos`, `confissoes_divida`, `assinaturas`, `notificacoes_log`): admin/economista têm acesso total; cada pessoa (inquilino, investidor, prestador, signatário) enxerga só a própria linha ou linhas ligadas ao próprio contrato — usando uma nova função auxiliar `fn_minha_pessoa_id()` para não repetir o mesmo JOIN em toda política.
2. **Prestadores** (`lancamentos_prestador`, `deficit_retencao`, `folha_fechamento`, `ordem_servico_custos`): admin total; prestador vê a própria folha/custos, não a de outro prestador.
3. **Investidor** (`notas_fiscais_servico`, `split_pagamento`): admin total; investidor vê a NFS-e e o split que dizem respeito a ele.
4. **Público / site institucional** (`leads`, `anuncios`, `imoveis`): `leads` aceita INSERT anônimo (formulário de contato) mas **nunca** SELECT anônimo — sem essa restrição, a chave pública do site exporia nome/contato/score de crédito de todo prospect que já preencheu o formulário; `anuncios` e `imoveis` só mostram ao público linhas com status publicado/disponível, testado concretamente (uma unidade "ocupada" e outra "disponível" cadastradas, o papel `anon` só recebeu a disponível de volta).
5. **Referência** (`cidades`, `residenciais`, `tarifas_energia`, `categorias_financeiras`): leitura liberada para qualquer usuário autenticado (baixa sensibilidade), escrita só admin.
6. **Estritamente internas** (`magic_links`, `fundos`, `fundo_movimentacoes`, `contas_bancarias`, `transacoes_bancarias`, `ativos_comodato`, `depreciacao_mensal`, `dossies_inadimplencia`, `processos_judiciais`, `regua_cobranca_eventos`, `reservas_temporada`, `tributos_municipais`): só admin/economista; nenhuma outra política.
7. **`audit_log`**: admin pode ler; **ninguém pode escrever via API**, nem o admin — testado concretamente tentando um INSERT como admin autenticado, que falhou como esperado. A única via de escrita é o trigger `fn_audit_trigger`, que roda com privilégio de dono do schema e ignora RLS.

### Verificação final
Depois da correção: consulta ao catálogo confirma **49 de 49 tabelas com RLS habilitado**, e uma segunda consulta confirma que **nenhuma tabela com RLS habilitado ficou sem nenhuma política** (o que reproduziria o mesmo bug da rodada 1 — RLS ligado sem política bloqueia todo mundo, inclusive o admin). Reexecutei os testes críticos das rodadas 1 e 2 (admin vê contratos, inquilino vê o próprio contrato, CPC 25 bloqueia provisão indevida, aluguel negativo é rejeitado) e todos continuam passando sem regressão. Os 12 testes de `server/ai-gateway` também seguem passando — mudança isolada ao schema, sem efeito no código TypeScript.

## O que este ciclo não cobriu (limite honesto)

- Não há ambiente Supabase real disponível nesta sessão — a simulação de papéis/RLS é fiel ao modelo do PostgREST, mas o comportamento definitivo só é confirmado num projeto Supabase de homologação real (primeiro item do roadmap).
- Constraints de banco não substituem validação de formulário/API — todas as checagens acima são a **última linha de defesa**, não a primeira; a aplicação (Fase 0) ainda precisa validar e dar mensagens de erro amigáveis antes de a query chegar ao banco.
- Não foi feito teste de carga em escala de produção real (milhares de imóveis) — o volume testado (40 imóveis/492 faturas/5.000 transações) é proporcional ao tamanho real do seu portfólio, não um teste de escalabilidade genérico.
