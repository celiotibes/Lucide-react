# 🚀 Quick Start - Lucide React

Comece em **5 minutos**!

## 1️⃣ Instalação

```bash
# Clone o repositório
git clone <repo-url>
cd Lucide-react

# Execute setup automático
chmod +x setup.sh
./setup.sh

# Ou faça manualmente
npm install
cp .env.example .env.local
```

## 2️⃣ Desenvolvimento

```bash
# Inicie o dev server
npm run dev

# Acesse http://localhost:5173
```

**Mock Data está ativado por padrão!**
- Você pode testar toda a interface sem backend

## 3️⃣ Testes

### Testes E2E
```bash
# Rodar testes E2E
npm run test:e2e

# Interface visual
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug
```

## 4️⃣ Formatação & Linting

```bash
# Formatar código
npm run format

# Verificar lint
npm run lint
```

## 5️⃣ Build para Produção

```bash
# Build
npm run build

# Preview da build
npm run preview

# Deploy (Vercel)
npm install -g vercel
vercel deploy
```

---

## 🎯 Fluxo de Trabalho Recomendado

### Seu Primeiro Dia
```
1. ./setup.sh
2. npm run dev
3. Explorar http://localhost:5173
4. Ler INTEGRATION_SETUP.md
```

### Desenvolvendo Novo Feature
```
1. Criar branch: git checkout -b feat/seu-feature
2. Editar código (mock data disponível)
3. npm run format (antes de commit)
4. npm run test:e2e (testar)
5. git commit
6. git push origin feat/seu-feature
```

---

## 📊 Estrutura Rápida

```
src/
├── screens/          # Telas principais
├── components/       # UI componentes
├── stores/          # Estado (Zustand)
├── services/        # API client
├── mocks/           # Mock data
└── contexts/        # Contextos (Auth, Toast)

e2e/                 # Testes automatizados
```

---

## 🔑 Comandos Essenciais

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Iniciar dev server |
| `npm run build` | Build para produção |
| `npm run format` | Formatar código |
| `npm run lint` | Verificar code quality |
| `npm run test:e2e` | Rodar testes E2E |

---

## 🐛 Troubleshooting

### "Cannot find module"
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Port 5173 already in use"
```bash
npm run dev -- --port 3000
```

### "VITE_API_URL not defined"
```bash
# Edite .env.local
VITE_API_URL=http://localhost:3000/api/v1
```

### Testar sem mock data
```javascript
// No console do navegador
localStorage.setItem('ENABLE_MOCK_DATA', 'false')
location.reload()
```

---

## 📚 Documentação Completa

- **README_DESENVOLVIMENTO.md** - Guia completo
- **INTEGRATION_SETUP.md** - Integração com backend
- **src/types/index.ts** - Tipos TypeScript
- **src/constants.ts** - Configurações

---

## 🚀 Deploy Rápido

### Vercel (Recomendado)
```bash
npm install -g vercel
vercel deploy
```

### GitHub Pages
```bash
npm run build
# Fazer upload da pasta dist/
```

### Docker
```bash
docker build -t lucide-react .
docker run -p 80:5173 lucide-react
```

---

## 💡 Tips

✅ Mock data é automático - não precisa de backend para começar
✅ Prettier formata automaticamente - configure sua IDE
✅ E2E tests já estão prontos - adicione mais conforme necessário
✅ TypeScript strict mode - melhor DX e menos bugs

---

**Pronto para começar?** 🎉

```bash
./setup.sh && npm run dev
```

Abra http://localhost:5173 e explore!
