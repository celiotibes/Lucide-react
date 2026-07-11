# Motor de Geração de Contratos (Legal Design / Visual Law)

Pedido: automatizar a geração de contratos de locação em HTML/CSS (Legal Design/Visual Law, custo zero de licenciamento), fundindo modelo regional + dados variáveis do inquilino + inventário de mobília independente + cláusulas adicionais, com suporte a Kitnet Integral e Co-living por quarto. Este documento cobre o que foi entregue nesta rodada e a análise de custo-benefício pedida para o resto (conversão para PDF).

## Suas duas perguntas diretas

**Banco de dados e backend**: PostgreSQL (`database/schema.sql`, hoje testado contra Postgres puro, indo para Supabase — `docs/03-arquitetura-e-stack.md`, `docs/09-credenciais-necessarias.md`) + Next.js/TypeScript (App Router, `app/`), sem framework de backend separado — as rotas de API do próprio Next.js (`app/api/**/route.ts`) fazem esse papel, decisão já tomada desde a Fase 0 do projeto. Zero PHP/Python no projeto.

**Biblioteca de HTML→PDF**: não, ainda não há nenhuma rodando no servidor. Recomendação abaixo.

## O que foi construído agora

### 1. Plano de tabelas (implementado em `database/schema.sql`, seção 27)

Reaproveita o que já existia em vez de duplicar — três tabelas do pedido já existiam sob outro nome:

| O que o pedido descreve | Tabela | Situação |
|---|---|---|
| "Locatários e Responsáveis Solidários, suporta múltiplos" | `contrato_partes` + `pessoas` | Já existia (docs/10, achado 6) — só faltavam `rg`, `profissao`, `estado_civil` em `pessoas` (adicionados agora) |
| "Garantia locatícia: valor, forma de devolução, condições de pagamento" | `garantias` | Já existia (valor/tipo/status) — faltava `forma_pagamento`/`parcelas` (adicionados agora) |
| "Inventário de mobília independente do contrato" | `ativos_comodato` | Já existia desde a Fase de patrimônio (CPC 27/depreciação) — é literalmente o módulo pedido, só sem o recorte por cômodo |
| "Histórico de contratos" | `contratos` + `documentos_gerados` (`tipo='contrato'`) | Já existia — `documentos_gerados` já reservava o tipo `'contrato'` desde a fase de assinaturas, nunca usado até agora |

Novo de fato:

- **`comodos`**: um cômodo/quarto dentro de um imóvel (`imovel_id`, `identificacao`, `area_m2`, `valor_aluguel_referencia`). Só existe quando o imóvel usa co-living.
- **`imoveis.permite_coliving`**: a flag do pedido — quando `false`, `comodos` nunca é consultado para aquele imóvel.
- **`contratos.comodo_id`**: nulo = objeto da locação é o imóvel inteiro (Opção A); preenchido = objeto é só aquele cômodo (Opção B). Uma trigger (`fn_check_contrato_comodo_coerente`) impede vincular um cômodo de outro imóvel ou vincular cômodo a um imóvel que não permite co-living — regra demais para um `check` simples, precisa consultar duas tabelas.
- **`contratos.clausulas_adicionais`**: o texto livre do textarea de "pedidos específicos", injetado como parágrafos na seção de cláusulas adicionais.
- **`ativos_comodato.comodo_id` / `.area_comum`**: um item de mobília agora pode pertencer a um cômodo específico (uso privativo do co-living) ou ser marcado como área comum (cozinha, lavanderia, sala) — mutuamente exclusivos (`chk_ativo_comodo_ou_area_comum_nao_ambos`). Sem os dois nulos/falsos, a busca continua sendo "tudo do imóvel", como já era antes desta rodada.
- **`modelos_contrato`**: o modelo regional em si — `cidade_id` (resolve Florianópolis vs. Curitiba automaticamente a partir de `imoveis.cidade_id`, que já existia), `corpo_html` com placeholders `{{variavel}}`, `versao`/`ativo` (corrigir um modelo não invalida contratos já gerados com a versão anterior — o HTML final de cada contrato fica persistido, não recalculado depois). Índice único garante no máximo um modelo ativo por cidade, para a resolução "qual modelo usar" ser direta.

