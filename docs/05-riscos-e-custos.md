# Riscos e Estimativa de Custo Real

## Estimativa de custo mensal por fase (ordem de grandeza, não cotação formal)

| Item | Fase 0 | Fase 1-2 | Fase 3+ |
|---|---|---|---|
| Supabase (Pro, necessário p/ backup real) | ~US$25 | ~US$25 | ~US$25-599 (conforme uso) |
| Hospedagem Next.js (Vercel/similar, tier hobby→pro) | R$0-100 | R$0-100 | R$100-300 |
| VPS para n8n | R$25-50 | R$25-50 | R$25-50 |
| Asaas | taxa por boleto/PIX (variável com volume) | idem | idem |
| Gemini Vision API | tier grátis provável suficiente | pode exceder tier grátis | orçar por volume |
| Assinatura eletrônica (Autentique/Clicksign) | R$0 (baixo volume) | R$50-150 | R$150-400 |
| WhatsApp Business API (oficial) | baixo/grátis (baixo volume) | R$50-150 | R$150-400 |
| Open Finance (Pluggy/Belvo) | não usado | não usado | R$150-500 (6 contas+cartões) |
| **Total aproximado** | **R$150-400/mês** | **R$350-700/mês** | **R$800-2500/mês** |

Isso não é "tier gratuito" como a proposta anterior sugeriu — é um custo operacional real, mas ainda muito inferior a licenciar um ERP imobiliário comercial por unidade (que facilmente ultrapassaria isso com 35-40 unidades).

## Riscos principais e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Ninguém dedicado a manter o sistema | Alto — bug em produção sem resposta | Faseamento; cada fase só avança com a anterior estável; considerar retainer de manutenção com a economista/dev |
| Número de WhatsApp banido (uso não-oficial) | Alto — perde canal de cobrança e comunicação | Usar apenas provedor oficial (BSP), nunca solução não-homologada |
| Erro de OCR vira cobrança errada | Médio-alto — passivo em Juizado Especial | Confirmação humana obrigatória antes de faturar |
| Classificação automática de extrato pessoal gera omissão/erro fiscal | Alto — risco com Receita Federal | Staging com aprovação de contador antes de qualquer DRE/DIRPF oficial |
| Cap table automatizado dilui sócio sem lastro jurídico | Alto — disputa societária | Ledger auditável; mudança de % é evento manual documentado e assinado |
| Perda de dados sem backup testado | Alto — contratos e financeiro são o negócio | Supabase Pro (PITR) + rotina periódica de teste de restauração |
| Overbooking em temporada multi-canal | Médio — prejuízo direto e reputação | Sincronização de calendário na Fase 3 antes de escalar temporada |
| Testar régua de cobrança direto em produção | Alto — cobra inquilino real errado | Ambiente de homologação obrigatório antes de qualquer deploy de M3 |
| Provisão de contingência sem base técnica | Médio — caixa mal alocado ou falsa segurança | Provisão apenas com avaliação jurídica formal de probabilidade (CPC 25) |
| Dependência total de um fornecedor (lock-in) | Médio-baixo, longo prazo | Rotinas de exportação de dados desde a Fase 0 (nunca só no head do fornecedor) |

## Recomendação de governança mínima
- Homologação obrigatória para qualquer mudança em M2/M3 (contratos/cobrança) antes de produção.
- Revisão de contador antes de qualquer fechamento de DRE ou envio de DIMOB/DIRPF gerado pelo sistema.
- Revisão de advogado antes de qualquer alteração no cálculo de multa/juros/honorários ou nos templates de notificação extrajudicial/confissão de dívida.
- Teste trimestral de restauração de backup.
