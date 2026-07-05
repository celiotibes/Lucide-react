# Legal Automation Tool - eProc TJSC & Projudi TJPR

Ferramenta de automação para peticionar, consultar e baixar documentos processuais nos sistemas eProc (TJSC) e Projudi (TJPR).

## 📋 Funcionalidades

- **Autenticação Segura**: Certificado digital OAB + 2FA
- **Consulta de Processos**: Via API DataJud (CNJ)
- **Download de Peças**: Acesso a documentos e processos completos
- **Peticionamento Automático**: Via PROJUDI WebService e eProc
- **Pesquisa Avançada**: Filtros por número, partes, datas

## 🏗️ Arquitetura

```
legal-automation/
├── src/
│   ├── auth/              # Autenticação e certificado digital
│   ├── datajud/           # Integração API CNJ DataJud
│   ├── projudi/           # Integração PROJUDI TJPR (SOAP)
│   ├── eproc/             # Integração eProc TJSC
│   ├── api/               # Express API REST
│   ├── services/          # Lógica de negócio
│   └── utils/             # Helpers e config
├── tests/                 # Testes unitários e integração
├── docs/                  # Documentação técnica
└── docker/                # Dockerfiles e compose
```

## 🔐 Fluxo de Autenticação

```
1. Upload Certificado (.pfx)
   ↓
2. Armazenar com Senha (Node-forge)
   ↓
3. 2FA Interativo (QR Code / SMS)
   ↓
4. Gerar JWT com Sessão
   ↓
5. Usar em Requisições Subsequentes
   ↓
6. Refresh Automático antes de Expirar
```

## 🚀 Quick Start

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env

# Iniciar servidor
npm run dev

# Rodar testes
npm test

# Build produção
npm run build
```

## 📚 Integrations

### DataJud (CNJ) - REST API
- Acesso: Public (chave API)
- Função: Pesquisa de processos públicos
- Rate Limit: Documentado no portal

### Projudi (TJPR) - SOAP WebService
- Acesso: Restrito (certificado OAB)
- Função: Peticionamento, consultas, downloads
- WSDL: `https://tst.tjpr.jus.br/projudi/webservices/projudiIntercomunicacaoWebService222?wsdl`

### eProc (TJSC) - REST API
- Acesso: Certificado OAB + 2FA
- Função: Peticionamento, consultas, downloads
- Documentação: Contatar tribunal

## 📖 Documentação

- [Autenticação](./docs/AUTHENTICATION.md)
- [DataJud API](./docs/DATAJUD.md)
- [Projudi Integração](./docs/PROJUDI.md)
- [eProc Integração](./docs/EPROC.md)
- [API REST](./docs/API.md)

## ⚖️ Conformidade Legal

- ✅ LGPD: Decisões não são automáticas (apenas auxiliar)
- ✅ CNJ: Respeita regulamentações de acesso
- ✅ ICP-Brasil: Certificado digital validado
- ✅ OAB: Requer registro profissional

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Linguagem**: TypeScript
- **Framework**: Express.js
- **SOAP**: node-soap
- **Certificado**: jsrsasign / node-forge
- **JWT**: jsonwebtoken
- **DB**: PostgreSQL (opcional para sessões)
- **Cache**: Redis (opcional)

## 📝 Status

- [x] Estrutura inicial
- [ ] Autenticação certificado digital
- [ ] DataJud integração
- [ ] Projudi SOAP client
- [ ] eProc integração
- [ ] Download de documentos
- [ ] Peticionamento básico
- [ ] Testes E2E
- [ ] Docker setup

## 🤝 Contribuir

Faça um fork, crie uma branch feature e submeta um PR.

## ⚠️ Disclaimer

Esta ferramenta é auxiliar. Qualquer automação deve ter revisão humana obrigatória antes de petições. Responsabilidade total do operador sobre conformidade legal.

## 📧 Suporte

Para questões técnicas: celiotibes@gmail.com
