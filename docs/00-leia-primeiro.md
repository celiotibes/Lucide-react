# CRMT Gestão Imobiliária — Projeto de Sistema

Este diretório contém a análise e a arquitetura do sistema de gestão para a CRMT Gestão Imobiliária LTDA (locação por contrato — Lei do Inquilinato — e locação por temporada, com portfólio em Curitiba e Florianópolis).

O material de origem foi uma sequência de 8 rodadas de conversa com um assistente Gemini que foi inflando o escopo a cada mensagem (de "CRM" a "plataforma de Asset Management institucional") sem nunca produzir um artefato técnico. Este trabalho parte daquele material, mas **audita, corrige e prioriza** em vez de simplesmente aceitar a escalada de escopo — ver `01-auditoria-critica.md` para o raciocínio completo por trás de cada divergência.

## Ordem de leitura recomendada

1. **`01-auditoria-critica.md`** — por que a proposta anterior não podia ser implementada como estava; decisões corrigidas.
2. **`02-gap-analysis.md`** — o que faltou por completo (jurídico específico da Lei do Inquilinato, temporada/Airbnb, tributário municipal, segurança, continuidade).
3. **`03-arquitetura-e-stack.md`** — a stack técnica final e por quê (substitui Streamlit por Next.js único; mantém Supabase e Asaas; trata n8n como orquestrador, não motor financeiro).
4. **`04-roadmap-fases.md`** — o que entregar em cada fase, com critério objetivo de saída de cada uma.
5. **`05-riscos-e-custos.md`** — estimativa de custo mensal real (não "tudo grátis") e matriz de risco/mitigação.
6. **`../database/schema.sql`** — o schema relacional completo (PostgreSQL/Supabase), pronto para ser aplicado em ambiente de homologação.

## Resumo executivo

- **O que muda em relação à proposta anterior:** faseamento agressivo com MVP entregável em 6-8 semanas (Fase 0: cadastro + contratos + faturamento Asaas + régua de cobrança + portal do inquilino básico); stack unificada em Next.js + Supabase + Asaas + n8n (orquestração apenas); cap table/diluição societária automática substituída por um ledger auditável com mudanças de propriedade sempre manuais e documentadas; provisão de contingência jurídica amarrada à regra técnica correta (CPC 25); OCR de medidor/nota fiscal sempre com confirmação humana antes de virar cobrança oficial.
- **O que é novo e não estava em nenhuma rodada anterior:** prevenção de overbooking de temporada a nível de banco de dados (constraint de exclusão, não só alerta), seguro-incêndio obrigatório por lei, direito de preferência do locatário, ISS sobre hospedagem/temporada, convenção de condomínio como bloqueio jurídico a temporada, backup/disaster recovery e separação de ambientes como pré-requisito (não opcional) da Fase 0, estimativa de custo mensal real da stack.
- **Próximo passo concreto:** aplicar `database/schema.sql` em um projeto Supabase de homologação e iniciar a Fase 0 (`docs/04-roadmap-fases.md`).
