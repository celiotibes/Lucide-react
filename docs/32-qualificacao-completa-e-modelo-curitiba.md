# Qualificação Completa do Locatário, Modelo de Curitiba e o Que Continua Bloqueado

Você pediu para desenvolver os 10 itens listados como "não construídas por falta de decisão ou evidência" no mapa de funcionalidades, usando 3 contratos reais de Curitiba (Sala Comercial 923-B/Inspira Business — o mesmo já auditado em docs/11, apesar do nome do arquivo dizer "593b"; Life Space Estação 509-B, contrato de 2024 com o locatário Lucas; Apto 503/Central Station, contrato novo com o locatário Bergson Juan e a responsável financeira Maisa) como base "para o que for aplicável".

Lidos os 3 contratos por completo: **2 dos 10 itens têm evidência real neles** e foram desenvolvidos nesta rodada. Os outros **8 continuam sem nenhuma evidência de negócio nos documentos** — implementá-los seria inventar regra, o mesmo erro que este projeto evita desde o início (e que já causou bugs reais quando aconteceu por engano, docs/10). Em vez de forçar os 10, o critério foi o de sempre: construir o que os dados sustentam, documentar honestamente o que não sustentam.

## O que os 3 contratos confirmaram e virou código

### 1. Qualificação completa do locatário + responsável financeiro solidário + garantias múltiplas

Os 3 contratos mostram, de forma consistente, uma qualificação completa do locatário (RG, profissão, estado civil) que o formulário de cadastro nunca coletava — apesar do schema já ter essas colunas desde uma rodada anterior (`pessoas.rg/profissao/estado_civil`). O Apto 503/Central Station tem ainda um **"LOCATÁRIO/COMANDATÁRIO 2 (RESPONSÁVEL FINANCEIRO)"**, pessoa distinta do locatário/ocupante — mapeia direto para `contrato_partes.papel = 'responsavel_solidario'`, que também já existia no schema (introduzido para o caso da Kitnet 16, docs/10) mas nunca tinha um segundo contrato confirmando o padrão. E tanto o Apto 503 quanto o Life Space Estação 509-B somam **duas garantias por contrato** — uma para a locação, outra para o aditivo de comodato de bens móveis, com valores diferentes — exatamente o que `garantias.finalidade` (`'locacao'|'comodato'|'geral'`) já modelava sem nunca ter sido usado.

**`app/contratos/logicaCadastro.ts` e `app/contratos/novo/FormularioContrato.tsx`** ganharam:
- Campos de RG, profissão e estado civil do locatário.
- Seção opcional "Responsável financeiro solidário" (nome, CPF, RG, profissão) — grava como `contrato_partes` com papel `responsavel_solidario`.
- Lista dinâmica de garantias (0, 1 ou mais linhas — "+ Adicionar garantia"), cada uma com tipo, valor, finalidade e forma de pagamento.

6 testes de integração novos cobrindo os casos reais: qualificação completa gravada, estado civil inválido rejeitado, responsável solidário como parte distinta, duas garantias somadas ao mesmo contrato, garantia com valor inválido rejeitada.

### 2. Modelo de contrato de Curitiba com cláusulas fixas reais

Os 3 contratos, lidos por completo (não só a estrutura, o texto corrido), confirmam **de forma unânime** duas cláusulas que agora viram texto fixo nos modelos `curitiba-residencial.html` e `curitiba-comercial.html` (antes só existiam como placeholder para cláusulas específicas de cada contrato):

- **Multa por infração contratual geral (distinta da multa rescisória por saída antecipada): 3 aluguéis vigentes à época da infração** — os 3 contratos concordam nesse valor exato, incluindo o comercial.
- **Vistoria por registro fotográfico/vídeo em Grupo de WhatsApp** — os 2 contratos residenciais descrevem o mesmo mecanismo.

E duas cláusulas confirmadas nos 2 contratos residenciais (não generalizadas ao comercial, que só tem 1 amostra e usa um prazo diferente para a mesma cláusula):
- **Direito de preferência de compra com 15 dias para manifestação** (residencial) vs. **10 dias** (o único comercial, mantido como estava).
- **Autorização de citação/intimação por WhatsApp/e-mail para o Juizado Especial da comarca do imóvel**.

