# 39. Módulo de Coliving: triagem, matching automático e adaptação contratual — análise e proposta

Você anexou o material que já roda de verdade fora do sistema hoje: um formulário público de triagem (hospedado no Netlify), quatro laudos de "Auditoria de Triagem" gerados a partir dele, um exemplo de comparação cruzada entre dois candidatos (feita hoje manualmente, colando os dois laudos em um assistente de IA), o clausulado jurídico completo de um contrato de coliving, e um contrato de coliving já assinado. Isso muda a base da proposta do `docs/38`: em vez de desenhar um módulo do zero, agora dá para extrair a especificação exata do que já está em produção informal e só formalizar dentro do sistema — sem inventar variável nenhuma.

**Nota sobre dados sensíveis**: os documentos anexados têm CPF, RG, endereço, e-mail, telefone, quadro de saúde/alergia e chave PIX de pessoas reais. Nada disso entra neste documento nem em nenhum arquivo versionado — os exemplos abaixo usam "Candidato A/B" e valores genéricos, mesmo tratamento já dado aos dados dos contratos de Curitiba (docs/33) e às credenciais do Growatt (docs/09).

## 1. O que já existe hoje, fora do sistema

**Formulário de triagem** (`questionario-triagem-coliving.netlify.app`) coleta, por candidato:
- Identificação básica (nome, nascimento, e-mail, WhatsApp, foto).
- Alocação de ativos: 1ª opção de imóvel + posição do quarto (esquerda/direita da porta), 2ª opção de contingência (imóvel + quarto), com TCLE de LGPD/LBI explícito no topo.
- Adaptação arquitetônica e saúde (não eliminatório, mas verificado): identidade de gênero, preferência de convívio por gênero, neurodivergência, PCD, condição crônica de saúde, quadro alérgico (com campo livre de observação).
- **Vetor comportamental**, 7 variáveis, escala 1-3, cada uma com peso ou marcada como filtro de exclusão:

| # | Variável | Peso | 1 | 2 | 3 |
|---|---|---|---|---|---|
| L | Limpeza nas áreas comuns | 3 | Baixa | Moderada | Alta |
| R | Sensibilidade a ruído/visitas | 3 | Hipersensível | Moderada | Tolerância normal |
| C | Cronotipo | 2 | Diurna | Mista | Noturna |
| F | Tabagismo | filtro | Exijo livre de fumo | Não fumante, tolera externo | Fumante ativo |
| P | Tolerância a pets | filtro | Intolerância/alergia severa | Restrita (pequeno porte) | Alta tolerância/possui pet |
| D | Hábitos alimentares | 1 | Onívoro | Vegetariano/vegano | Restrição severa |
| X | Resolução de conflitos | 2 | Evitação | Mediação via gestão | Comunicação direta |
- Posse de pet (sim/não + espécie/porte + foto, se sim).

**Laudo de "Auditoria de Triagem"** (PDF por candidato): consolida o formulário e expõe o vetor `V = [L, R, C, F, P, D, X]` junto dos dados de identificação/saúde — é o documento que hoje é gerado automaticamente, mas **sozinho**, sem comparação com ninguém.

**Comparação cruzada** (o que falta operacionalizar): hoje, quando surge um segundo candidato para o mesmo apartamento, alguém pega os dois laudos e pede a um assistente de IA para comparar manualmente. O exemplo que você mandou mostra a estrutura que esse resultado tem: tabela de desvio por variável, um "ponto crítico" identificado (a variável de maior peso com maior divergência), cruzamento com o quadro de saúde (ex.: candidato alérgico a poeira × colega com nível baixo de limpeza — risco maior que a soma dos dois números isolados), neutralização do filtro de pets quando nenhum dos dois tem animal, um índice percentual final e um veredito com recomendações operacionais (inclusive de alocação — quem fica em qual quarto).

**Contrato de coliving assinado**: confirma que o resultado dessa comparação já vai parar dentro da cláusula 3.4 do contrato ("DA COMPATIBILIDADE E CONVIVÊNCIA") — hoje digitada à mão a partir do laudo — e revela o regime de negócio completo por trás da modalidade "híbrida": exploração do quarto vago por temporada (Airbnb/Booking) enquanto o outro quarto tem locação fixa, rateio de energia 50/50 por quarto com compensação ao locatário fixo quando o vago está hospedado, gás fora do contrato (autônomo entre moradores), cobrança unificada "tudo incluído" decomposta em 10 rubricas percentuais (para fins de declaração de IRPF do locatário), caução de 1 mês, multa rescisória com teto de 2 meses e **redução de 90% se o próprio locatário indicar um substituto aprovado**, e rescisão extraordinária por "quebra de habitabilidade" após 3 notificações documentadas.

