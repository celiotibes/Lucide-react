# Setup de Integração - Lucide React

## ✅ Completado

### 1. **Serviços & API Client**
- ✅ `src/services/apiClient.ts` - Cliente Axios completo com:
  - JWT auto-refresh
  - Retry logic com exponential backoff
  - Interceptors para request/response
  - Tipos TypeScript completos
  - Todos os endpoints mapeados

### 2. **State Management (Zustand)**
- ✅ `src/stores/authStore.ts` - Autenticação e perfil
  - login(email, password)
  - logout()
  - refreshUser()
  - user, isAuthenticated, isLoading, error

- ✅ `src/stores/casesStore.ts` - Gerenciamento de casos
  - fetchCases(), fetchCaseDetail(), createCase(), updateCase(), deleteCase()
  - cases[], selectedCase, isLoading, error

- ✅ `src/stores/complianceStore.ts` - Métricas de compliance
  - fetchMetrics(), fetchRiskAssessment(), fetchAuditTrail()
  - metrics[], summary, riskAssessment, auditTrail

- ✅ `src/stores/intimationsStore.ts` - Gerenciamento de intimações
  - fetchIntimations(), processIntimation(), updateIntimationResponse()
  - intimations[], selectedIntimation, isLoading

### 3. **Autenticação & Proteção de Rotas**
- ✅ `src/contexts/AuthContext.tsx`
  - `<AuthProvider>` - Inicializa autenticação
  - `<ProtectedRoute>` - Protege rotas privadas
  - Redirect automático para /login

### 4. **Telas & Componentes**
- ✅ `src/screens/LoginScreen.tsx` - Login com Tailwind
  - Email/Password inputs
  - Error display
  - Loading state
  - Redirect ao dashboard após login

- ✅ `src/screens/DashboardScreen.tsx` - Dashboard principal
  - 4 KPI cards
  - Lista de casos com filtros
  - Métricas de compliance
  - Logout button

### 5. **Roteamento**
- ✅ React Router v6 configurado
  - `/login` - LoginScreen
  - `/dashboard` - DashboardScreen (protegido)
  - `/` → redirect para /dashboard

### 6. **Styling**
- ✅ Tailwind CSS configurado
- ✅ Dark theme premium
- ✅ Glassmorphism effects
- ✅ Responsive design

---

## 📝 Como Usar

### Exemplo 1: Fetch de Casos em um Componente

```tsx
import { useCasesStore } from '../stores/casesStore'

function MyComponent() {
  const { cases, isLoading, error, fetchCases } = useCasesStore()

  useEffect(() => {
    fetchCases({ status: 'active' })
  }, [])

  if (isLoading) return <div>Carregando...</div>
  if (error) return <div>Erro: {error}</div>

  return (
    <div>
      {cases.map(c => (
        <div key={c.id}>{c.title}</div>
      ))}
    </div>
  )
}
```

### Exemplo 2: Login Programático

```tsx
import { useAuthStore } from '../stores/authStore'

function LoginForm() {
  const { login, isLoading, error } = useAuthStore()

  const handleLogin = async () => {
    try {
      await login('user@email.com', 'password123')
      // Usuário será redirecionado automaticamente
    } catch (err) {
      console.error('Login failed')
    }
  }

  return <button onClick={handleLogin}>Login</button>
}
```

### Exemplo 3: Compliance Metrics

```tsx
import { useComplianceStore } from '../stores/complianceStore'

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

## 🔧 Configuração

### Environment Variables
Editar `.env.local`:
```env
VITE_API_URL=http://localhost:3000/api/v1
```

### API Base URL
- Definido em: `src/services/apiClient.ts` linha 25
- Padrão: `http://localhost:3000/api/v1`
- Sobrescritível via: `VITE_API_URL` env var

---

## 🚀 Próximas Tarefas

### Imediato (1-2 horas)
- [ ] Testar com backend local
- [ ] Validar login flow
- [ ] Testar casos fetch
- [ ] Verificar compliance metrics

### Curto Prazo (2-4 horas)
- [ ] Criar CasesScreen completa
- [ ] Criar IntimationsScreen completa
- [ ] Criar ComplianceScreen completa
- [ ] Integrar ModernComponents para UI polida

### Médio Prazo (4-8 horas)
- [ ] WebSocket para real-time intimations
- [ ] Error boundaries
- [ ] Loading skeletons
- [ ] Toast notifications
- [ ] Modal detalhes

### Longo Prazo
- [ ] E2E tests
- [ ] Performance optimization
- [ ] Analytics integration
- [ ] PWA setup

---

## 📊 Estrutura de Arquivos

```
src/
├── services/
│   └── apiClient.ts          # Axios client + ApiService
├── stores/
│   ├── authStore.ts          # Auth state (Zustand)
│   ├── casesStore.ts         # Cases state
│   ├── complianceStore.ts    # Compliance state
│   └── intimationsStore.ts   # Intimations state
├── contexts/
│   └── AuthContext.tsx       # Auth provider + ProtectedRoute
├── screens/
│   ├── LoginScreen.tsx       # Login page
│   └── DashboardScreen.tsx   # Dashboard page
├── App.tsx                   # Router setup
└── index.css                 # Tailwind styles
```

---

## 🔐 Segurança

- ✅ Tokens armazenados em localStorage
- ✅ JWT auto-refresh com fila de requests
- ✅ Rotas privadas protegidas
- ✅ Logout automático em 401
- ✅ Retry logic para network errors

---

## 🧪 Testando Localmente

### 1. Inicie o backend
```bash
# No diretório do backend
npm run dev
```

### 2. Configure o frontend
```bash
# No diretório do frontend (Lucide-react)
npm install
npm run dev
```

### 3. Teste o fluxo
1. Abra `http://localhost:5173`
2. Vá para `/login`
3. Use credenciais de teste (configuradas no backend)
4. Verifique redirect para `/dashboard`
5. Verifique que casos e compliance carregam

---

## ⚙️ Troubleshooting

### Erro: "Cannot GET /api/v1/auth/login"
**Solução:** Backend não está rodando. Verifique se `npm run dev` foi executado no backend.

### Erro: "401 Unauthorized"
**Solução:** Token expirou. Faça login novamente.

### Erro: "Network Error"
**Solução:** Verificar VITE_API_URL em `.env.local`. Deve apontar para o backend correto.

### Store sempre vazio
**Solução:** Verificar se `fetchCases()` / `fetchMetrics()` foi chamado. Pode estar em estado `isLoading: true`.

---

## 📚 Referências

- [Zustand Docs](https://github.com/pmndrs/zustand)
- [Axios Docs](https://axios-http.com/)
- [React Router v6](https://reactrouter.com/)
- [Tailwind CSS](https://tailwindcss.com/)
