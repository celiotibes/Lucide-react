# Extrato do Proprietário e Conciliação Bancária

Segunda rodada de auditoria pedida explicitamente ("audite e veja se falta desenvolver algo"). Mapeei todas as ~65 tabelas do schema contra o código real: a maioria das que não têm nenhum writer é assim de propósito (jurídico é entrada manual de advogado — `database/README.md` já documenta isso; leads/anúncios/assinaturas são de uma fase de produto diferente; vistorias é uma feature grande sem gatilho ainda). Dois itens, porém, eram lacunas reais e diretamente conectadas ao pipeline fechado em `docs/17`.

## 1. Extrato do Proprietário

`investidor_ledger` finalmente recebe dado real desde `distribuirRecebimento.ts` (docs/17), mas nada agregava isso no documento que o próprio comentário do schema já citava como referência de mercado (Imobzi, "Extrato do Proprietário").

### `investidor_ledger.valor_bruto` (novo, nullable)

`credito_repasse.valor` grava o líquido (pós taxa de administração) — correto para o saldo corrido, mas insuficiente para mostrar "receita bruta" e "dedução" como linhas separadas no extrato. Em vez de reescrever o ledger em duas linhas por lançamento (mudaria a semântica de `saldo_apos` e quebraria os 9 testes já existentes de `distribuirRecebimento.ts` sem necessidade), o valor bruto vira uma coluna extra no mesmo lançamento — a mudança mínima que resolve o problema. `distribuirRecebimento.ts` agora grava os dois.

### `server/integracao/gerarExtratoProprietario.ts` (novo)

Dois níveis, gerados na mesma passada, por mês de competência:
- **Por imóvel**: receita bruta, dedução (taxa de administração) e valor repassado, com dois itens em `extrato_mensal_itens` ("Receita de aluguel" / "Taxa de administração").
- **Consolidado da carteira** (`imovel_id = null`, já previsto no schema): soma de todos os imóveis do proprietário no mês, com um item por imóvel (o repasse líquido de cada um).

**Achado de schema durante a implementação**: a constraint `unique (pessoa_id, imovel_id, competencia)` da tabela não protege o extrato consolidado contra duplicação — SQL padrão nunca considera dois `NULL` iguais numa unique constraint, então duas linhas com `imovel_id = null` para a mesma pessoa+mês não violariam nada no banco. A idempotência do consolidado é garantida em código (`not exists` antes de inserir), documentado explicitamente no comentário da função para quem for mexer nisso depois não assumir que o banco protege sozinho.

`documento_id`/`enviado_em`/`canal_envio` ficam em branco — mesma honestidade de `notificacoes_log.status = 'pendente_envio'` (docs/16): não geramos PDF nem fingimos um envio por WhatsApp/e-mail que não existe.

## 2. Conciliação Bancária via OFX (importação)

`transacoes_bancarias.origem` já previa `'ofx'` desde a fase de auditoria original, mas nenhum código lia um arquivo OFX — só o exportador (`docs/15`) existia, na direção contrária.

### `server/relatorios/ofx.ts` ganha `parsearOFX`

Direção inversa de `gerarOFX`, no mesmo arquivo. Escopo deliberado: só OFX 1.0 SGML (tags de linha única, fechamento opcional) — é o que a maioria dos bancos brasileiros exporta e o que este módulo já gera; não interpreta OFX 2.x baseado em XML, sem uma amostra real desse formato para verificar contra. Lida corretamente com o caso comum de bancos reais que **não fecham** `</STMTTRN>` entre transações (o parser separa por `<STMTTRN>` de abertura, não depende do fechamento) — testado explicitamente. 15 testes no arquivo, incluindo um round-trip completo (`gerarOFX` → `parsearOFX` devolve os dados originais).

### `investidor_ledger.referencia_externa` (novo) + `server/integracao/importarExtratoBancarioOFX.ts`

`transacoes_bancarias` não tinha nenhuma chave natural para saber se uma transação de um extrato já tinha sido importada antes — reimportar o mesmo arquivo (comum: baixar o extrato do mês de novo, cobrindo dias já importados) duplicaria lançamentos. FITID (o identificador que o próprio padrão OFX existe para resolver isso) virou a coluna `referencia_externa`, com índice único parcial por conta.

**Regra não negociável, já documentada no schema desde a auditoria original (item 8) e mantida sem exceção**: toda transação importada entra com `status = 'sugerido'`, nunca `'aprovado'` — só um humano confirmando manualmente na tela de conciliação pode aprovar. O código não tem nenhum caminho que pule essa etapa.

### Rota `app/api/contas-bancarias/[contaId]/importar-ofx`

Corpo da requisição é o texto bruto do arquivo `.ofx` (não multipart — mais simples de testar e chamar programaticamente). Sem autenticação própria: mesma situação de toda tela de back-office hoje (nenhuma tem login real ainda, docs/14).

## O que ficou de fora desta rodada — e por quê

**`fundos`/`fundo_movimentacoes` (reserva FRO/CAPEX/FPC)**: o schema já modela retenção de parte da receita antes do repasse ao proprietário (`fundos.teto_configurado` — "FRO para de reter ao atingir o teto"), mas **nenhum percentual de retenção está documentado em lugar nenhum** — nem em `fundos`, nem em `imovel_propriedade`. Construir a retenção automática exigiria inventar esse número. Mesma cautela já aplicada a `desconto_pontualidade` (docs/11) e à fórmula de energia solar (docs/10): fica como pergunta em aberto, não como suposição silenciosa no código.

**Jurídico, marketing, vistorias, NFS-e/documentos gerados**: fora de escopo por serem, respectivamente, entrada manual por definição (jurídico), fase de produto diferente (leads/anúncios/assinaturas), features grandes sem gatilho de negócio ainda (vistoria de entrada/saída), ou dependentes de uma decisão de ferramenta ainda não tomada (geração de PDF/certificado digital para NFS-e).

## Verificação

Schema aplicado do zero em Postgres real, suíte de integração completa em **6 execuções consecutivas** contra bancos recriados do zero, todas limpas. 232 testes no total (117 unitários + 115 de integração), build/lint/typecheck limpos.
