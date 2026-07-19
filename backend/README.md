# Lucide-react Backend API

Backend Python + FastAPI para integração com:
- Portal Jus.br (CNJ)
- e-SAJ (TJSP)
- MNI (Malha Nacional de Interoperabilidade)
- IA especializada em jurisprudência

## 🚀 Quick Start

### 1. Setup Local

```bash
# Clonar repo (se não feito)
cd lucide-react

# Criar venv
python -m venv venv
source venv/bin/activate  # macOS/Linux
# ou
.\venv\Scripts\activate  # Windows

# Instalar deps
pip install -r backend/requirements.txt

# Copiar .env
cp backend/.env.example backend/.env
# Editar backend/.env com valores locais
```

### 2. Rodar FastAPI

```bash
cd backend
python main.py
```

Ou com hot-reload:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API rodará em: http://localhost:8000

### 3. Acessar Documentação

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## 🏗️ Estrutura do Projeto

```
backend/
├── main.py                    # FastAPI app entry point
├── requirements.txt           # Dependências Python
├── .env.example              # Variáveis de ambiente
├── README.md                 # Este arquivo
├── Dockerfile                # Para containerização
├── docker-compose.yml        # Local dev com PostgreSQL + Redis
│
├── services/                 # Business logic
│   ├── __init__.py
│   ├── cnj_portal.py         # FASE 4A: Portal Jus.br
│   ├── calculador_dano_material.py  # FASE 4B
│   ├── calculador_pensao.py         # FASE 4B
│   ├── calculador_dano_moral.py     # FASE 4B
│   ├── rag_jurisprudencia.py        # FASE 4C
│   ├── extrator_entidades.py        # FASE 4C
│   └── cliente_mni.py               # FASE 4D
│
├── routes/                   # API endpoints
│   ├── __init__.py
│   ├── health.py            # GET /health
│   ├── processos.py         # GET /processos/{numero}
│   ├── calculos.py          # POST /calcular/*
│   ├── analise.py           # POST /analisar/*
│   └── integracao.py        # POST /peticionamento/*
│
├── models/                   # SQLAlchemy ORM + Pydantic
│   ├── __init__.py
│   ├── base.py              # Base model
│   ├── usuario.py
│   ├── caso.py
│   ├── indices_economicos.py
│   └── jurisprudencia.py
│
├── utils/                    # Utilitários
│   ├── __init__.py
│   ├── validadores.py       # CPF, CNPJ, etc
│   ├── conversores.py       # Formatações
│   ├── certificado_digital.py
│   └── logger.py
│
└── tests/                    # Testes unitários
    ├── __init__.py
    ├── test_calculos.py
    ├── test_cnj_portal.py
    ├── test_rag.py
    └── test_api.py
```

## 🧪 Testes

```bash
# Rodar todos os testes
pytest

# Com coverage
pytest --cov=. --cov-report=html

# Teste específico
pytest tests/test_calculos.py -v

# Teste com output
pytest -s
```

## 📋 Endpoints Planejados

### FASE 4A: Portal Jus.br
```
GET /processos/{numero}
  Consultar processo no Portal Jus.br
  Response: {numero, partes, tribunal, andamentos}

GET /processos/{numero}/andamentos
  Histórico de andamentos do processo
```

### FASE 4B: Cálculos Jurídicos
```
POST /calcular/dano-material
  Body: {data_dano, valor_original, tipo_correccao}
  Response: {valor_corrigido, juros, total}

POST /calcular/pensao-alimenticia
  Body: {renda_credor, despesas_credor, renda_devedor, despesas_devedor}
  Response: {necessidade, possibilidade, valor_sugerido}

POST /calcular/dano-moral
  Body: {tipo_dano, descricao, fatores_agravantes}
  Response: {faixa, valor_sugerido, casos_similares}
```

### FASE 4C: IA & RAG
```
POST /analisar/hermenautica
  Body: {fatos, analise_score}
  Response: {ethos, pathos, logos, kairos, jurisprudencia_citada}

POST /analisar/entidades
  Body: {texto}
  Response: {partes, datas, valores, artigos, jurisprudencia}
```

### FASE 4D: e-SAJ Integration
```
POST /peticionamento/enviar
  Body: {peticao_xml, certificado_digital}
  Response: {protocolo, data_envio, numero_processo}
```

## 🔐 Segurança

### Autenticação
- JWT com HS256
- Tokens com expiração 30min
- Refresh tokens (90 dias)

### CORS
- Apenas localhost:5173 (dev frontend)
- Produção: configurar domínios específicos

### Rate Limiting
- 100 req/min por IP
- 10.000 req/dia por usuário

## 🚀 Deploy

### Docker Local
```bash
# Build image
docker build -t lucide-react-backend .

# Run com docker-compose
docker-compose up -d

# Ver logs
docker-compose logs -f api
```

### Staging (AWS EC2)
```bash
# Push image to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
docker tag lucide-react-backend:latest $ECR_URL/lucide-react-backend:latest
docker push $ECR_URL/lucide-react-backend:latest

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 Documentação Adicional

- **API Docs**: http://localhost:8000/docs (Swagger)
- **Arquitetura**: ../docs/ANALISE_VIABILIDADE_*.md
- **Roadmap**: ../docs/PLANO_ACAO_FASE_4.md

## 👥 Contribuindo

1. Create branch: `git checkout -b feature/sua-feature`
2. Código com testes: `pytest`
3. Format: `black . && isort .`
4. PR com descrição clara

## 📞 Suporte

Para dúvidas ou bugs:
- Issues: GitHub Issues
- Email: celiotibes@gmail.com

---

**Status:** Em desenvolvimento - FASE 4A (Portal Jus.br)
**Última atualização:** 4 de julho de 2026
