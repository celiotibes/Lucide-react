# Firebase Security Rules - Troubleshooting Guide

Guia de resolução de problemas comuns ao trabalhar com regras de segurança do Firebase.

## 🔍 Problemas Comuns

### 1. Permission Denied ao Ler/Escrever

**Sintoma:** `Error: PERMISSION_DENIED: Missing or insufficient permissions`

**Causas Possíveis:**
- Usuário não está autenticado
- UID do usuário não corresponde à rule
- Validação de dados falhando
- Estrutura de dados incorreta

**Solução:**

```typescript
// Verificar autenticação
import { getAuth } from 'firebase/auth';

const auth = getAuth();
if (!auth.currentUser) {
  console.log('Usuário não autenticado');
  return;
}

// Verificar UID na rule
console.log('UID atual:', auth.currentUser.uid);

// Testar com emulator
firebase emulators:start
// Abrir http://localhost:4000
```

**Debug Rules:**

```firestore
// Adicionar debug temporário
function isOwner(uid) {
  let result = request.auth.uid == uid;
  debug('isOwner:', result, 'request.auth.uid:', request.auth.uid, 'uid:', uid);
  return result;
}
```

### 2. Validação de Dados Falha

**Sintoma:** `Error: Document failed validation`

**Causas Possíveis:**
- Campo obrigatório faltando
- Tipo de dado incorreto
- Validação de regex falhando
- Tamanho de string excedido

**Solução:**

```typescript
// Validar no cliente também
function validateProject(data) {
  const errors = [];
  
  if (!data.name) errors.push('name é obrigatório');
  if (typeof data.name !== 'string') errors.push('name deve ser string');
  if (data.name.length > 255) errors.push('name não pode exceder 255 chars');
  if (data.status !== 'active' && data.status !== 'archived') {
    errors.push('status inválido');
  }
  
  return errors;
}

// Usar antes de enviar
const errors = validateProject(projectData);
if (errors.length > 0) {
  console.error('Validação falhou:', errors);
  return;
}

// Enviar apenas se válido
await setDoc(doc(db, 'projects', projectId), projectData);
```

**Verificar Rules:**

```bash
# Abrir console do Firestore e verificar validação
firebase emulators:start

# Testar manualmente a rule
match /projects/{projectId} {
  allow write: if debug(request.resource.data) &&
                  debug('status:', request.resource.data.status) &&
                  request.resource.data.status in ['active', 'archived'];
}
```

### 3. Rate Limiting Acionado

**Sintoma:** `Error: Resource exhausted` ou muito muitas requisições

**Causas Possíveis:**
- Query em loop sem limit
- Polling muito frequente
- Listener não desinstalado
- Teste com dados demais

**Solução:**

```typescript
// Usar listeners em vez de polling
import { onSnapshot } from 'firebase/firestore';

// ❌ Errado: Polling a cada 1 segundo
setInterval(async () => {
  const doc = await getDoc(doc(db, 'users', uid));
  updateUI(doc.data());
}, 1000);

// ✅ Correto: Usar listener
const unsubscribe = onSnapshot(doc(db, 'users', uid), (doc) => {
  updateUI(doc.data());
});

// Desinscrever quando não precisar
unsubscribe();

// Implementar rate limiting no cliente
async function apiCallWithLimit(fn) {
  const remaining = await checkRateLimit(functions, 'api', 60, 60);
  if (remaining <= 0) {
    throw new Error('Rate limit exceeded');
  }
  return fn();
}
```

**Otimizar Queries:**

```typescript
// ❌ Errado: Sem limit
const q = query(collection(db, 'users'));
const snapshot = await getDocs(q);

// ✅ Correto: Com limit
const q = query(collection(db, 'users'), limit(20));
const snapshot = await getDocs(q);

// ✅ Melhor: Com paginação
const q = query(
  collection(db, 'users'),
  limit(20),
  startAfter(lastDoc)
);
```

### 4. Emulator Não Conecta

**Sintoma:** `Error: Emulator is not running on localhost:8080`

**Causas Possíveis:**
- Emulator não iniciado
- Porta em uso
- Firewall bloqueando
- Configuração incorreta

**Solução:**

