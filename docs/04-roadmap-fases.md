# Roadmap Faseado

Princípio: cada fase termina com algo **rodando em produção**, não apenas "planejado". Duração estimada assume desenvolvimento contínuo (não part-time esparso).

## Fase 0 — MVP Operacional (6-8 semanas)
Objetivo: parar de operar cobrança manualmente.

- M1 Cadastro: imóveis (todas as unidades já listadas: João Pottker, Milton Sullivan, Ana Maria Nunes, e as 6 unidades de Curitiba), residenciais, pessoas (locatários, fiadores, proprietários).
- M2 Contratos: locação padrão com pró-rata, garantias (caução com atualização por poupança, fiador, seguro-fiança/incêndio com alerta de vigência), reajuste por índice com aprovação manual.
- M3 Faturamento: emissão consolidada via Asaas (boleto/PIX), régua de cobrança D+5/D+15/D+30 com cálculo de juros/multa versionado e testado, webhook de baixa automática.
- M4 Portal do inquilino: 2ª via, histórico de pagamento, dados de contrato, canal de contato.
- Pré-requisitos de segurança (gap analysis itens 15-19): backup configurado, ambiente de homologação separado de produção, RLS por papel desenhado desde o primeiro dia, log de auditoria nas tabelas financeiras/contratuais.
- Temporada nesta fase: operação continua manual/direta pelas plataformas (Airbnb etc.); o sistema apenas registra o contrato de temporada como um tipo simplificado (sem régua de inadimplência, já que é pré-pago).

**Critério de saída da Fase 0:** todo aluguel de locação padrão das duas cidades é cobrado pelo sistema, com juros/multa calculados automaticamente e conciliação automática via webhook Asaas.

## Fase 1 — Operação de Campo (4-6 semanas)
- M5 Manutenção/Ticketing: abertura de chamado (inquilino ou interno), alocação a Paulo/Cristiano/eventual, magic link para prestador eventual (orçamento, fotos, check-in/out com GPS, PIX/nota).
- M6 Folha de pagamento: diárias obrigatórias de Paulo (km, adicional 25% combustível, 20% noturno/feriado, déficit de retenção), diárias/meias-diárias de Cristiano, tabela de limpeza Airbnb com fechamento semanal (sexta à tarde).
- M7 Energia: upload de foto do medidor, OCR com Gemini Vision, leitura sempre `pendente_confirmacao`, fallback de média de 3 meses, franquia mínima (30/50 kWh conforme data do contrato), taxa administrativa de 25% detalhada na fatura.

**Critério de saída:** nenhuma diária ou fatura de energia é calculada manualmente em planilha.

## Fase 2 — Patrimônio e Transparência (4-6 semanas)
- M8 Patrimônio/Comodato: cadastro de ativos com QR code, depreciação linear mensal (CPC 27), alerta de fim de vida útil.
- M9 Portal do investidor: ledger de conta corrente (não cap table automático), extrato de repasse com dedução detalhada (custos + taxa de administração quando aplicável), painel de vacância.
- M10 Documentos: geração de declarações (residência, quitação) com hash SHA-256 + QR de validação pública; vistoria via PWA (fotos com marca d'água de data/hora/GPS, checklist, assinatura em tela, geração automática de chamado de manutenção quando aplicável).

**Critério de saída:** proprietário de imóvel de terceiro (Ana Maria Nunes, Apto 509B) acompanha o próprio extrato sem pedir planilha por e-mail.

## Fase 3 — Consolidação Financeira e Comercial (6-8 semanas)
- M11 Tesouraria: importação de OFX das 6 instituições (manual nesta fase), categorização assistida, DRE em regime de competência e de caixa lado a lado, projeção de fluxo de caixa 30/60/90 dias.
- M12 Comercial: landing page pública (SSR/SEO), funil de leads (kanban), publicação automática de disponibilidade quando aviso prévio é lançado.
- M13 Temporada avançado: sincronização de calendário entre canais (evitar overbooking), SLA de turnover de limpeza, registro de chargeback/disputa.
- M14 Jurídico: dossiê de inadimplência, fluxo específico de ação de despejo (não campo genérico), provisão de contingência apenas quando probabilidade jurídica = "provável" (CPC 25).

**Critério de saída:** fechamento mensal (DRE) não depende de planilha paralela; overbooking de temporada nunca mais acontece por falha de calendário.

## Fase 4 — Tributário e Reconstituição Histórica (acompanhada por contador/advogado, não só engenharia)
- M15 Tributário: IPTU/ISS municipal por cidade, exportação DIMOB, apoio a apuração de IRPF (Livro Caixa) — sempre como ferramenta de apoio, com validação de contador antes de qualquer envio oficial.
- M16 Reconstituição histórica: importação em massa de extratos antigos, classificação assistida por regra/IA, staging obrigatório com aprovação humana antes de qualquer número entrar em DRE retroativa oficial.
- Formalização de SCP/cap table (se e quando fizer sentido societário) — projeto jurídico-contábil que o sistema passa a *refletir* depois de formalizado, nunca decide sozinho.

## O que fica deliberadamente fora do build automatizado (mitigado, não ignorado)
- Diluição automática de cap table: vira relatório de apoio; decisão e registro são manuais e documentados.
- Impairment test e curva de deságio automáticos: viram alertas/calculadoras de apoio à decisão do contador/advogado, não lançamentos automáticos.
- WhatsApp não-oficial: não implementado, ponto final — risco de banimento é alto demais.