Todas as tabelas novas com RLS (admin/economista, mesmo padrão do resto do sistema) e trigger de auditoria.

### 2. Função principal (`server/integracao/gerarContratoHtml.ts`)

```
gerarContratoHtml(pool, contratoId) →
  1. lê contrato + imóvel + cidade + cômodo (se houver)
  2. busca o modelo_contrato ativo da cidade do imóvel — lança ContratoSemModeloError se não existir
  3. busca as partes do contrato (locatários e responsáveis solidários/fiadores, já formatados)
  4. busca a garantia mais recente do contrato
  5. busca o inventário de mobília — se o contrato tem comodo_id: mobília daquele
     cômodo + áreas comuns; senão: mobília inteira do imóvel
  6. monta o objeto de dados (valores formatados em pt-BR, moeda e data)
  7. chama mesclarTemplate(modelo.corpo_html, dados) → devolve o HTML final
```

O motor de substituição (`server/legaldesign/mesclarTemplate.ts`) é deliberadamente simples em vez de puxar Handlebars como dependência nova — só o que este pedido realmente precisa: `{{variavel}}` (escapado — o campo de pedidos específicos é texto digitado por alguém, sem escapar isso é uma injeção de HTML de manual) e `{{#each lista}}...{{/each}}` (tabela de mobília, lista de locatários). Se o catálogo de modelos crescer e precisar de condicionais/loops aninhados, trocar por Handlebars é uma mudança isolada nessa única função — nada que a chama precisa saber como o merge é feito por dentro.

**Não implementado nesta rodada, de propósito**: persistir o HTML final em `documentos_gerados` + storage. Fazer isso direito depende de onde o arquivo fica guardado (Supabase Storage, ainda bloqueado por credencial — `docs/09`) — gravar um `storage_path` que aponta para lugar nenhum seria pior que não gravar. `gerarContratoHtml` hoje só devolve a string HTML; a integração com storage é o próximo passo natural quando o Supabase existir.

### 3. Exemplo de template (Visual Law) — Florianópolis

`server/legaldesign/modelos/florianopolis.html` — o conteúdo que uma linha em `modelos_contrato.corpo_html` teria. Renderizado com dados de exemplo (o próprio contrato da Kitnet 16, já público neste projeto) num artifact publicado nesta conversa.

Aplicação prática do Visual Law:
- **Quadro-resumo** no topo (imóvel, modalidade, valor, vencimento, prazo, garantia) — quem quer saber "quanto, quando, com quem" não precisa ler o documento inteiro.
- **Fonte sem serifa do sistema** (`-apple-system, Segoe UI, Roboto, Helvetica Neue, Arial`) — decisão deliberada, não só estética: fontes web carregadas de CDN podem falhar silenciosamente numa conversão headless para PDF (a mesma classe de risco que o pedido original queria evitar ao mencionar "custo zero" e "sem dependência de terceiros"); fonte de sistema nunca falha em carregar.
- **`line-height: 1.5`**, tabelas para as partes e para a mobília, caixas de alerta (`.caixa-alerta`, borda lateral colorida) para multa por atraso e para a bonificação de dezembro — exatamente os dois pontos que mais geram dúvida/disputa num contrato de locação.
- **Cláusulas fixas com evidência real**: a estrutura do valor único mensal (55/45), os degraus de multa/juros, a bonificação de dezembro — tudo já confirmado contra o contrato real assinado da Kitnet 16 (`docs/10-auditoria-contrato-real.md`, Anexos I-VI), não inventado para preencher o modelo. Ainda assim, isto é um **modelo**: precisa de revisão jurídica antes de qualquer uso em produção, porque nenhuma cláusula fixa foi confirmada contra um segundo contrato de Florianópolis ainda.

**Curitiba não tem modelo pronto ainda**: os três contratos reais de Curitiba já auditados (`docs/11`) confirmam a estrutura de `contrato_componentes_mensais` (IPTU/condomínio repassados, sem o rateio de custeio coletivo de Florianópolis), mas não temos o texto corrido das cláusulas fixas de nenhum deles — diferente de Florianópolis, onde temos os Anexos I-VI completos. Escrever um modelo de Curitiba agora seria inventar cláusula sem evidência, o mesmo erro que este projeto evita desde `docs/10`.