```bash
# Verificar se emulator está rodando
ps aux | grep firebase-emulator

# Matar processo se necessário
kill -9 <PID>

# Limpar cache
rm -rf ~/.cache/firebase

# Iniciar emulators
firebase emulators:start

# Em outra aba, rodar testes
npm test
```

**Se porta está em uso:**

```bash
# Encontrar processo usando porta 8080
lsof -i :8080

# Usar porta diferente
firebase emulators:start --firestore-port=9090
```

### 5. Dados Sensíveis Vazando

**Sintoma:** Consegue ler dados que não deveria ter acesso

**Causas Possíveis:**
- Rule muito permissiva
- Sem validação de ownership
- Admin retornando dados sensíveis
- Criptografia não implementada

**Solução:**

```typescript
// ❌ Errado: Admin retorna senha
export const getUserData = onCall(async (data, context) => {
  if (!context.auth) throw new Error('Unauthenticated');
  
  const user = await db.collection('users').doc(data.uid).get();
  return user.data(); // Retorna tudo, incluindo hash de senha
});

// ✅ Correto: Remover campos sensíveis
export const getUserData = onCall(async (data, context) => {
  if (!context.auth) throw new Error('Unauthenticated');
  if (data.uid !== context.auth.uid && !isAdmin(context.auth.uid)) {
    throw new Error('Unauthorized');
  }
  
  const user = await db.collection('users').doc(data.uid).get();
  const userData = user.data();
  
  // Remover campos sensíveis
  delete userData.passwordHash;
  delete userData.twoFactorSecret;
  
  return userData;
});

// ✅ Ou melhor: Usar rules para controlar
match /users/{uid} {
  allow read: if request.auth.uid == uid;
  
  // Não retorna campos sensíveis
  match /security/{secId} {
    allow read, write: if request.auth.uid == uid;
  }
}
```

**Auditar dados:**

```bash
# Exportar dados com regras
firebase firestore:export backup.json --project=lucide-react-dev

# Revisar manualmente o arquivo
# Verificar se dados sensíveis estão visíveis
```

### 6. Emails Não Verificados

**Sintoma:** Usuários conseguem fazer login sem verificar email

**Causas Possíveis:**
- Verificação não implementada
- Cloud Function com erro
- Usuário pula a verificação
- Timestamp incorreto

**Solução:**

```typescript
// Forçar verificação de email
import { sendEmailVerification } from 'firebase/auth';

export const signUp = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    
    const user = userCredential.user;
    
    // Enviar email de verificação
    await sendEmailVerification(user);
    
    // Criar documento do usuário com emailVerified=false
    await setDoc(doc(db, 'users', user.uid), {
      email,
      emailVerified: false,
      createdAt: serverTimestamp()
    });
    
    return user;
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
};

// Verificar email antes de permitir acesso
export const checkEmailVerification = async (user) => {
  // Recarregar user do servidor
  await user.reload();
  
  if (!user.emailVerified) {
    throw new Error('Email not verified. Please check your inbox.');
  }
  
  // Atualizar Firestore
  await updateDoc(doc(db, 'users', user.uid), {
    emailVerified: true,
    emailVerifiedAt: serverTimestamp()
  });
  
  return true;
};
```

### 7. Performance Lenta

**Sintoma:** Queries levando muito tempo, muitos reads

**Causas Possíveis:**
- Query sem índice
- Polling em loop
- Fetch de dados desnecessários
- Sem paginação

**Solução:**

```typescript
// Adicionar índices nas rules
match /projects/{projectId} {
  allow read: if isAuthenticated();
  
  // Adicionar índice para essa query
  // Query: where('ownerId', '==', uid).orderBy('createdAt', 'desc')
}

// Firestore akan sugerir criar índice se necessário

// Otimizar queries
const q = query(
  collection(db, 'projects'),
  where('ownerId', '==', auth.currentUser.uid),
  orderBy('createdAt', 'desc'),
  limit(20) // Sempre incluir limit
);

// Usar pagination
const getMoreProjects = (lastVisible) => {
  return query(
    collection(db, 'projects'),
    where('ownerId', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc'),
    startAfter(lastVisible),
    limit(20)
  );
};
```

### 8. Backup Falha

**Sintoma:** Backup não é criado automaticamente

