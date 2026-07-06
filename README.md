# CRMT Gestão Imobiliária — Sistema de Gestão

Projeto de sistema de gestão imobiliária para locação por contrato (Lei do Inquilinato) e locação por temporada, com portfólio em Curitiba e Florianópolis.

O design técnico completo — auditoria de escopo, gap analysis, arquitetura, roadmap faseado, riscos/custos e o schema relacional do banco de dados — está em [`docs/00-leia-primeiro.md`](docs/00-leia-primeiro.md) e [`database/schema.sql`](database/schema.sql).

Este repositório ainda está no estágio de scaffold do template Vite + React + TypeScript; a implementação segue o roadmap descrito em `docs/04-roadmap-fases.md`, começando pela Fase 0 (cadastro, contratos, faturamento via Asaas, régua de cobrança e portal do inquilino).

## Stack (ver `docs/03-arquitetura-e-stack.md` e `docs/07-selecao-de-ia-e-custos.md`)

- Frontend/Backend: Next.js (TypeScript), autohospedado junto com n8n numa única VPS via Coolify
- Banco de dados / Auth / Storage: Supabase (PostgreSQL)
- Pagamentos: Asaas (boleto, PIX, split)
- Orquestração/notificações: n8n
- IA: roteamento fixo por tarefa (Gemini Flash-Lite pago para OCR, Claude Sonnet/Haiku para texto jurídico e classificação) — ver `server/ai-gateway/`; nunca camada gratuita com dado pessoal; *credit scoring* nunca usa IA generativa
- Assinatura eletrônica: Autentique

## Desenvolvimento do scaffold atual

```
npm install
npm run dev     # app Vite/React (scaffold atual)
npm test        # testes do server/ai-gateway
npm run build   # build de produção do frontend
```
