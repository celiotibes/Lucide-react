# Câmeras, Chave Reserva e Internet Particular: Três Pedidos com Regra Própria

Depois de enviar os Anexos I-VI de Florianópolis (docs/10, "Sétimo achado"), você esclareceu três pontos e pediu mais dois fluxos novos. Este documento fecha essa rodada.

## O esclarecimento sobre "fatura de água como comprovante"

Não é sobre o inquilino: é sobre o **proprietário**. A ideia é usar um comprovante (conta de água em nome do proprietário, ligada ao endereço do imóvel) para provar o vínculo entre a pessoa e o imóvel sem exigir o envio da matrícula — documento mais caro e burocrático de obter. Isso não tem código associado ainda (é um campo de cadastro de documentação do proprietário/imóvel, não um cálculo ou regra de negócio), mas fica registrado aqui para não se perder: é dado de `imoveis`/`pessoas`, não do portal do inquilino.

## Câmeras de segurança: o padrão do Anexo III continua sendo negar

Você confirmou: o pedido do inquilino não é aprovado pelo admin — vira **análise do jurídico**, que verifica se há alguma exceção legal aplicável, mantendo a regra do Anexo III (vedação, salvo ordem judicial/policial) como padrão. Implementado:

- `ordens_servico.natureza` ganhou um quinto valor, `'juridico'` (schema seção 26.1) — os quatro anteriores (emergência/financeiro/contratual/manutenção) não descreviam "isto precisa de análise jurídica antes de qualquer resposta".
- SLA de 5 dias úteis (`sla_politicas`) — não especificado por você para este caso específico; usei o mesmo prazo que o próprio Anexo III usa em toda parte que envolve manifestação formal (item C.1-A: 5 dias úteis para o inquilino se manifestar sobre uma multa), em vez de inventar um número novo. Ajustável sem deploy, mesmo padrão de `manutencao` (48h, também não especificado, também ajustável).
- `solicitacoes_imagens_cameras`: dia, horário e justificativa (os três dados que você pediu explicitamente) são campos obrigatórios. `status` começa em `'em_analise_juridica'` e só sai dali para `'excecao_legal_deferida'` ou `'indeferida_regra_padrao'` — uma constraint do banco (`chk_parecer_quando_decidido`) impede gravar qualquer uma das duas decisões sem preencher `parecer_juridico` também, para que nunca exista uma liberação sem registro do porquê.
- `server/integracao/solicitarImagensCameras.ts` só abre o chamado — a decisão em si é manual, feita por quem tem competência jurídica, e continua fora do alcance de qualquer automação.

## Chave reserva/cópia: a tarifa é do contrato, não do sistema

Anexo II, item 2: "Chaveiro (abertura/perda) — R$ 140,00" — só que esse valor é específico deste contrato, não uma constante do CRMT (mesmo cuidado já registrado em docs/10 para juros/multa). Em vez de uma coluna isolada só para isso, `contrato_tarifario_servicos` (schema seção 26.2) generaliza a "Planilha de Taxas de Manutenção e Higienização" inteira do Anexo II — chaveiro, desentupimento, pintura, limpeza pesada, etc. — por contrato. Serve para chave reserva agora e para indenização de sinistro (Anexo II item 5) quando esse fluxo for construído, sem precisar de uma segunda tabela.

`server/integracao/solicitarChaveReserva.ts` abre o chamado (natureza `manutencao`) e devolve o valor previsto se o contrato já tiver essa linha cadastrada — `null` sem quebrar nada, caso contrário. **Não emite cobrança** — como o pacote de lavanderia (docs/10), a forma de cobrar (avulsa no ato ou no próximo boleto) depende de um motor de cobrança avulsa que ainda não existe.

## Autorização de internet particular: a orientação técnica é dado do prédio, não do código

Pedido novo: um fluxo de autorização administrativa para o inquilino instalar internet particular (diferente do wi-fi coletivo do Anexo IV item 3), com orientação de como fazer isso na estrutura do imóvel. A parte de fluxo é direta — `server/integracao/solicitarAutorizacaoInternetParticular.ts` abre um chamado de natureza `contratual` (é autorização da gestão, não uma emergência de manutenção).

A parte de conteúdo (por onde passa a fiação, se pode furar parede, onde fica o rack) **não foi inventada** — é informação física de cada prédio que só quem conhece a estrutura real tem. Ficou como `imoveis.orientacoes_instalacao_internet`, um campo de texto cadastrável pelo admin, nulo até alguém preencher. A função devolve o texto se existir e sinaliza claramente quando ainda não foi cadastrado, em vez de gerar uma instrução genérica de instalação que poderia estar errada para aquele prédio específico.

## Verificação

Schema aplicado do zero num Postgres real sem erro (as duas novas tabelas, o quinto valor de `natureza`, a nova política de SLA, a nova coluna em `imoveis`). `abrirChamado.ts` teve o tipo do parâmetro `pool` ampliado de `Pool` para `Pool | PoolClient` — mudança compatível para trás — para que `solicitarImagensCameras` pudesse abrir o chamado dentro da mesma transação que grava a linha em `solicitacoes_imagens_cameras`, sem duplicar a lógica de protocolo/SLA. 239 testes (unitários + integração), 3 execuções consecutivas limpas contra banco recriado do zero, build/lint/typecheck limpos.