**Causas Possíveis:**
- Cloud Function com erro
- Permissões insuficientes
- Cota excedida
- Estrutura de dados mudou

**Solução:**

```bash
# Verificar logs da Cloud Function
firebase functions:log

# Testar backup manualmente
firebase firestore:export backup_manual.json --project=lucide-react-dev

# Verificar se arquivo foi criado
ls -la backup_manual.json

# Testar restore
firebase firestore:import backup_manual.json --project=lucide-react-dev
```

## 🛠️ Ferramentas de Debug

### Firebase CLI

```bash
# Ver logs de funções
firebase functions:log --limit 50

# Testar regras localmente
firebase rules:test

# Limpar dados do emulator
firebase emulators:start --import=./backup

# Exportar dados
firebase firestore:export ./backup
```

### Node.js Admin SDK

```typescript
import * as admin from 'firebase-admin';

// Verificar regras sem permissão
const db = admin.firestore();

// Usar app com admin credentials
const userDoc = await db.collection('users').doc('uid123').get();

// Verificar estrutura
console.log(userDoc.data());

// Contar documentos
const count = await db.collection('users').count().get();
console.log('Total users:', count.data().count);
```

### Browser DevTools

```javascript
// No console do navegador
// Testar autenticação
firebase.auth().currentUser; // Mostrar usuário atual

// Testar Firestore
db.collection('users').doc(firebase.auth().currentUser.uid).get()
  .then(doc => console.log(doc.data()))
  .catch(e => console.error('Erro:', e.message));
```

## 📈 Monitoramento Contínuo

### Métricas Importantes

```bash
# Verificar read/write operations
firebase emulators:logs --services=firestore

# Monitorar latência
firebase functions:log --raw

# Verificar quotas
# Ir para: Firebase Console > Firestore > Usage
```

### Alertas Automáticos

```typescript
// Configurar alertas no Firestore
// Firebase Console > Firestore > Usage > Set alert

// Configurar funções de monitoramento
export const monitorStorage = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const stats = await admin.firestore()
      .collection('projects')
      .get();
    
    const totalSize = stats.docs.reduce((sum, doc) => {
      return sum + JSON.stringify(doc.data()).length;
    }, 0);
    
    if (totalSize > 900 * 1024 * 1024) { // 900MB de 1GB
      console.warn('Storage quota 90% used');
      // Enviar alerta
    }
  });
```

## 🔄 Debugging de Segurança

### Verificar Permissões

```typescript
// Testar se rule funciona
async function testRule(path, data) {
  try {
    const ref = doc(db, path);
    await setDoc(ref, data);
    console.log('✅ Write permitido');
  } catch (e) {
    console.log('❌ Write bloqueado:', e.message);
  }
}

// Testar
testRule('users/test123', { name: 'Test' });
```

### Validação de Rules

```firestore
// Adicionar logs de debug
match /users/{uid} {
  allow read: if
    debug('Checking read access') &&
    debug('auth.uid:', request.auth.uid) &&
    debug('doc.uid:', resource.data.uid) &&
    request.auth.uid == uid;
}
```

### Análise de Logs

```bash
# Exportar logs
firebase functions:log > logs.txt

# Procurar erros
grep -i "error\|deny\|permission" logs.txt

# Contar ocorrências
grep "permission denied" logs.txt | wc -l
```

## 📞 Quando Pedir Ajuda

Abra uma issue com:

1. **Descrição clara** do problema
2. **Mensagem de erro** completa
3. **Passos para reproduzir**
4. **Regra relevante** em firestore.rules
5. **Código** que está falhando
6. **Ambiente** (dev/staging/prod)

Exemplo:

```markdown
## Problema
User não consegue escrever em sua própria coleção.

## Erro
PERMISSION_DENIED: Missing or insufficient permissions

## Regra
match /projects/{projectId} {
  allow write: if request.auth.uid == resource.data.ownerId;
}

## Código
const docRef = await setDoc(doc(db, 'projects', projectId), {
  name: 'Test',
  ownerId: auth.currentUser.uid
});

## Esperado
Documento deve ser criado com sucesso.

## Resultado
Erro de permissão.
```

---

**Próximo:** Se o problema persistir, consulte [README.md](./README.md) para documentação completa.