## Análise de custo-benefício: conversão HTML → PDF

Você pediu para eu recomendar em vez de assumir Puppeteer de cara. Três opções reais para a stack (Next.js em Vercel):

| Opção | Custo | Onde funciona bem | Onde atrapalha |
|---|---|---|---|
| **Puppeteer/Playwright + `@sparticuz/chromium`** | Zero licença; paga só tempo de execução serverless | Fidelidade visual total ao HTML/CSS — exatamente o que Visual Law exige (cores, caixas de alerta, tabelas) | Bundle da função cresce (~50MB do Chromium), cold start mais pesado, precisa de mais memória/tempo configurados na função Vercel |
| **`@react-pdf/renderer`** | Zero licença | Documentos curtos e estruturados (declaração de residência, notificação) | Não lê HTML/CSS existente — é outro modelo de layout (mais parecido com React Native). Reescreveria o modelo HTML já pronto em outra linguagem de componente, jogando fora o trabalho desta rodada |
| **API hospedada (PDFShift, DocRaptor)** | Grátis até um teto baixo de documentos/mês, depois cobra por documento | Zero infraestrutura própria | Mais um fornecedor externo, e o volume de contratos de uma imobiliária deste porte passa o teto grátis rápido — deixa de ser "custo zero" no médio prazo |

**Recomendação**: Puppeteer (ou Playwright, equivalente) + `@sparticuz/chromium`, especificamente para contrato — é o único das três opções que usa o HTML/CSS exatamente como já foi desenhado, sem reescrever nada. `@react-pdf/renderer` continua sendo a escolha certa para os documentos curtos (declaração de residência, notificação de infração — ver auditoria do portal do inquilino), mas contrato é documento longo com layout rico — exatamente o caso onde vale pagar o atrito extra do Chromium serverless.

**Não instalado nesta rodada**: adicionar `puppeteer-core`/`@sparticuz/chromium` ao `package.json` é uma decisão de infraestrutura (tamanho de bundle, memória/timeout da função Vercel) que preferi deixar para você confirmar antes de mexer em dependências de produção — a função `gerarContratoHtml.ts` já devolve o HTML pronto; o passo de "virar PDF" é uma função fina por cima dela (`renderizarContratoPdf.ts`, não escrita ainda), que só um `await page.setContent(html); await page.pdf()` separa de existir.

## O que ainda falta para operar (não construído nesta rodada)

- **Persistência em `documentos_gerados` + storage** — depende do Supabase existir (docs/09).
- **Conversão para PDF de fato** — análise acima feita, biblioteca não instalada (decisão de infraestrutura pendente da sua confirmação).
- **Telas de gestão**: CRUD de `modelos_contrato` (hoje só existe a tabela — cadastrar um modelo novo exige INSERT manual), CRUD de `comodos`/mobília por cômodo, e o formulário dinâmico de geração de contrato (tela onde a gestão preenche partes/garantia/pedidos específicos e clica "gerar"). Backend pronto, zero UI ainda — mesmo padrão já visto nas últimas rodadas de auditoria deste projeto.
- **Modelo de Curitiba** — precisa do texto corrido de pelo menos um contrato real de Curitiba (como os Anexos I-VI resolveram para Florianópolis) antes de eu poder escrever as cláusulas fixas com a mesma confiança.

## Verificação

Schema aplicado do zero num Postgres real sem erro. `server/legaldesign/mesclarTemplate.ts` com 9 testes unitários (substituição escapada, bloco `#each`, injeção de HTML tentada via formulário bloqueada). `server/integracao/gerarContratoHtml.ts` com 4 testes de integração contra Postgres real: kitnet integral fim a fim, co-living isolando corretamente a mobília do cômodo certo (não vaza mobília do Quarto 2 para o contrato do Quarto 1), erro claro quando a cidade não tem modelo cadastrado, e a trigger do banco rejeitando um contrato tentando linkar um cômodo de imóvel que não permite co-living. Exemplo renderizado ponta a ponta com os dados reais da Kitnet 16 e publicado como artifact para inspeção visual.
