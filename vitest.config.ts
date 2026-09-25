import { defineConfig, mergeConfig } from "vite";
import viteConfig from "./vite.config";

// Ambiente 'node', não 'jsdom': a suíte cobre lógica de domínio (cálculos, montagem de
// relatórios, queries SQL via sql.js em memória) — nenhum teste aqui renderiza componente
// React, então não há necessidade do custo/complexidade extra de simular um DOM.
//
// server/src/domain/{auth,erp}/**: os testes do backend Express (server/) também entram
// aqui, e não via `projects`/workspace do Vitest — os dois lados já rodam sob o mesmo
// `environment: "node"` (nenhum usa jsdom), então não há a fronteira de ambiente que
// justificaria projetos separados; um include widened basta, e mantém "npm test" como uma
// única execução com uma contagem só de testes. server/ tem seu próprio node_modules
// (better-sqlite3, módulo nativo) e sua própria cópia de "vitest" nele — na prática o
// Vitest resolve "vitest" para uma instância só por execução (evitando o problema clássico
// de dual-package), então rodar os dois lados juntos por aqui funciona; foi checado
// manualmente antes de fixar esta config.
//
// Escopo deliberadamente restrito a auth/ e erp/ (não "server/src/**/*.test.ts" inteiro):
// os módulos auth-service-db, audit-trail-db e duplicate-payment-guard-db são candidatos a
// semente da API na migração para Postgres/Supabase, e são os únicos com testes revisados e
// passando. server/src/domain/__tests__/ tem 4 arquivos de teste pré-existentes e sem
// relação com esse trabalho, quebrados por motivos próprios e ortogonais (não entram aqui
// até alguém consertar e revisar cada um):
//   - sprint1.test.ts e relatorios-consolidacao-auditoria.test.ts: usam describe/test como
//     globais sem importar de "vitest" (nunca houve vitest.config.ts em server/ com
//     `globals: true` — nunca rodaram de verdade).
//   - phase5-dashboard-analytics.test.ts: erro de sintaxe no próprio arquivo de teste
//     ("scheduler.agendar Relatorio(" — identificador com espaço).
//   - relatorios-apontamento-advocacia.test.ts: importa de "../relatorios-apontamento", que
//     não existe no repositório.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: [
        "src/**/*.test.ts",
        "server/src/domain/auth/**/*.test.ts",
        "server/src/domain/erp/**/*.test.ts",
      ],
    },
  }),
);
