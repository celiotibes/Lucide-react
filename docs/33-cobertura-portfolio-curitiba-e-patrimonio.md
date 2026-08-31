# Cobertura do Portfólio de Curitiba e Patrimônio Líquido por Imóvel

Você pediu para revisar se todos os imóveis de Curitiba estão contemplados, listando 7 unidades: Apto 509-B (Life Space Estação, propriedade de Avani Elvira) com vaga 37, Apto 151-A (Vega to Live) com vaga 227, Apto 176-B (Igloo, residência do próprio Célio) com vaga 200, Apto 193-B (Igloo) com vaga 157, Sala Comercial 923-B (Inspira Business) com vaga, e Apto 503 (Central Station, sem vaga) — todos financiados, o 151-A por consórcio com hipoteca.

## Auditoria de cobertura

| Imóvel | Antes desta rodada | Depois |
|---|---|---|
| Apto 509-B, Life Space Estação | ✅ Contrato real (docs/11, docs/32) | Sem mudança |
| Sala Comercial 923-B, Inspira Business | ✅ Contrato real | Sem mudança |
| Apto 503, Central Station | ✅ Contrato real | Sem mudança |
| Apto 151-A, Vega to Live | ❌ Nunca mencionado | ✅ Você enviou o contrato real vigente (renovado, 2024) — auditado e cadastrado |
| Apto 193-B, Igloo | ⚠️ Ambíguo | Você esclareceu: vago, destinado a locação por temporada/Airbnb — cadastrado como imóvel disponível, sem contrato |
| Apto 176-B, Igloo | ⚠️ Ambíguo | Você esclareceu: residência do próprio Célio, pessoa física — não é imóvel de locação, cadastrado só para fins patrimoniais |

Vagas de garagem (37, 227, 200, 157) não viram imóveis próprios no cadastro — nos 2 contratos que têm vaga (509-B e 151-A), ela é um componente mensal do mesmo contrato (`contrato_componentes_mensais.tipo = 'vaga_garagem'`), exatamente como os contratos reais descrevem. Não há vaga vinculada a 193-B/176-B por não haver contrato de locação para eles ainda.

## O 4º contrato residencial confirma o padrão

O contrato do Apto 151-A (Vega to Live, locatário Gustavo Moreira da Silva, vigente desde 30/07/2024) segue a mesma estrutura dos outros 3 já auditados: locação + aditivo de comodato + intermediação de despesas condominiais. Reforça, agora com 4/4 contratos concordando, a multa por infração geral (3 aluguéis), e com 3/3 residenciais, a vistoria por WhatsApp, o direito de preferência de 15 dias e a citação por WhatsApp/Juizado Especial — já fixadas no modelo (docs/32), atualizadas com essa 4ª confirmação.

A multa rescisória por saída antecipada continua **sem** fórmula fixa — o 151-A usa "3 salários mínimos", igual ao Apto 503, mas ainda é só 2 de 4 contratos convergindo (Sala Comercial usa "3 meses de aluguel"; Life Space usa "50% do prazo restante, limitado a 3 aluguéis") — não é maioria suficiente para virar regra do modelo.

## Financiamento/hipoteca por imóvel e patrimônio líquido

Você definiu: o financiamento deve constar de cada imóvel, servir para apurar o **patrimônio líquido mensal** (por imóvel e consolidado) e também entrar nas **despesas fixas recorrentes do negócio**.

- **Schema** (seção 31): `imoveis.valor_avaliacao` (novo, opcional) e `financiamentos_imoveis` (novo — tipo `financiamento_bancario` ou `consorcio_hipoteca`, distinguindo o caso do 151-A dos demais; instituição, valor financiado, valor da parcela, saldo devedor, data de início, número de parcelas, status ativo/quitado). Um imóvel pode ter mais de um financiamento ao longo do tempo (quitado um, contratado outro) — por isso é tabela própria, não colunas em `imoveis`, mesmo padrão de `garantias`.
- **`server/financeiro/patrimonioLiquido.ts`** (função pura) — patrimônio líquido = valor de avaliação − soma do saldo devedor dos financiamentos ativos. Sem valor de avaliação cadastrado, devolve `null` explícito em vez de estimar (mesmo princípio de "dado insuficiente é pulado, não vira número inventado" já usado em `faturarEnergia.ts`/`calcularAuditoriaEnergiaSolar.ts`). Despesa fixa mensal = soma das parcelas ativas. 12 testes (7 unitários, 5 de integração).
- **`app/patrimonio`** (nova tela) — lista todos os imóveis com valor de avaliação editável, financiamentos ativos (com botão "marcar quitado"), patrimônio líquido calculado por linha, e dois cards de resumo consolidado (patrimônio líquido total, despesa fixa mensal total) — sinalizando explicitamente quantos imóveis ainda não têm avaliação cadastrada, para deixar claro quando o consolidado está incompleto. Formulário para registrar novo financiamento. Verificado ponta a ponta chamando a Server Action diretamente contra Postgres real.

**Não incluído, porque não é código que falta — é número que só você tem**: valor de avaliação de cada imóvel, e o valor da parcela/saldo devedor/instituição de cada financiamento (inclusive o do 151-A, que você confirmou ser consórcio com hipoteca, mas sem os números). A estrutura está pronta em `app/patrimonio` para você preencher assim que tiver os dados.

## Dados reais do portfólio: por que não foram commitados

Os 4 contratos reais trazem CPF, RG, nome completo, e-mail e telefone de pessoas físicas (locatários, responsável financeira) — dado pessoal de terceiros protegido por LGPD. Gerar um script SQL de seed com esses dados e commitá-lo no GitHub seria expor informação sensível de forma desnecessária (o repositório não precisa desses dados para funcionar — são dados de produção, não de teste). Mesmo tratamento já dado às credenciais do ShinePhone/Growatt nesta sessão: **segredo ou dado sensível real nunca entra em arquivo versionado**.

O script `seed-portfolio-curitiba-DADOS-REAIS.sql` com os 4 contratos completos (pessoas, imóveis, contratos, componentes mensais, garantias — todos os valores extraídos fielmente dos PDFs, incluindo uma divergência aritmética real encontrada no próprio contrato do Apto 503, registrada como está, não corrigida) foi gerado, validado rodando contra o Postgres local (schema aplicado do zero, sem erro) e a geração de contrato HTML testada para os 4 (zero placeholder residual) — mas entregue como arquivo separado para você, fora do repositório. Aplicar quando o banco de homologação/produção existir (`docs/09`).

## Verificação

Schema aplicado do zero sem erro (seção 31 nova). 12 testes novos de patrimônio líquido (7 unitários + 5 de integração), 3 execuções consecutivas limpas contra banco recriado do zero em cada rodada, build/lint/typecheck limpos. Os 4 contratos reais de Curitiba validados contra os modelos atualizados via script direto (não parte da suíte automatizada, porque usa dado real — mesma cautela do seed).
