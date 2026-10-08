# Firebase Security Rules - Quick Start Guide

Guia rápido para implementar regras de segurança no Lucide React.

## 🚀 Instalação Rápida (5 minutos)

### 1. Instalar Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### 2. Copiar e configurar ambiente

```bash
# Copiar exemplo de ambiente
cp firebase/.env.example firebase/.env.local

# Editar com seus valores do Firebase
nano firebase/.env.local
```

### 3. Inicializar Firebase no projeto

```bash
# Se ainda não está inicializado
firebase init

# Selecionar:
# - Firestore
# - Realtime Database
# - Storage
# - Cloud Functions
```

### 4. Deploy das regras

```bash
# Dar permissão de execução ao script
chmod +x firebase/deploy.sh

# Deploy para desenvolvimento
./firebase/deploy.sh lucide-react-dev development

# Deploy para staging
./firebase/deploy.sh lucide-react-staging staging

# Deploy para produção (revise primeiro!)
./firebase/deploy.sh lucide-react-app production
```

## 🔧 Configuração Básica no seu App

### 1. Adicionar ao `src/firebase.ts`

```typescript
import initializeFirebase from '../firebase/client-init';

// Inicializar na startup da aplicação
const { auth, db, storage, realtimeDb, functions } = initializeFirebase();

export { auth, db, storage, realtimeDb, functions };
```

### 2. Usar em componentes React

```typescript
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export function UserProfile() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      if (!auth.currentUser) return;
      
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      setUser(userDoc.data());
    };

    getCurrentUser();
  }, []);

  return <div>{user?.displayName}</div>;
}
```

## 📋 Estrutura de Dados Essencial

### Criar coleção de usuários

```typescript
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';

async function createUserProfile(uid, email, displayName) {
  await setDoc(doc(db, 'users', uid), {
    uid,
    email,
    displayName,
    emailVerified: false,
    role: 'user',
    createdAt: serverTimestamp()
  });
}
```

### Criar projeto

```typescript
async function createProject(name, description) {
  const docRef = await addDoc(collection(db, 'projects'), {
    name,
    description,
    ownerId: auth.currentUser.uid,
    status: 'active',
    createdAt: serverTimestamp()
  });
  return docRef.id;
}
```

## 🔒 Recursos de Segurança Habilitados

- ✅ Autenticação obrigatória
- ✅ Validação de dados
- ✅ Rate limiting
- ✅ Criptografia de dados sensíveis
- ✅ Logs de auditoria
- ✅ Controle de acesso granular
- ✅ Backup automático
- ✅ Gerenciamento de sessão

## 🧪 Testar as Regras

### Usar emulator local

```bash
# Iniciar emulators
firebase emulators:start

# Abre a UI em http://localhost:4000
```

### Rodar testes de segurança

```bash
cd firebase
npm test -- testing/firestore.rules.test.ts
```

## 🎯 Próximos Passos

1. **Implementar autenticação**
   - Email/senha
   - Google/GitHub
   - 2FA (optional)

2. **Configurar banco de dados**
   - Criar estrutura de coleções
   - Adicionar índices
   - Configurar backups

3. **Implementar Cloud Functions**
   - Validação de dados
   - Criptografia
   - Rate limiting

4. **Monitoramento**
   - Ativar logs
   - Configurar alertas
   - Revisar métricas

## 🆘 Troubleshooting

### Erro: "Permission denied"
- Verifique se o usuário está autenticado
- Revise as rules em `firestore.rules`
- Verifique o `uid` está correto

### Erro: "Invalid argument"
- Dados não passam na validação
- Revise o schema esperado
- Use tipos corretos (timestamp, string, etc)

### Emulator não conecta
- Verifique se está rodando: `firebase emulators:start`
- Revise portas (padrão: 8080 para Firestore)
- Limpe cache: `rm -rf ~/.cache/firebase`

## 📚 Documentação Completa

Ver `firebase/README.md` para:
- Exemplos completos de queries
- Estrutura detalhada de dados
- Guia de criptografia
- Referências de API

## 🚨 Checklist de Segurança

Antes de deploy em produção:

- [ ] Testou todas as rules localmente
- [ ] Revisou o arquivo `config.json`
- [ ] Configurou variáveis de ambiente
- [ ] Habilitou verificação de email
- [ ] Habilitou 2FA para admins
- [ ] Criou backup manual
- [ ] Testou rate limiting
- [ ] Configurou logs/alertas
- [ ] Fez backup das rules
- [ ] Notificou o time

## 💡 Dicas Importantes

1. **Sempre teste localmente primeiro**
   ```bash
   firebase emulators:start
   # Testes em http://localhost:4000
   ```

2. **Faça backup antes de deploy**
   ```bash
   ./firebase/deploy.sh lucide-react-app production
   # Backup automático criado em firebase/backups/
   ```

3. **Use diferentes projetos por ambiente**
   - `lucide-react-dev` (desenvolvimento)
   - `lucide-react-staging` (staging)
   - `lucide-react-app` (produção)

4. **Monitorar logs regularmente**
   ```bash
   firebase functions:log
   ```

5. **Documentar mudanças nas rules**
   - Commit das regras no git
   - Inclua mensagem explicando a mudança
   - Crie issue relacionada

## 📞 Suporte

- Erro nas rules? Veja `firebase/README.md`
- Problema de autenticação? Ver seção Authentication
- Taxa de erro alta? Revisar Cloud Functions logs
- Dúvida geral? Consulte a [documentação oficial](https://firebase.google.com/docs)

---

**Próximo passo:** Configurar autenticação em `src/auth/`