## 2. O que falta no sistema — lacunas concretas

1. **Nenhum dado de perfil comportamental existe hoje**: `comodos` e `imoveis.permite_coliving` (docs/27) guardam só a estrutura física, não pessoas nem preferências.
2. **`leads` não tem noção de "quarto pretendido"**: só `imovel_interesse_id`, sem `comodo_id`, sem 2ª opção — perde exatamente a informação que o formulário real coleta.
3. **Comparação cruzada é 100% manual e não fica registrada em lugar nenhum do sistema** — é feita ad hoc num chat de IA e colada manualmente no contrato.
4. **`reservas_temporada` é por `imovel_id`, não por `comodo_id`**: a constraint de anti-overbooking (docs/08) bloquearia — incorretamente — reservar o quarto vago via Airbnb enquanto o outro quarto tem contrato fixo ativo no mesmo imóvel, porque hoje ela enxerga o imóvel inteiro como uma unidade só.
5. **`contrato_partes.papel`** não distingue "colocatário" (compartilha o imóvel, mas cada um com contrato/quarto próprio) do inquilino tradicional — hoje só existe `locatario_principal`/`locatario_adicional` (mesmo contrato) e `fiador`.
6. **Nenhuma regra de negócio de coliving está parametrizada**: percentuais de rubrica, fórmula de compensação de energia/gás, teto e redução de multa rescisória por indicação, gatilho de quebra de habitabilidade — tudo isso está descrito em prosa dentro do contrato, não como dado consultável nem calculável.

## 3. Proposta de schema

Seguindo o padrão já estabelecido (`comodos`, `leads`, `contrato_componentes_mensais`): sem cache com expiração (volume de candidatos por imóvel é baixo, calcular sob demanda é barato), sem ML, decisão sempre humana.

```sql
-- Extensão de leads: quarto pretendido + 2ª opção, só relevante para coliving
alter table leads add column comodo_interesse_id uuid references comodos(id);
alter table leads add column imovel_interesse_2_id uuid references imoveis(id);
alter table leads add column comodo_interesse_2_id uuid references comodos(id);

-- Perfil comportamental — 1:1 com um lead (candidato) OU com uma pessoa (morador já contratado)
create table perfis_convivencia (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  pessoa_id uuid references pessoas(id),
  -- exatamente um dos dois preenchido: candidato ainda não é pessoa, morador já é
  constraint chk_perfil_um_dono check (
    (lead_id is not null and pessoa_id is null) or (lead_id is null and pessoa_id is not null)
  ),

  v1_limpeza smallint not null check (v1_limpeza between 1 and 3),
  v2_ruido smallint not null check (v2_ruido between 1 and 3),
  v3_rotina smallint not null check (v3_rotina between 1 and 3),
  v4_fumo smallint not null check (v4_fumo between 1 and 3),
  v5_pets smallint not null check (v5_pets between 1 and 3),
  v6_dieta smallint not null check (v6_dieta between 1 and 3),
  v7_conflito smallint not null check (v7_conflito between 1 and 3),

  tem_pet boolean not null default false,
  descricao_pet text,

  genero text,
  preferencia_genero_convivio text check (preferencia_genero_convivio in ('mesmo_genero','indiferente')),
  neurodivergencia text,
  pcd text,
  condicao_saude text,
  quadro_alergico text,
  quadro_alergico_detalhe text,

  aceite_lgpd_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (lead_id),
  unique (pessoa_id)
);

-- Resultado de uma comparação cruzada entre dois perfis, para um par de quartos do mesmo imóvel
create table compatibilidades_coliving (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  perfil_a_id uuid not null references perfis_convivencia(id),
  perfil_b_id uuid not null references perfis_convivencia(id),

  score_geral numeric(5,2) not null,       -- 0-100, função pura e determinística — nunca ML
  pontos_atrito jsonb not null,            -- lista de {variavel, motivo, severidade}
  alertas_criticos jsonb not null,          -- filtros de exclusão (fumo/pets) e cruzamentos com saúde

  status text not null default 'calculado'
    check (status in ('calculado','aprovado','reprovado','entrevista_requerida')),
  decidido_por uuid references pessoas(id),
  parecer text,
  decidido_em timestamptz,

  criado_em timestamptz not null default now(),
  constraint chk_perfis_distintos check (perfil_a_id <> perfil_b_id),
  unique (perfil_a_id, perfil_b_id)
);
```

