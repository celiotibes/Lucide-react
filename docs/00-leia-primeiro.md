# CRMT Gestão Imobiliária — Projeto de Sistema

Este diretório contém a análise e a arquitetura do sistema de gestão para a CRMT Gestão Imobiliária LTDA (locação por contrato — Lei do Inquilinato — e locação por temporada, com portfólio em Curitiba e Florianópolis).

O material de origem foi uma sequência de 8 rodadas de conversa com um assistente Gemini que foi inflando o escopo a cada mensagem (de "CRM" a "plataforma de Asset Management institucional") sem nunca produzir um artefato técnico. Este trabalho parte daquele material, mas **audita, corrige e prioriza** em vez de simplesmente aceitar a escalada de escopo — ver `01-auditoria-critica.md` para o raciocínio completo por trás de cada divergência.

## Ordem de leitura recomendada

1. **`01-auditoria-critica.md`** — por que a proposta anterior não podia ser implementada como estava; decisões corrigidas.
2. **`02-gap-analysis.md`** — o que faltou por completo (jurídico específico da Lei do Inquilinato, temporada/Airbnb, tributário municipal, segurança, continuidade).
3. **`03-arquitetura-e-stack.md`** — a stack técnica final e por quê (substitui Streamlit por Next.js único; mantém Supabase e Asaas; trata n8n como orquestrador, não motor financeiro).
4. **`04-roadmap-fases.md`** — o que entregar em cada fase, com critério objetivo de saída de cada uma.
5. **`05-riscos-e-custos.md`** — estimativa de custo mensal real (não "tudo grátis") e matriz de risco/mitigação.
6. **`06-benchmark-mercado.md`** — o que foi incorporado (e o que foi deliberadamente descartado) a partir da análise de Superlógica, Imoview, Imobzi, Rentila, Apresenta.me, Vista e Alude.
7. **`07-selecao-de-ia-e-custos.md`** — qual provedor de IA (Gemini, Claude, Ollama, Grok) usar em cada tarefa do sistema, com preços verificados por pesquisa e o achado de que o custo de IA é irrelevante frente ao resto do orçamento; inclui a correção de dois erros de estimativa de custo (PITR do Supabase, plano gratuito da Vercel).
8. **`08-auditoria-stress-test.md`** — o ciclo de auditoria que simulou os papéis reais do Supabase (não superusuário) e achou 9 bugs reais no schema (RLS bloqueando o próprio admin, prestador sem conseguir gravar check-in, valores negativos aceitos, soma de propriedade societária podendo passar de 100%) — todos corrigidos e reverificados.
9. **`../database/schema.sql`** — o schema relacional completo (PostgreSQL/Supabase), pronto para ser aplicado em ambiente de homologação. Validado rodando em Postgres real com simulação de RLS por papel (não só lido, não só como superusuário) — ver `../database/README.md` e doc 08.
10. **`../server/ai-gateway/`** — código real (TypeScript + testes) que implementa as regras do doc 07: bloqueio de camada gratuita de IA com dado pessoal, bloqueio de *credit scoring* via LLM, roteamento fixo por tarefa. Rodar com `npm test`.
11. **`../server/financeiro/`** e **`../server/energia/`** — cálculo de juros/multa, pró-rata do primeiro mês, split de pagamento (também usado como motor de rateio entre unidades), rendimento de caução e faturamento de energia com franquia mínima, como código testado (48 testes, incluindo um stress-test de 300 combinações aleatórias de split). Primeira implementação real da decisão "lógica financeira crítica não vive em n8n" (doc 03).

## Resumo executivo

- **O que muda em relação à proposta anterior:** faseamento agressivo com MVP entregável em 6-8 semanas (Fase 0: cadastro + contratos + faturamento Asaas + régua de cobrança + portal do inquilino básico); stack unificada em Next.js + Supabase + Asaas + n8n (orquestração apenas); cap table/diluição societária automática substituída por um ledger auditável com mudanças de propriedade sempre manuais e documentadas; provisão de contingência jurídica amarrada à regra técnica correta (CPC 25); OCR de medidor/nota fiscal sempre com confirmação humana antes de virar cobrança oficial.
- **O que é novo e não estava em nenhuma rodada anterior:** prevenção de overbooking de temporada a nível de banco de dados (constraint de exclusão, não só alerta), seguro-incêndio obrigatório por lei, direito de preferência do locatário, ISS sobre hospedagem/temporada, convenção de condomínio como bloqueio jurídico a temporada, backup/disaster recovery e separação de ambientes como pré-requisito (não opcional) da Fase 0, estimativa de custo mensal real da stack, emissão de NFS-e e extrato mensal automático do proprietário (benchmark de mercado), e a constatação de que custo de IA não é o gargalo financeiro do projeto (é a hospedagem/Supabase/Asaas/WhatsApp que pesa).
- **Próximo passo concreto:** aplicar `database/schema.sql` em um projeto Supabase de homologação e iniciar a Fase 0 (`docs/04-roadmap-fases.md`).
