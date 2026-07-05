# Guia de Deployment - Sistema de Automação Jurídica

## Visão Geral

Este documento fornece instruções completas para deploy do sistema em ambientes de desenvolvimento, staging e produção.

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose (para containerização)
- PostgreSQL 15+ (opcional se usar Docker)
- Redis 7+ (para cache - opcional se usar Docker)
- Variáveis de ambiente configuradas (.env)

## 1. Deployment Local (Desenvolvimento)

### Setup Rápido

```bash
cd legal-automation

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações locais

# Executar migrations
npm run db:migrate

# Iniciar em modo desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`

### Com Docker Compose

```bash
# Iniciar todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Parar serviços
docker-compose down
```

## 2. Deployment com Docker

### Build da Imagem

```bash
# Build local
docker build -t legal-automation:latest .

# Com tag de versão
docker build -t legal-automation:v1.0.0 .
```

### Executar Container

```bash
# Executar com variáveis de ambiente
docker run \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@db:5432/legal \
  -e JWT_SECRET=your-secret-key \
  -v legal-data:/app/data \
  -v legal-logs:/app/logs \
  legal-automation:latest
```

## 3. Deployment em Kubernetes

### Manifests Necessários

#### Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: legal-automation
```

#### ConfigMap (Configurações)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: legal-config
  namespace: legal-automation
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  PORT: "3000"
```

#### Secret (Credenciais)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: legal-secrets
  namespace: legal-automation
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:pass@postgres:5432/legal"
  JWT_SECRET: "your-super-secret-key-min-32-chars"
  STRIPE_SECRET_KEY: "sk_live_xxxxx"
  PAYPAL_CLIENT_SECRET: "xxxxx"
```

#### Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legal-automation
  namespace: legal-automation
spec:
  replicas: 3
  selector:
    matchLabels:
      app: legal-automation
  template:
    metadata:
      labels:
        app: legal-automation
    spec:
      containers:
      - name: app
        image: legal-automation:v1.0.0
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: legal-config
        - secretRef:
            name: legal-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        volumeMounts:
        - name: data
          mountPath: /app/data
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: legal-data
      - name: logs
        persistentVolumeClaim:
          claimName: legal-logs
```

#### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: legal-automation-service
  namespace: legal-automation
spec:
  selector:
    app: legal-automation
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

#### PersistentVolumeClaim
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: legal-data
  namespace: legal-automation
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: legal-logs
  namespace: legal-automation
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
```

### Aplicar Manifests

```bash
# Aplicar namespace
kubectl apply -f namespace.yaml

# Aplicar secrets
kubectl apply -f secret.yaml

# Aplicar configmap
kubectl apply -f configmap.yaml

# Aplicar deployment
kubectl apply -f deployment.yaml

# Aplicar volumes
kubectl apply -f volumes.yaml

# Aplicar service
kubectl apply -f service.yaml

# Verificar status
kubectl get pods -n legal-automation
kubectl describe pod <pod-name> -n legal-automation
```

## 4. Variáveis de Ambiente Críticas

### Segurança
- `JWT_SECRET`: Mínimo 32 caracteres, único por ambiente
- `ENCRYPTION_KEY`: Chave de encriptação AES-256

### Banco de Dados
- `DATABASE_URL`: Connection string PostgreSQL
- `REDIS_URL`: Connection string Redis (opcional)

### Integrações
- `STRIPE_SECRET_KEY`: Chave secreta Stripe
- `PAYPAL_CLIENT_SECRET`: Secret PayPal
- `PROJURIS_API_KEY`: Chave API Projuris

### Backup & Armazenamento
- `AWS_ACCESS_KEY_ID`: Credencial AWS
- `AWS_SECRET_ACCESS_KEY`: Secret AWS
- `AWS_S3_BUCKET`: Nome do bucket S3

## 5. Health Checks

### Endpoint de Health
```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "healthy",
  "timestamp": "2026-07-05T21:00:00Z",
  "uptime": 3600,
  "database": "connected",
  "cache": "connected"
}
```

## 6. Monitoring e Logging

### Logs Estruturados (JSON)
```bash
# Ver logs em tempo real
docker logs -f <container-id>

# Ou com docker-compose
docker-compose logs -f app
```

### Métricas
```bash
# Prometheus metrics em /metrics
curl http://localhost:3000/metrics
```

## 7. Backup Automático

### Configurar Backup
```bash
# Executar backup manual
curl -X POST http://localhost:3000/api/backup/execute/<configId> \
  -H "Authorization: Bearer $TOKEN"

# Listar backups
curl http://localhost:3000/api/backup/metrics \
  -H "Authorization: Bearer $TOKEN"
```

### Restauração
```bash
# Restaurar de backup
curl -X POST http://localhost:3000/api/backup/restore/<backupId> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetEnvironment":"staging"}'
```

## 8. Troubleshooting

### Database Connection Issues
```bash
# Verificar conectividade
psql -h localhost -U user -d database -c "SELECT 1"

# Ou via Docker
docker exec -it legal-automation-db psql -U legal_user -d legal_automation
```

### Cache Issues
```bash
# Verificar Redis
redis-cli ping

# Ou via Docker
docker exec -it legal-automation-cache redis-cli ping
```

### Memory Issues
```bash
# Aumentar limite de memória
docker update --memory 2g <container-id>

# Ou em Kubernetes
kubectl set resources deployment legal-automation \
  --limits=memory=2Gi,cpu=1 \
  --requests=memory=512Mi,cpu=250m \
  -n legal-automation
```

## 9. Rollback de Deploy

```bash
# Kubernetes rollback
kubectl rollout undo deployment/legal-automation -n legal-automation

# Ou especificar revisão
kubectl rollout undo deployment/legal-automation --to-revision=2 -n legal-automation

# Ver histórico
kubectl rollout history deployment/legal-automation -n legal-automation
```

## 10. Performance Tuning

### Node.js Flags
```bash
# Habilitar clustering
NODE_OPTIONS="--enable-source-maps" npm start

# Com worker threads
NODE_OPTIONS="--experimental-worker" npm start
```

### Database Optimization
```sql
-- Índices importantes
CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(created_by);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON payment_transactions(status);
```

## Suporte

Para problemas ou dúvidas:
1. Consulte logs em `/app/logs`
2. Verifique status de saúde em `/health`
3. Revise PHASES_SUMMARY.md para arquitetura
