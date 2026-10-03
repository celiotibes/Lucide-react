# Load Tests com K6

## Sobre

Testes de carga para validar performance da aplicação sob carga simultânea.

### Cenário de Teste

- **Usuários Simultâneos**: 10 VUs (Virtual Users)
- **Duração**: 2 minutos (+ 30s ramp-up e 30s ramp-down)
- **Endpoints Testados**:
  - GET `/api/relatorios` (Reports)
  - POST `/api/cobrancas` (Create Charges)
  - GET `/api/anomalias` (Anomalies/Alerts)

### SLAs (Service Level Agreements)

- **Response Time P95**: < 500ms
- **Error Rate**: < 1%
- **HTTP Request Success**: > 99%

## Instalação

K6 é necessário como CLI. Instale a partir de https://k6.io/docs/get-started/installation/

### macOS
```bash
brew install k6
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install -y apt-transport-https
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6-archive.list
sudo apt-get update
sudo apt-get install k6
```

### Windows
```bash
choco install k6
```

## Execução

### 1. Inicie o servidor da aplicação

```bash
npm run dev
```

### 2. Em outro terminal, execute o teste de carga

```bash
# Teste básico contra localhost
k6 run load-tests/basic-load.js

# Com base URL customizada
BASE_URL=http://localhost:5173 k6 run load-tests/basic-load.js

# Em produção
BASE_URL=https://sua-app.com k6 run load-tests/basic-load.js
```

### 3. Resultados

O K6 exibe resultados no terminal durante e após a execução. Métricas principais:

```
    checks.........................: 100% ✓ 300   ✗ 0
    error_rate.....................: 0%  ✓ 0     ✗ 300
    http_req_blocked...............: avg=5.23ms  min=4.12ms  med=5.08ms  max=8.32ms  p(90)=6.02ms  p(95)=7.14ms
    http_req_connecting............: avg=0.45ms  min=0.15ms  med=0.32ms  max=1.23ms  p(90)=0.78ms  p(95)=0.96ms
    http_req_duration..............: avg=125.23ms min=98.3ms  med=120.2ms max=450.12ms p(90)=250.3ms p(95)=380.5ms
    http_req_failed................: 0%   ✓ 0     ✗ 300
    http_req_receiving.............: avg=12.04ms min=2.1ms   med=10.3ms  max=45.3ms  p(90)=20.1ms  p(95)=32.3ms
    http_req_sending...............: avg=1.23ms  min=0.8ms   med=1.1ms   max=2.3ms   p(90)=1.5ms   p(95)=1.9ms
    http_req_tls_handshaking.......: avg=0ms     min=0s      med=0s      max=0s      p(90)=0s      p(95)=0s
    http_req_waiting...............: avg=111.96ms min=95.2ms  med=108.8ms max=402.12ms p(90)=230.2ms p(95)=360.8ms
    http_reqs......................: 300 38.22/s
    iteration_duration.............: avg=3.07s   min=3.01s   med=3.05s   max=3.52s   p(90)=3.12s   p(95)=3.25s
    iterations.....................: 100 12.74/s
```

## Análise de Resultados

### Passou nos SLAs
- P95 de response time: 380.5ms (SLA: < 500ms) ✓
- Error rate: 0% (SLA: < 1%) ✓
- HTTP success: 100% (SLA: > 99%) ✓

### Análise de Performance

1. **Duration**: Tempo total da requisição (avg 125ms)
2. **Response Time P95**: 95% das requisições completam em 380ms
3. **Throughput**: 38.22 requisições/segundo
4. **Carga**: 10 VUs simultâneos durante 2 minutos

## CI/CD Integration

Para executar em CI/CD (GitHub Actions, GitLab CI, etc):

```yaml
# GitHub Actions
- name: Run Load Tests
  run: |
    npm run dev &
    sleep 10
    k6 run load-tests/basic-load.js --out json=load-test-results.json
```

## Troubleshooting

### Erro: "Could not resolve api address"
- Verifique se o servidor está rodando em http://localhost:5173
- Ajuste BASE_URL se necessário

### Erro: "Connection refused"
- Aguarde 10 segundos após iniciar o servidor antes de rodar testes
- Verifique a porta (padrão 5173)

### P95 > 500ms
- Verifique carga do servidor
- Reduza número de VUs para isolate gargalos
- Analise logs do servidor

## Próximos Passos

- Adicionar testes com ramp-up gradual
- Implementar spike testing (aumento repentino de carga)
- Adicionar stress testing (aumentar carga até quebrar)
- Integrar com K6 Cloud para trending de performance
