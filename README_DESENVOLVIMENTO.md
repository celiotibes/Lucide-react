# Lucide React - Plataforma de Automação Jurídica

Plataforma moderna para gerenciamento de casos jurídicos, processamento de intimações e conformidade LGPD com automação inteligente.

## 📊 Status do Projeto

### ✅ Completo (100%)
- **API Client** - Axios wrapper com JWT auto-refresh, retry logic e interceptors
- **State Management** - Zustand stores para auth, cases, compliance, intimations
- **Autenticação** - Login/logout, token management, rotas protegidas
- **4 Telas Completas** - Dashboard, Cases, Intimations, Compliance
- **Componentes UI** - 20+ componentes reutilizáveis (Button, Card, Badge, etc)
- **Navegação** - React Router v6 com bottom navigation
- **Styling** - Tailwind CSS com dark theme e glassmorphism
- **Error Handling** - Error boundaries, loading states, toast notifications
- **Documentação** - INTEGRATION_SETUP.md com exemplos de uso

### 🚀 Próximas Tarefas
1. WebSocket para real-time intimations (4-6 horas)
2. E2E tests com Playwright (8-10 horas)
3. Performance optimization (4-6 horas)
4. Storybook documentation (4-6 horas)
5. CI/CD GitHub Actions (4-6 horas)

---

## 🏗️ Arquitetura

```
src/
├── services/
│   └── apiClient.ts          # Axios client com JWT + retry logic
├── stores/
│   ├── authStore.ts          # Zustand: auth state
│   ├── casesStore.ts         # Zustand: cases state
│   ├── complianceStore.ts    # Zustand: compliance state
│   └── intimationsStore.ts   # Zustand: intimations state
├── contexts/
│   └── AuthContext.tsx       # Auth provider + ProtectedRoute
├── screens/
│   ├── LoginScreen.tsx       # Login page
│   ├── DashboardScreen.tsx   # Dashboard (KPIs, timeline, metrics)
│   ├── CasesScreen.tsx       # Cases with search, filters, pagination
│   ├── IntimationsScreen.tsx # Intimations with processing
│   └── ComplianceScreen.tsx  # Compliance with metrics, risk assessment
├── components/
│   ├── ModernComponents.tsx  # 20+ reusable UI components
│   ├── BottomNavigation.tsx  # Navigation between screens
│   ├── ErrorBoundary.tsx     # Global error handling
│   ├── SkeletonLoader.tsx    # Loading skeletons
│   └── Toast.tsx             # Toast notifications
├── hooks/
│   └── useAsync.ts           # Async data fetching hook
├── utils/
│   └── helpers.ts            # 30+ utility functions
├── types/
│   └── index.ts              # Shared TypeScript interfaces
├── constants.ts              # Configuration constants
├── App.tsx                   # Router setup
└── main.tsx                  # Entry point with ErrorBoundary
```

---

## 🚀 Como Começar

### Instalação
```bash
# Clone o repositório
git clone <repo-url>
cd Lucide-react

# Instale as dependências
npm install

# Configure o ambiente
cp .env.example .env.local
# Edite .env.local com sua API URL
```

### Desenvolvimento
```bash
# Inicie o dev server
npm run dev

# Acesse em http://localhost:5173
```

### Build
```bash
# Build para produção
npm run build

# Preview da build
npm run preview
```

### Testes
```bash
# (Próximo passo: adicionar testes E2E com Playwright)
# npm run test:e2e
```

---

## 🔐 Fluxo de Autenticação

### Login
1. Usuário acessa `/login`
2. Preenche email/senha
3. Clica em "Entrar"
4. `apiService.login()` faz POST para `/auth/login`
5. Backend retorna `{ accessToken, refreshToken, expiresIn }`
6. `TokenManager.setTokens()` armazena em localStorage
7. `useAuthStore.user` é atualizado
8. Redirect automático para `/dashboard`

### Token Refresh (Automático)
1. Request é feita com token no header
2. Se backend retorna 401 (token expirado)
3. Request interceptor dispara refresh
4. POST para `/auth/refresh` com refreshToken
5. Novos tokens são salvos
6. Request original é retentado automaticamente
7. Se refresh falha → redirect para `/login`

### Logout
1. Clique em "Sair" no header
2. `apiService.logout()` faz POST para `/auth/logout`
3. `TokenManager.clearTokens()` remove tokens
4. `useAuthStore.user = null`
5. Redirect para `/login`

---

## 📱 Uso de Stores

### Auth Store
```typescript
import { useAuthStore } from '@/stores/authStore'

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuthStore()
  
  return (
    <div>
      {isAuthenticated && <p>Bem-vindo, {user?.name}</p>}
      <button onClick={logout}>Sair</button>
    </div>
  )
}
```

### Cases Store
```typescript
import { useCasesStore } from '@/stores/casesStore'

function CasesList() {
  const { cases, fetchCases, selectCase } = useCasesStore()
  
  useEffect(() => {
    fetchCases({ status: 'active' })
  }, [])
  
  return (
    <div>
      {cases.map(c => (
        <div key={c.id} onClick={() => selectCase(c)}>
          {c.title}
        </div>
      ))}
    </div>
  )
}
```