Nada de cache com `expires_at` (era ideia do PRD genérico do `docs/38`, descartada aqui): o registro em `compatibilidades_coliving` já É o histórico — se um dado do formulário mudar, recalcula e mantém o anterior para auditoria, no mesmo espírito de `reajustes_contrato` nunca ser sobrescrito.

## 4. Algoritmo de compatibilidade — determinístico, testável, com a mesma filosofia do exemplo

Não vou replicar bit a bit a conta do exemplo (foi um assistente de IA respondendo uma vez, sem fórmula fixa nem reprodutibilidade) — vou formalizar a MESMA lógica de forma testável: `server/coliving/calcularCompatibilidade.ts`, função pura.

- Para as 5 variáveis com peso (L=3, R=3, C=2, D=1, X=2): `similaridade = 1 - |a - b| / 2` (escala 1-3, desvio máximo 2). Score geral = média ponderada das similaridades × 100.
- Fumo e pets **não entram na média** — são checados à parte, como no exemplo:
  - Fumo: incompatibilidade crítica se um exige ambiente livre de fumo (nível 1) e o outro é fumante ativo (nível 3). Nível 2 (tolera externo) gera alerta, não veto.
  - Pets: incompatibilidade crítica só se um declara intolerância/alergia severa (nível 1) **e** o outro de fato possui pet (`tem_pet = true`) — neutralizado quando nenhum dos dois tem pet, exatamente como no exemplo.
- Cruzamento com saúde (o que o exemplo fez "manualmente" e que formalizo como regra): se `quadro_alergico` menciona respiratório (ácaro/mofo/poeira) e o par declara `v1_limpeza <= 1`, adiciona um alerta de severidade elevada — mesmo que o desvio numérico de limpeza já tenha entrado na média, o cruzamento com saúde é informação a mais para o gestor, não um segundo desconto na nota.
- Saída: `{ scoreGeral, pontosAtrito: [{variavel, descricao}], alertasCriticos: [{tipo, descricao}] }` — nunca só o número. É a lista de pontos de atrito que fez você confiar no exemplo que mandou, não o "85%" isolado.
- Faixas de leitura (só rótulo, nunca decisão automática): ≥85 "Alta compatibilidade", 65-84 "Compatibilidade com pontos de atenção", 40-64 "Atrito relevante — recomenda-se entrevista", <40 "Baixa compatibilidade".

## 5. Fluxo de cadastro e matching automático

Pedido explícito: "funcionar automaticamente quando do cadastro de interessados... ou para deixar registrado esperando segundo interessado."

`server/integracao/registrarInteresseColiving.ts`:
1. Cria o `lead` + `perfis_convivencia` a partir do formulário (form próprio do sistema, substituindo o Netlify externo — mesmo domínio, sem depender de infra separada).
2. Busca **concorrentes de comparação** para o par (imóvel, comodo pretendido) e o comodo irmão do mesmo imóvel:
   - Morador atual do quarto irmão (via `contrato_partes` ativo → `perfis_convivencia.pessoa_id`), se já ocupado.
   - Outros `leads` pendentes para o quarto irmão do mesmo imóvel.
3. Se encontrar pelo menos um concorrente: calcula e grava uma linha em `compatibilidades_coliving` para cada par, status `'calculado'`.
4. Se não encontrar nenhum (primeiro interessado num apartamento totalmente vago): só grava o perfil, sem comparação — fica "aguardando 2º interessado". Quando o segundo candidato se cadastra, o passo 2 acima já o encontra e dispara o cálculo — sem necessidade de reprocessamento em lote nem cron; é reação a evento, como o resto do sistema.

**Tela de análise cruzada** (`app/coliving`, novo): por imóvel de coliving, lista quartos, ocupante/candidatos por quarto, e para cada par pendente mostra o score + pontos de atrito + alertas críticos, com formulário de decisão (aprovar/reprovar/pedir entrevista + parecer obrigatório) — mesmo padrão de `app/quebras-contrato` e `app/confissoes-divida`: o número é insumo, a assinatura da decisão é sempre humana.

## 6. Integração com o motor de contrato

**Correção depois de ler o contrato assinado por completo** (só tinha lido as 8 primeiras de 22 páginas ao propor isto — seção 10 explica o resto): o contrato não usa uma frase-resumo, usa uma **tabela comparativa lado a lado**, como um anexo próprio ("Termo de Compatibilidade"): uma linha por variável (limpeza, ruído, cronotipo, tabagismo, saúde), uma coluna por locatário, cada nível com seu rótulo por extenso (ex.: "Nível 1 (Básico)", "Nível 3 (Alta Tolerância)"). Ajusto a proposta: em vez de uma variável de texto solto, `server/legaldesign/mesclarTemplate.ts` recebe os dados já no formato `LinhaTemplate[]` que o bloco `{{#each}}` espera — uma linha por variável, com os rótulos por extenso resolvidos a partir dos níveis 1-3 (constantes nomeadas, mesmo padrão de `RUBRICA_TIPO_GARANTIA` em `gerarContratoHtml.ts`) — pronta para o modelo de contrato de coliving renderizar como a tabela real, não uma sentença gerada.

