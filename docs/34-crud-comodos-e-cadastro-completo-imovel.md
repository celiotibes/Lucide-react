# CRUD de Cômodos e Cadastro Completo do Imóvel

Continuação automática do "o que falta" — o item de docs/32 que não é bloqueio de decisão, é só tela que faltava escrever: `comodos` (co-living por quarto) já era lido por `server/integracao/gerarContratoHtml.ts` desde docs/27, mas não existia nenhuma forma de cadastrar um cômodo pela interface — só direto no banco.

## `app/imoveis/[id]` — tela de detalhe (nova)

Primeira tela de detalhe de imóvel do sistema (só existiam lista e cadastro). Mostra os dados do imóvel e, quando `permite_coliving = true`, a lista de cômodos ativos com um formulário para adicionar novo (identificação, área, valor de referência do cômodo isolado) e um botão para desativar. Quando o imóvel não permite co-living, a seção explica por quê em vez de esconder silenciosamente — cadastrar um cômodo ali não teria efeito, já que um contrato só pode vincular `comodo_id` quando `permite_coliving` é verdadeiro (trava do próprio banco, já existente).

## Cadastro de imóvel ganha os campos que faltavam

Ao construir a tela de cômodos, notei que `app/imoveis/novo` nunca coletava `endereco`, `permite_coliving` nem o `valor_avaliacao` (novo em docs/33) — todos já existiam no schema, só não eram perguntados no formulário. Os três agora fazem parte do cadastro:
- **Endereço** — existia desde o início do schema, nunca tinha campo no formulário.
- **Permite co-living** — checkbox; sem isso, o único jeito de habilitar um imóvel para `comodos` era editar direto no banco.
- **Valor de avaliação** — evita ter que ir em `app/patrimonio` logo depois de cadastrar um imóvel novo só para preencher esse campo.

## Verificação

Sem mudança de schema (todas as colunas já existiam). Verificado ponta a ponta chamando as Server Actions diretamente contra Postgres real: criar cômodo, listar, desativar. 2 testes de integração novos em `app/imoveis/logicaCadastro.integration.test.ts` (endereço/permite_coliving/valor_avaliacao gravados corretamente; valor de avaliação negativo rejeitado). 335 testes totais, 3 execuções consecutivas limpas contra banco recriado do zero em cada rodada, build/lint/typecheck limpos.
