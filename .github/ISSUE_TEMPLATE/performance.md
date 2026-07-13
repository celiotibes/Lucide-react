---
name: "⚡ Performance Issue"
about: Report a performance degradation
title: "[PERF] "
labels: ["performance"]
assignees: []
---

## 📊 Métrica Afetada

- [ ] Latência (P95/P99)
- [ ] Throughput (req/s)
- [ ] Memory Usage
- [ ] CPU Usage
- [ ] Database Query Time
- [ ] Cache Hit Rate
- [ ] Outra: ___

## 📈 Medições

| Métrica | Antes | Depois | % Mudança |
|---------|-------|--------|-----------|
| P95 Latency | XXms | XXms | ±XX% |
| P99 Latency | XXms | XXms | ±XX% |
| Throughput | XXX req/s | XXX req/s | ±XX% |

## 🔍 Endpoint/Componente Afetado

Qual endpoint ou componente tem performance degradada?

## 🔄 Quando Começou?

- [ ] Depois de qual deploy/commit?
- [ ] Data/hora?
- [ ] Sempre ou intermitente?

## 📊 k6 Test Results

```
Cole resultados de: npm run test:perf:load
```

## 🔍 Investigação Inicial

Que investigação já foi feita?

## 🎯 Baseline Esperado

Qual é o target de performance esperado?

## 📝 Logs Relevantes

```
Cole logs ou error messages
```

---

**Severidade**: [Critical / High / Medium / Low]  
**Component**: [API / Database / Cache / Workers / Other]  
**Regression**: [Yes / No / Unknown]