## 10. Achados adicionais (lidas as páginas 9-22 do contrato assinado)

A proposta acima foi escrita depois de ler só as 8 primeiras páginas do contrato de 22. O restante confirma a seção 7 (seguem Fase 2) e revela mais 5 anexos com regras próprias, nenhuma delas implementada nem prevista até aqui:

- **Anexo II — Inventário de bens e vistorias**: lista item a item os móveis/eletrodomésticos entregues por quarto e por área comum, com valor de reposição individual, prazo de garantia de 7 dias para notificar defeito (depois disso a responsabilidade de manutenção passa ao locatário), e a regra de rateio de dano de autoria desconhecida nas áreas comuns (50/50 por quarto, com o outro respondendo subsidiariamente se a caução do causador não bastar). Isso é uma extensão natural de `ativos_comodato` (já existe no schema desde antes) para o caso específico de item compartilhado entre dois contratos de quarto do mesmo imóvel — hoje `ativos_comodato` presume um comodato por contrato, não um item dividido entre dois.
- **Anexo III — Regulamento interno do coliving**: regras de convivência completas (proibição de sublocação/atividade comercial com exceção de home office administrativo, proibição de festas/eventos, agenda de limpeza com multa automática de 10% em caso de louça/sujeira deixada e registrada, máximo de 1 pet por autorização extrema, regras de pudor/vestuário, janela de obras/reforma 08h-18h dias úteis, e visita obrigatória a interessados no último mês sem renovação). Mapeia para o mesmo padrão de "quebra de habitabilidade" já na seção 7 — reaproveita o helpdesk, não schema novo.
- **Anexo IV — Tarifas de serviços essenciais**: **achado novo mais significativo** — o quarto tem **medição individual de energia com fórmula própria** (Valor = [Tarifa Efetiva + 25% de Custo Administrativo] × fator da bandeira ANEEL vigente, franquia mínima de 50 kWh/mês) e franquia de água/esgoto fixa de 6 m³/mês por quarto (excedente rateado pela diferença com a média dos últimos 3 meses, e cobrado do causador quando identificável), mais internet corporativa compartilhada com regras de uso (sem torrent/P2P, responsabilidade criminal do locatário pelo tráfego do próprio IP). Isso é um regime de faturamento de energia **totalmente diferente** do que `server/energia/calcularFaturaEnergia.ts` já modela (que é para o imóvel inteiro via geração solar/GD, não medição individual por cômodo com markup administrativo e bandeira ANEEL). Não cabe reaproveitar o módulo existente — seria uma função nova (`server/energia/calcularTarifaColivingPorComodo.ts`, hipótese de nome), com sua própria política nomeada e parametrizável (mesmo espírito de `PoliticaCobranca` em `jurosMulta.ts`), porque não há evidência de que os valores (25% administrativo, franquia de 50 kWh) sejam os mesmos em outro imóvel de coliving.
- **Anexo V — Lavanderia coletiva**: franquia de ciclos por quarto (2 brancas + 2 coloridas/semana), pacotes extras pagos via WhatsApp e lançados no boleto, janela de horário operacional, e bloqueio preventivo em caso de falta de água. Regra de negócio nova, sem tabela equivalente hoje.
- **Anexo VI — Termo de compatibilidade (Confidencialidade + tabela comparativa)**: é o anexo que corrige a seção 6 acima — confirma que o resultado da triagem vai para um anexo PRÓPRIO do contrato (não uma cláusula solta), junto com um NDA entre os coabitantes sobre dados sensíveis um do outro, e reafirma a regra de quebra de habitabilidade por 3 notificações + violação do sigilo.
- **Anexo VII — Autorização de citação/intimação eletrônica (TJSC)**: cláusula jurídica de processo civil (arts. 246, V e 270 do CPC + Resolução Conjunta GP/CGJ nº 5/2020 do TJSC), autorizando citação/intimação por e-mail/WhatsApp. É um bloco de texto fixo por contrato — cabe como cláusula padrão adicional no modelo de contrato de coliving (`modelos_contrato.corpo_html`), sem necessidade de dado novo no schema.

