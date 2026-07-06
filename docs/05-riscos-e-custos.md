# Riscos e Estimativa de Custo Real

> **Atualizado em `07-selecao-de-ia-e-custos.md`** com preços verificados por pesquisa (não estimativa de memória) e duas correções materiais: PITR do Supabase custa US$100/mês **à parte** do plano Pro (decisão: não contratar, usar backup diário + teste trimestral de restore), e o plano gratuito da Vercel é **não-comercial** (decisão: autohospedar Next.js + n8n na mesma VPS via Coolify, eliminando um fornecedor). A tabela abaixo já reflete essas correções — a versão anterior desta tabela subestimava esses dois itens.

## Estimativa de custo mensal por fase (ordem de grandeza, com preços de mercado verificados em jul/2026 — ver doc 07 para fontes)

| Item | Fase 0 | Fase 1-2 | Fase 3+ |
|---|---|---|---|
| VPS única (Next.js autohospedado + n8n via Coolify) | R$40-70 | R$40-70 | R$80-150 |
| Supabase Pro (backup diário incluído; sem PITR) | R$140 (US$25) | R$140 | R$140-3300 (conforme uso; Team R$3300 só se escalar muito) |
| Asaas (R$1,99/boleto + R$1,99/PIX recebido, ~40 cobranças/mês) | R$80-100 | R$80-100 | R$100-150 |
| IA (Gemini + Claude, sempre camada paga — nunca free tier, ver doc 07) | R$10-30 | R$20-50 | R$40-100 |
| Assinatura eletrônica (Autentique) | — | R$50-85 | R$85 |
| WhatsApp Business API oficial (BSP por mensagem, não licença fixa — ver doc 07) | — | R$35-90 | R$90-250 |
| Open Finance (Pluggy/Belvo) | não usado | não usado | R$150-500 (6 contas+cartões) |
| Domínio | R$3 | R$3 | R$3 |
| **Total aproximado** | **R$270-345/mês** | **R$370-540/mês** | **R$690-2040/mês** |

Isso não é "tier gratuito" como a proposta anterior sugeriu — é um custo operacional real, mas ainda muito inferior a licenciar um ERP imobiliário comercial por unidade (que facilmente ultrapassaria isso com 35-40 unidades). O custo de IA (linha mais questionada nesta rodada de revisão) é, na prática, a linha **menos relevante** do orçamento — ver análise em `07-selecao-de-ia-e-custos.md`.

## Riscos principais e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Ninguém dedicado a manter o sistema | Alto — bug em produção sem resposta | Faseamento; cada fase só avança com a anterior estável; considerar retainer de manutenção com a economista/dev |
| Número de WhatsApp banido (uso não-oficial) | Alto — perde canal de cobrança e comunicação | Usar apenas provedor oficial (BSP), nunca solução não-homologada |
| Erro de OCR vira cobrança errada | Médio-alto — passivo em Juizado Especial | Confirmação humana obrigatória antes de faturar |
| Classificação automática de extrato pessoal gera omissão/erro fiscal | Alto — risco com Receita Federal | Staging com aprovação de contador antes de qualquer DRE/DIRPF oficial |
| Cap table automatizado dilui sócio sem lastro jurídico | Alto — disputa societária | Ledger auditável; mudança de % é evento manual documentado e assinado |
| Perda de dados sem backup testado | Alto — contratos e financeiro são o negócio | Supabase Pro (backup diário incluído, PITR dispensado por ora — ver doc 07) + rotina trimestral de teste de restauração |
| Usar camada gratuita de API de IA com dado pessoal (foto de medidor, extrato) | Alto — violação de base legal LGPD, dado usado para treino sem consentimento | Toda chamada de IA usa camada paga (Gemini/Claude); bloqueio em código no `server/ai-gateway` — ver doc 07 |
| Overbooking em temporada multi-canal | Médio — prejuízo direto e reputação | Sincronização de calendário na Fase 3 antes de escalar temporada |
| Testar régua de cobrança direto em produção | Alto — cobra inquilino real errado | Ambiente de homologação obrigatório antes de qualquer deploy de M3 |
| Provisão de contingência sem base técnica | Médio — caixa mal alocado ou falsa segurança | Provisão apenas com avaliação jurídica formal de probabilidade (CPC 25) |
| Dependência total de um fornecedor (lock-in) | Médio-baixo, longo prazo | Rotinas de exportação de dados desde a Fase 0 (nunca só no head do fornecedor) |

## Recomendação de governança mínima
- Homologação obrigatória para qualquer mudança em M2/M3 (contratos/cobrança) antes de produção.
- Revisão de contador antes de qualquer fechamento de DRE ou envio de DIMOB/DIRPF gerado pelo sistema.
- Revisão de advogado antes de qualquer alteração no cálculo de multa/juros/honorários ou nos templates de notificação extrajudicial/confissão de dívida.
- Teste trimestral de restauração de backup.