O que **continua** fora do modelo fixo, por divergência real confirmada entre os 3 contratos (não por falta de evidência — pelo contrário, a evidência mostra que não há padrão único): a fórmula de multa rescisória por saída antecipada é diferente nos 3 (Sala Comercial: 3 meses de aluguel se sair antes de 12 meses; Life Space: 50% do prazo restante até 12 meses, limitado a 3 aluguéis; Apto 503: 3 salários mínimos) — continua em `clausulas_adicionais_html`, contrato a contrato, como já era.

O motor (`server/integracao/gerarContratoHtml.ts`) foi ajustado para listar **todas** as garantias do contrato (antes só pegava a mais recente com `limit 1`) — os campos singulares (`garantia_tipo` etc.) continuam existindo para não quebrar o modelo de Florianópolis (1 garantia só, confirmado pela Kitnet 16), mas agora há também `garantias` (lista), usada pelos dois modelos de Curitiba.

### Bug real encontrado e corrigido no motor de template

Ao colocar `{{#each garantias}}` dentro do **comentário HTML de documentação** de um dos modelos (para explicar a mudança), descobri que `server/legaldesign/mesclarTemplate.ts` processa o arquivo inteiro, comentário incluído — a abertura de bloco sem fechamento dentro do comentário "roubava" o `{{/each}}` do primeiro bloco funcional de verdade mais abaixo, quebrando a renderização. Corrigido reescrevendo os comentários sem a sintaxe literal de placeholder, e travado com um teste de regressão em `mesclarTemplate.test.ts` (dois blocos `{{#each}}` reais e sequenciais com o mesmo nome de lista, sem comentário perigoso no meio, continuam funcionando corretamente).

## O que continua sem evidência ou decisão — não implementado, por quê

Nenhum dos 3 contratos traz qualquer evidência sobre os outros 8 itens da lista original. Implementá-los agora seria inventar:

1. **Rateio de excedente hídrico entre unidades** — os 3 imóveis são unidades individuais (studio, sala, apartamento), sem medição de água compartilhada entre múltiplas unidades de um mesmo prédio. O Life Space até confirma o oposto do que precisaríamos: água está incluída na taxa condominial, sem individualização ("em havendo eventual implantação de medidores individualizado de água... será de responsabilidade do inquilino/condômino").
2. **Motor de cobrança avulsa** (chave reserva, lavanderia) — nenhum dos 3 contratos menciona esses serviços.
3. **Fundos de reserva (FRO/CAPEX)** — nenhuma menção a percentual de retenção em nenhum dos 3.
4. **Fórmula de pagamento a prestadores** — contratos de locação não tratam de remuneração de prestador de serviço.
5. **Fila/departamento de atendimento** — fora do escopo de um contrato de locação.
6. **CRUD de cômodos (co-living)** — nenhum dos 3 é co-living (studio individual, sala comercial, apartamento inteiro); sem evidência nova. Diferente dos outros 7: este não depende de decisão de negócio, é só tela que falta escrever (schema e motor de contrato já suportam `comodos`) — candidato natural de uma próxima rodada, sem risco de inventar regra.
7. **Vistorias de entrada/saída estruturadas** — os 3 contratos descrevem vistoria informal via WhatsApp (já refletido na cláusula fixa nova), não um checklist estruturado com campos próprios — permanece fora de escopo por falta de gatilho de negócio, como já estava documentado.
8. **Jurídico, marketing/leads, WhatsApp não-oficial** — descartados por decisão deliberada anterior (entrada manual por definição, fase de produto diferente, risco de banimento), não por falta de dado — nenhum contrato de locação resolveria isso de qualquer forma.

## Verificação

Sem mudança de schema nesta rodada (todas as colunas usadas já existiam). Typecheck, lint e build limpos. 321 testes totais (314 + 7 novos: 6 em `logicaCadastro.integration.test.ts`, 1 em `gerarContratoHtml.integration.test.ts` para garantias múltiplas, 1 de regressão em `mesclarTemplate.test.ts`), 3 execuções consecutivas limpas contra banco recriado do zero em cada rodada. Os dois modelos de Curitiba atualizados foram validados por um script direto contra o motor real (não só os testes automatizados) confirmando zero placeholder não resolvido no HTML final.
