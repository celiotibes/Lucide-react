# CRMT Gestão Imobiliária — Sistema de Gestão

Projeto de sistema de gestão imobiliária para locação por contrato (Lei do Inquilinato) e locação por temporada, com portfólio em Curitiba e Florianópolis.

O design técnico completo — auditoria de escopo, gap analysis, arquitetura, roadmap faseado, riscos/custos e o schema relacional do banco de dados — está em [`docs/00-leia-primeiro.md`](docs/00-leia-primeiro.md) e [`database/schema.sql`](database/schema.sql).

Este repositório ainda está no estágio de scaffold do template Vite + React + TypeScript; a implementação segue o roadmap descrito em `docs/04-roadmap-fases.md`, começando pela Fase 0 (cadastro, contratos, faturamento via Asaas, régua de cobrança e portal do inquilino).

## Stack (ver `docs/03-arquitetura-e-stack.md`)

- Frontend/Backend: Next.js (TypeScript)
- Banco de dados / Auth / Storage: Supabase (PostgreSQL)
- Pagamentos: Asaas (boleto, PIX, split)
- Orquestração/notificações: n8n
- OCR (medidores, notas fiscais): Gemini Vision API, sempre com confirmação humana
- Assinatura eletrônica: Autentique/Clicksign

## Desenvolvimento do scaffold atual

```
npm install
npm run dev
```
