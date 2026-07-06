# Arquitetura Técnica — Decisão Final

Esta é a arquitetura adotada, com justificativa. Onde diverge da proposta anterior, a razão está no `01-auditoria-critica.md`.

## Visão geral

```
                         ┌───────────────────────────────┐
                         │        Next.js (TypeScript)     │
                         │  - Back-office (admin/economista)│
                         │  - Portal do Inquilino           │
                         │  - Portal do Investidor           │
                         │  - Acesso via Magic Link (prestador)│
                         │  - PWA de Vistoria (câmera/GPS)   │
                         │  - Landing page pública (SEO/SSR) │
                         └───────────────┬─────────────────┘
                                         │ (Supabase client + API routes)
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
        ┌────────────────┐     ┌────────────────┐      ┌──────────────────┐
        │   Supabase      │     │  Backend jobs   │      │   n8n (VPS)       │
        │ Postgres + RLS  │◄────┤  (funções       │◄─────┤ orquestração e    │
        │ Auth + Storage  │     │  versionadas:   │      │ notificações       │
        └────────────────┘     │  juros, multa,  │      │ (cron, webhooks,   │
                                │  split, rateio) │      │  WhatsApp/e-mail)  │
                                └────────────────┘      └──────────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
          ┌────────────┐         ┌─────────────┐        ┌────────────────┐
          │   Asaas     │         │ Gemini Vision│        │ Autentique /    │
          │ boleto/PIX  │         │ OCR medidor/ │        │ Clicksign        │
          │ + split     │         │ nota fiscal  │        │ (assinatura)     │
          └────────────┘         └─────────────┘        └────────────────┘
```

## Componentes e justificativa

### Frontend/Backend: Next.js (TypeScript), único codebase
Substitui Streamlit + Webflow/Framer separados. Um único framework atende:
- Back-office interno (você e a economista).
- Portal do inquilino e do investidor (autenticados via Supabase Auth, com RLS restringindo cada um aos próprios dados).
- Acesso de prestador eventual via link tokenizado (rota pública com token de uso único/expiração, sem exigir login).
- PWA de vistoria: câmera e geolocalização nativas do navegador funcionam em Next.js hoje, sem app nativo.
- Landing page pública com SSR/ISR para SEO — resolve o problema que a proposta anterior "resolveu" saindo do próprio stack.

Motivo de não usar Streamlit: ver auditoria, item 2. Streamlit continua sendo uma opção *aceitável* apenas se, no futuro, quiser um notebook interno de análise ad-hoc para a economista — mas não como produto.

### Banco de dados / Auth / Storage: Supabase (Postgres)
Mantido da proposta original — é a escolha correta. Postgres relacional é adequado à natureza fortemente transacional/contábil do domínio; RLS nativo resolve isolamento entre papéis (inquilino só vê o próprio contrato, investidor só vê os próprios imóveis); Storage guarda PDFs de contrato, fotos de vistoria e medidor.

**Ressalva de custo:** Point-in-time recovery e backups automáticos diários robustos exigem plano pago do Supabase (Pro, ~US$25/mês) assim que houver dados reais de produção — não é opcional para um sistema que guarda contratos e financeiro. Ver doc 05.

### Lógica de negócio crítica: código versionado, não n8n
Cálculo de juros/multa *pro rata die*, split de pagamento, rateio de centro de custo, reajuste por índice — tudo isso vive em funções TypeScript testadas (rodando como funções serverless/edge ou num pequeno serviço Node), com testes automatizados. n8n orquestra (dispara no horário certo, chama a função, envia notificação) mas **não contém a fórmula**. Isso resolve o item 3/23 da auditoria: lógica financeira crítica precisa ser testável e ter histórico de versão (git), não viver dentro de um workflow visual.

### n8n: orquestração, não motor financeiro
Uso correto: cron diário de régua de cobrança (chama a função, não calcula nela), relay de webhook do Asaas, disparo de WhatsApp/e-mail, agendamento de lembretes. Hospedado em VPS pequena (custo real, ver doc 05) — não é "grátis", é barato.

### Pagamentos: Asaas
Mantido — API madura para boleto/PIX/split no mercado brasileiro, e webhooks confiáveis para conciliação em tempo real. Cobrança consolidada (aluguel + energia + taxa) por padrão, com detalhamento por item na fatura (transparência exigida pelo item 1 da auditoria sobre a taxa de 25% de energia).

### OCR: Gemini Vision, com confirmação humana obrigatória
Leitura de medidor e nota fiscal, sempre em estado `pendente_confirmacao` até um humano validar (auditoria item 7). Fallback de média dos últimos 3 meses quando não há leitura confiável.

### Assinatura eletrônica: Autentique (ou Clicksign) por tipo de documento
Nível de assinatura escolhido por tipo de documento (contrato padrão vs termo de confissão de dívida) mediante validação jurídica pontual — não uma escolha única de engenharia (auditoria item 4).

### Comunicação: WhatsApp Business API oficial (via BSP)
Não usar solução não-oficial (risco de banimento do número corporativo). Orçar como custo real desde a Fase 0 leve (volume baixo) — ver doc 05.

### Conciliação bancária: OFX manual primeiro, Open Finance depois
Fase 0-2: upload manual de OFX (grátis, cobre 100% do caso de uso, exige só o hábito operacional de baixar o extrato mensal). Open Finance (Pluggy/Belvo) só entra quando o volume de contas (6 bancos + cartões) justificar o custo recorrente — Fase 3+.

## Módulos finais (consolidado, renomeado por função de negócio em vez de número solto)

| Código | Módulo | Fase |
|---|---|---|
| M1 | Cadastro (Imóveis, Residenciais, Pessoas) | 0 |
| M2 | Contratos (locação padrão + temporada, motores separados) | 0 |
| M3 | Faturamento e Cobrança (Asaas, régua, split) | 0 |
| M4 | Portal do Inquilino | 0 |
| M5 | Manutenção / Ticketing + Magic Link de Prestador | 1 |
| M6 | Folha de Pagamento (Paulo, Cristiano, eventuais) | 1 |
| M7 | Energia (OCR + confirmação + rateio + bandeiras) | 1 |
| M8 | Patrimônio / Comodato + Depreciação (CPC 27) | 2 |
| M9 | Portal do Investidor + Ledger | 2 |
| M10 | Documentos (geração + hash/QR de validação) + Vistoria PWA | 2 |
| M11 | Tesouraria (OFX manual → Open Finance) + DRE Competência/Caixa | 3 |
| M12 | Comercial (Landing page, funil de leads, disponibilidade) | 3 |
| M13 | Temporada avançado (channel manager, turnover, chargeback) | 3 |
| M14 | Jurídico (despejo, provisão CPC 25, dossiê de inadimplência) | 3 |
| M15 | Tributário (IPTU/ISS municipal, DIMOB, apoio a DIRPF) | 4 |
| M16 | Reconstituição Histórica (staging + aprovação contábil) | 4 |

Isso é o mesmo universo de funcionalidades levantado nas 8 rodadas — reorganizado por fase de entrega e sem os itens estruturalmente arriscados descritos na auditoria (cap table automático, impairment automático, curva de deságio automática), que passam a ser **relatórios de apoio à decisão humana**, não motores que agem sozinhos.
