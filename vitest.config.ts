import { defineConfig, mergeConfig } from "vite";
import viteConfig from "./vite.config";

// Ambiente 'node', não 'jsdom': a suíte cobre lógica de domínio (cálculos, montagem de
// relatórios, queries SQL via sql.js em memória) — nenhum teste aqui renderiza componente
// React, então não há necessidade do custo/complexidade extra de simular um DOM.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  }),
);
