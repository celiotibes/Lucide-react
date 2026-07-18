// Só o alias `@/` (mesmo mapeamento de tsconfig.json, usado pelas páginas
// em app/) — sem isso, testar uma rota de app/api/ que importa
// `@/server/...` (padrão já usado em app/faturas/page.tsx) falha na
// resolução de módulo fora do build do Next.
//
// `fileParallelism: false`: os testes de integração (server/integracao/**,
// app/**/*.integration.test.ts) não são isolados entre si de propósito —
// todos apontam para o MESMO Postgres real (README de cada pasta) e vários
// fazem varredura do portfólio inteiro para uma competência (gerarFaturaMensal,
// faturarEnergia, relatórios). Rodar arquivos de teste em paralelo (padrão
// do Vitest) faz um arquivo processar/contar registros que outro acabou de
// criar no mesmo instante — corrida real, não bug de produto, mas que
// derruba a suíte de forma intermitente. Testes unitários (sem banco) não
// têm estado compartilhado, então rodar em série custa só um pouco de
// tempo, não corretude.
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    fileParallelism: false,
  },
});
