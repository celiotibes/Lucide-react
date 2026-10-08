# Guia de Execução de Testes - Phase 22.16

## 1. Estrutura de Testes

### Localização dos Testes
```
mobile-app/
├── __tests__/
│   ├── e2e/               # Testes end-to-end (Detox)
│   ├── integration/       # Testes de integração
│   ├── performance/       # Testes de performance
│   ├── security/          # Testes de segurança
│   └── utils/             # Utilities para testes
└── src/
    ├── __tests__/         # Unit tests colocalizados
    └── **/*.test.ts       # Unit tests inline
```

## 2. Executando Testes Localmente

### Todos os Testes
```bash
npm test
```

### Apenas Testes Unitários
```bash
npm run test:unit
```

### Apenas Testes de Integração
```bash
npm run test:integration
```

### Com Coverage
```bash
npm run test:coverage
```

### Modo Watch (desenvolvimento)
```bash
npm run test:watch
```

## 3. Testes End-to-End (E2E)

### Pré-requisitos
- Xcode instalado (iOS)
- Android SDK configurado
- Simulador iOS ou Android Emulator disponível

### Executar E2E iOS
```bash
detox build-framework-cache
detox build-app --configuration ios.sim.debug
detox test --configuration ios.sim.debug
```

### Executar E2E Android
```bash
detox build-app --configuration android.emu.debug
detox test --configuration android.emu.debug
```

### E2E com Screenshots
```bash
detox test --configuration ios.sim.debug --record-logs all
```

## 4. Testes de Performance

### Medir Tempo de Startup
```bash
npm run test:performance -- --testNamePattern="startup"
```

### Detectar Memory Leaks
```bash
npm run test:performance -- --testNamePattern="memory-leak"
```

### Profile CPU
```bash
npm run test:performance -- --testNamePattern="cpu-profiling"
```

## 5. Testes de Segurança

### Executar Testes de Segurança
```bash
npm run test:security
```

### Audit de Dependências
```bash
npm audit
```

### SAST Scanning (com SonarQube)
```bash
sonar-scanner \
  -Dsonar.projectKey=lucide-react-mobile \
  -Dsonar.sources=src \
  -Dsonar.exclusions="**/__tests__/**" \
  -Dsonar.typescript.lcov.reportPaths=coverage/lcov.info
```

## 6. CI/CD via GitHub Actions

### Trigger Automaticamente
- Push para qualquer branch
- Pull requests
- Agendado diariamente

### Resultado dos Testes
- Logs em `artifacts/test-results/`
- Coverage reports em Codecov
- Performance benchmarks em `PERFORMANCE_BENCHMARKS.md`

## 7. Interpretando Resultados

### Coverage Report
```
Abrir: coverage/index.html
```

**Metas de Coverage:**
- Global: >= 80%
- Services: >= 85%
- Database: >= 85%
- Components: >= 80%

### Performance Benchmarks
```
Localização: PERFORMANCE_BENCHMARKS.md

Métricas:
- Startup time: < 3 segundos
- List scrolling: > 55 FPS
- Memory growth: < 10% por 100 captures
- CPU usage: < 50% em idle
```

### Security Findings
```
npm audit

Críticos: Deve ser 0
Altos: Deve ser 0
Médios/Baixos: Revisar e justificar
```

## 8. Troubleshooting

### Testes falhando em CI mas passam localmente
- Sincronize dependências: `npm ci`
- Limpe cache: `npm test -- --clearCache`
- Verifique Node version: `node -v` (deve ser >= 18)

### E2E Detox com timeout
```bash
# Aumentar timeout
detox test --configuration ios.sim.debug --cleanup-state

# Ou direto na config
DETOX_TIMEOUT=30000 detox test
```

### Memory tests não detectam leaks
```bash
# Enable garbage collection
node --expose-gc node_modules/.bin/jest --testNamePattern="memory"
```

## 9. Benchmarking Performance

### Criar Baseline
```bash
npm run test:performance > performance-baseline.txt
```

### Comparar com Anterior
```bash
npm run test:performance > performance-current.txt
diff performance-baseline.txt performance-current.txt
```

## 10. Critério de Aceição

✅ **Merge Blocker:**
- [ ] Coverage >= 85% para código crítico
- [ ] Todos os testes passam
- [ ] Nenhuma warning no build
- [ ] Security audit sem críticos
- [ ] E2E fluxos críticos OK

✅ **Recomendado:**
- Performance não regrediu > 10%
- Memory não cresceu > 15%
- Code review aprovado

## 11. Relatórios

### Gerar Relatório Completo
```bash
npm test -- --coverage && \
npm audit && \
npm run test:performance && \
detox test --configuration ios.sim.debug
```

### Exportar para Jira
Coverage reports e performance metrics podem ser linkados diretamente em PRs/issues.

## 12. Próximos Passos

- [ ] Setup de device farm para real devices
- [ ] Integração com APM (Application Performance Monitoring)
- [ ] Automated performance regression detection
- [ ] Visual regression testing