Nenhum desses achados muda a Fase 1 proposta (triagem/matching), exceto a correção da seção 6 acima. Todos entram no backlog da Fase 2, com o Anexo IV (tarifa de energia individual) como o item de maior complexidade real dentro dela — merece uma proposta própria quando chegar a vez, não uma estimativa apressada aqui.

## 7. O regime financeiro/jurídico do contrato de coliving — extraído, não inventado

O contrato assinado revela um regime completo e específico da modalidade híbrida que hoje não tem nenhuma representação no schema:

- **Rubrica "tudo incluído"**: 10 percentuais fixos (aluguel efetivo 40%, comodato 5%, fundo de manutenção 10%, serviços de terceiros 10%, manutenção hidráulica 8%, água/esgoto 8%, lavanderia coletiva 6%, internet 5%, interfone/câmeras 4%, impostos 4%) que decompõem o valor único cobrado — usado só para transparência/declaração de IRPF do locatário (cláusula 10.3), não como itens de cobrança separados. Proponho uma tabela `contrato_rubrica_coliving` (contrato_id + 10 linhas percentual/descrição) só para gerar esse extrato quando pedido, sem mexer na cobrança real (que continua sendo um valor único em `contratos.valor_aluguel`).
- **Compensação de energia/gás pelo hóspede do quarto vago**: fórmulas exatas já existem no contrato (50% da diferença de leitura do medidor no check-in/check-out; gás por diária = preço médio do botijão ÷ 60). Isso só é implementável de verdade se o sistema souber que o quarto vago está sendo explorado por temporada — que esbarra na lacuna nº 4 acima (`reservas_temporada` por imóvel, não por cômodo). Proposta: `reservas_temporada.comodo_id` (nullable — null continua significando "imóvel inteiro", preenchido significa "só este cômodo do coliving"), e ajustar a constraint de anti-overbooking para considerar `comodo_id` na exclusão em vez de só `imovel_id` quando presente.
- **Multa rescisória com teto próprio + redução de 90% por indicação de substituto aprovado**: `server/financeiro/multaRescisoria.ts` já existe para o regime de Florianópolis (teto de 3 meses, bonificação de dezembro) mas é uma política diferente da do coliving (teto de 2 meses, redução por indicação em qualquer época do ano, não só dezembro). Mesma lição de `jurosMulta.ts`: política por contrato, não constante única — proponho uma segunda política nomeada (`POLITICA_MULTA_COLIVING`) na mesma função, ou uma segunda função irmã, a decidir na implementação.
- **Quebra de habitabilidade (3 notificações documentadas)**: mapeia direto para o padrão já usado em `abrirChamado.ts`/notificações — três chamados de natureza "convivência" contra o mesmo colocatário viram gatilho de alerta para a gestão avaliar rescisão extraordinária. Reaproveita o helpdesk existente, não precisa de tabela nova.

Esses três últimos pontos são reais, mas são um escopo à parte do pedido central (triagem + matching) — o motor de contrato de coliving inteiro, não só a compatibilidade. Marco como Fase 2 abaixo.

## 8. "Apartamentos de 2 quartos sempre terão essa possibilidade"

Isso é uma regra de dado, não de código: proponho uma consulta/relatório (não uma automação silenciosa) que lista todo imóvel com exatamente 2 `comodos` cadastrados e `permite_coliving = false`, para você confirmar e marcar manualmente — mesma cautela de sempre (não flipar um campo de negócio sozinho sem confirmação humana, ainda mais um que muda o regime jurídico do imóvel).

## 9. Fases sugeridas

**Fase 1 — Triagem e matching (o pedido explícito e mais urgente)**: schema da seção 3, `calcularCompatibilidade.ts` com testes, `registrarInteresseColiving.ts`, formulário de cadastro de interessado dentro do sistema (substitui o Netlify externo), tela `app/coliving` de análise cruzada com decisão humana, e o hook no motor de contrato (seção 6).

**Fase 2 — Regime financeiro/jurídico do coliving (seção 7)**: rubrica de transparência, `comodo_id` em `reservas_temporada` (mexe numa constraint de anti-overbooking já em produção — maior risco, testar bem), política de multa rescisória própria, e o vínculo do helpdesk com quebra de habitabilidade.

Recomendo confirmar o escopo da Fase 1 antes de eu começar — é a peça pedida com mais urgência e a que fecha a lacuna operacional real (o laudo já existe, só falta comparar e registrar). A Fase 2 mexe em regras financeiras e numa constraint de banco já usada por reservas reais de temporada, então merece sua confirmação em separado antes de tocar nela.
