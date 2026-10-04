# Relatório Executivo: origem dos dados por seção

Rotas: `GET /api/relatorios/executivo/{dashboard,margens,download/:mes/:ano}`,
`POST /api/relatorios/executivo/{gerar,enviar-email}`.
Código: `server/src/domain/relatorios/relatorio-executivo.ts`.

## Por que existe a marcação "indisponível"

O banco do servidor (SQLite, criado por `database-init.ts` + migrações) guarda autenticação,
auditoria, ACL, eventos externos, integrações (Asaas, Pluggy, Telegram), lembretes agendados,
a fila de propostas `razao` da conciliação PIX/OFX, etc. O **razão canônico (`ledger_entries`),
imóveis, transações e cobranças do negócio vivem no navegador** (IndexedDB/sql.js) e não são
enviados ao servidor. Tabelas como `transacoes`, `imoveis`, `cobrancas`, `asaas_cobrancas` e
`plano_de_contas` **não existem** no servidor (ver o comentário em
`migrations-phase11-performance-indexes.sql`), e `dre_periodos`/`fluxo_periodos` só seriam
preenchidas por um cálculo ainda não implementado.

Antes, o relatório consultava essas tabelas dentro de `try/catch` silenciosos, devolvia zeros
e, no fluxo de caixa, **sorteava saldos com `Math.random()`**. Agora a regra é: **nenhum número
é estimado, sorteado ou zerado para parecer completo**. Cada seção ou traz dados reais de uma
tabela que existe, ou vem como:

```json
{ "indisponivel": true, "motivo": "...", "fonteEsperada": "...", "tabelasAusentes": ["..."] }
```

A resposta traz também `secoesIndisponiveis: string[]` e `completo: boolean`. A rota nunca
responde 500 por "no such table": a existência das tabelas é verificada em `sqlite_master`
antes de qualquer consulta.

## Seções

| Seção | Origem no servidor | Estado hoje (banco real do servidor) |
|---|---|---|
| `razaoServidor` | tabela `razao` (migrations-phase8), filtrada por `criado_em` no mês; agrupa por `tipo`/`status`, soma `valor` **sem conversão de unidade** | **Disponível**. É a fila de propostas da conciliação PIX/OFX, não a DRE nem o razão canônico (o campo `aviso` diz isso). Sem a tabela: indisponível |
| `margens` | `imoveis` + `transacoes` (via `calcularMargensImovel`) | **Indisponível** enquanto essas tabelas não existirem. Se existirem (ex.: banco que as receba no futuro), é calculada de fato; imóvel cuja margem falhar é logado e omitido |
| `dre` | razão canônico (cliente). `calcularDREPeriodo` é um stub que retorna zeros e `dre_periodos` só guarda esses snapshots | **Indisponível** sempre no servidor |
| `fluxo` | saldo/histórico de `transacoes` + `plano_de_contas` (inexistentes); `fluxo_periodos` não é alimentada | **Indisponível** (sem projeções sem base real) |
| `contas` (a receber/pagar) | `asaas_cobrancas`/`cobrancas` e `transacoes` (inexistentes) | **Indisponível** |
| `sumario` | combina DRE, fluxo, contas e cadastro de imóveis | **Indisponível**; o status geral não é inferido de dados parciais |
| `alertas` | derivados só de seções disponíveis (hoje: margem crítica, quando `margens` estiver disponível) | lista vazia quando nada é calculável |

`GET /margens` devolve a própria seção indisponível (HTTP 200) em vez de uma lista vazia
enganosa. O HTML de `download` e o corpo do e-mail mensal declaram explicitamente o relatório
como **parcial** e listam o motivo de cada seção.

## Caminho para um relatório completo

1. Preferível: o cliente (dono do razão canônico) calcula e exibe o executivo; o servidor só
   entrega o que ele próprio possui (`razaoServidor`) e o envio de e-mail.
2. Alternativa: o cliente publica ao servidor um snapshot mensal (DRE/fluxo/contas) e o
   servidor passa a ler essa tabela de snapshots; cada seção deixa de ser `indisponivel`
   assim que sua tabela existir e tiver dados.

## Testes

- `server/src/routes/__tests__/relatorio-executivo-degradacao.test.ts`: schema real do boot sem
  as tabelas (200, seções indisponíveis com motivo, nada de números inventados), com dados no
  `razao` (filtro de mês, virada de ano) e com `imoveis`+`transacoes` presentes (margens reais).
- `server/src/domain/relatorios/__tests__/relatorio-executivo.test.ts` e
  `server/src/routes/__tests__/relatorio-executivo-routes.test.ts`: contrato e validações.

## Observação para o cliente

`client/src/components/RelatorioExecutivoView.tsx` agora trata `completo === false`, exibindo o
que existe e os motivos das seções indisponíveis. A tela de abas completa (DRE, fluxo, etc.)
só é usada quando todas as seções vierem disponíveis.