### Compliance Store
```typescript
import { useComplianceStore } from '@/stores/complianceStore'

function ComplianceDashboard() {
  const { metrics, fetchMetrics } = useComplianceStore()
  
  useEffect(() => {
    fetchMetrics()
  }, [])
  
  return (
    <div>
      {metrics.map(m => (
        <div key={m.id}>
          <h3>{m.name}</h3>
          <progress value={m.value} max={m.target} />
        </div>
      ))}
    </div>
  )
}
```

---

## 🎨 Componentes UI

### Button
```typescript
<Button variant="primary" size="lg" loading={isLoading}>
  Enviar
</Button>
```

### Card
```typescript
<Card hover>
  <h3>Título</h3>
  <p>Conteúdo</p>
</Card>
```

### KPI Card
```typescript
<KPICard
  label="Casos Ativos"
  value={42}
  trend={{ value: 15, direction: 'up' }}
  color="purple"
/>
```

### Alert
```typescript
<Alert type="error" title="Erro">
  Algo deu errado
</Alert>
```

### Modal
```typescript
<Modal isOpen={isOpen} title="Detalhes" onClose={() => setIsOpen(false)}>
  <p>Conteúdo do modal</p>
</Modal>
```

### Tabs
```typescript
<Tabs tabs={[
  { id: 'tab1', label: 'Tab 1', content: <div>Conteúdo 1</div> },
  { id: 'tab2', label: 'Tab 2', content: <div>Conteúdo 2</div> },
]} />
```

---

## 🔧 Utilitários

```typescript
import { 
  formatDate, 
  getDaysUntilDeadline,
  getStatusColor,
  truncate,
  formatCurrency,
  isEmail
} from '@/utils/helpers'

// Data
formatDate('2026-12-31') // "31/12/2026"
getDaysUntilDeadline('2026-12-31') // número de dias até prazo

// Status
getStatusColor('active') // "bg-green-500/20 text-green-400"

// String
truncate('texto muito longo...', 20) // "texto muito longo..."

// Número
formatCurrency(1500) // "R$ 1.500,00"

// Validação
isEmail('user@email.com') // true
```

---

## 📊 Dados de Exemplo

### Para testar sem backend

```typescript
// Create mock data in store
const mockCases = [
  {
    id: '1',
    number: 'PROC-001',
    status: 'active',
    title: 'Processo Civil #1',
    deadline: '2026-12-31',
    progress: 65,
    clientName: 'Cliente A'
  }
]

// Use em desenvolvimento
useCasesStore.setState({ cases: mockCases })
```

---

## 🧪 Testing Strategy

### Unit Tests
- Stores (Zustand)
- Utilities (helpers.ts)
- Components (ModernComponents.tsx)

### E2E Tests (Próximo passo)
- Login flow
- Cases CRUD
- Intimations processing
- Compliance metrics

### Performance Tests
- Bundle size
- Runtime performance
- API response times

---

## 🚀 Deployment

### Requisitos
- Node.js 20+
- npm ou yarn
- Backend API rodando

### Variáveis de Ambiente
```env
VITE_API_URL=https://api.production.com/v1
```

### Build & Deploy
```bash
# Build
npm run build

# Resultado em dist/
# Deploy usando: Vercel, Netlify, GitHub Pages, ou seu servidor

# Vercel (recomendado)
npm install -g vercel
vercel deploy
```

---

## 📚 Documentação Adicional

- `INTEGRATION_SETUP.md` - Setup completo de integração
- `src/types/index.ts` - Interfaces TypeScript
- `src/constants.ts` - Configurações
- `src/utils/helpers.ts` - Funções auxiliares

---

## 🐛 Troubleshooting

### "Cannot GET /api/v1/auth/login"
- Backend não está rodando
- `VITE_API_URL` está incorreta em `.env.local`

### "401 Unauthorized"
- Token expirou, faça login novamente
- Refresh token inválido

### "Network Error"
- Verifique conexão com a internet
- Verifique se backend está acessível

### Componentes não carregam
- Verifique imports
- Verifique se Tailwind CSS está funcionando

---

## 📈 Próximos Passos

1. **WebSocket** (Real-time intimations)
   - Usar `socket.io` ou `ws`
   - Setup em `src/services/websocket.ts`
   - Integrar em `IntimationsScreen`

2. **E2E Tests** (Playwright)
   - Setup em `e2e/` directory
   - Tests para cada screen

3. **Performance**
   - Code splitting por rota
   - Image optimization
   - Bundle analysis

4. **Storybook**
   - Document cada componente
   - Visual regression tests

5. **CI/CD**
   - GitHub Actions workflow
   - Auto-deploy em push
   - Run tests em PR

---

## 🤝 Contribuindo

1. Crie uma branch: `git checkout -b feat/nova-feature`
2. Commit: `git commit -m "feat: descrição"`
3. Push: `git push origin feat/nova-feature`
4. Abra PR com descrição detalhada

---

## 📝 Licença

Este projeto é propriedade da organização.

---

**Criado com ❤️ para automação jurídica**  
**Última atualização: 18 de Julho, 2026**
