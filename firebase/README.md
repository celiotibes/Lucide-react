# Firebase Security Rules - Lucide React

Implementação completa de regras de segurança para Firebase (Firestore, Realtime Database, Storage e Authentication) seguindo o princípio do **menor privilégio (Least Privilege)**.

## 📋 Conteúdo

- **firestore.rules** - Regras de segurança para Firestore
- **database.rules** - Regras para Realtime Database
- **storage.rules** - Regras para Cloud Storage
- **functions/validateData.ts** - Cloud Functions para validação
- **config.json** - Configuração centralizada

## 🔐 Princípios de Segurança

### 1. Autenticação Obrigatória
Todos os acessos requerem autenticação válida do Firebase Auth.

```typescript
function isAuthenticated() {
  return request.auth != null;
}
```

### 2. Validação de Dados
Todos os dados são validados antes de serem armazenados:
- Tipos de dados
- Tamanho máximo
- Formato e padrão
- Regras de negócio

### 3. Princípio do Menor Privilégio
Cada usuário tem o mínimo de acesso necessário:
- Usuários normais: apenas seus próprios dados
- Editores: dados da equipe/projeto
- Admins: acesso total com auditoria

### 4. Rate Limiting
Prevenção de abuso através de limite de requisições:
- Leitura: 1000 req/min
- Escrita: 100 req/min
- Upload: 10 arquivos/min

### 5. Criptografia
Dados sensíveis são criptografados em trânsito e em repouso:
- TLS 1.3 para transmissão
- AES-256-GCM para armazenamento
- Rotação de chaves a cada 90 dias

## 📁 Estrutura de Dados

### Firestore

```
users/
├── {uid}/
│   ├── email: string
│   ├── displayName: string
│   ├── role: 'user' | 'admin'
│   ├── createdAt: timestamp
│   ├── preferences/
│   │   └── {prefId}/theme, language, notifications
│   ├── security/
│   │   └── {secId}/twoFactorEnabled, lastPasswordChange
│   └── encrypted/
│       └── {docId}/encryptedData, iv, salt

projects/
├── {projectId}/
│   ├── name: string
│   ├── ownerId: string
│   ├── status: 'active' | 'archived'
│   ├── createdAt: timestamp
│   ├── members/
│   │   └── {memberId}/role, joinedAt
│   ├── tasks/
│   │   └── {taskId}/title, status, assignees
│   └── files/
│       └── {fileId}/url, size, sharedWith

activityLogs/
├── {logId}/
│   ├── userId: string
│   ├── action: string
│   ├── timestamp: timestamp
│   └── details: object

notifications/
├── {notificationId}/
│   ├── userId: string
│   ├── type: string
│   ├── read: boolean
│   └── createdAt: timestamp
```

### Realtime Database

```json
{
  "users": {
    "$uid": {
      "profile": { "displayName": "", "photoURL": "" },
      "email": "",
      "preferences": { "theme": "", "language": "" },
      "security": { "twoFactorEnabled": false }
    }
  },
  "projects": {
    "$projectId": {
      "name": "",
      "ownerId": "",
      "members": { "$memberId": { "role": "", "joinedAt": "" } },
      "tasks": { "$taskId": { "title": "", "status": "" } }
    }
  },
  "notifications": {
    "$userId": {
      "$notificationId": { "type": "", "timestamp": "", "read": false }
    }
  }
}
```

### Cloud Storage

```
gs://bucket-name/
├── users/{uid}/
│   ├── avatar/{filename}
│   ├── documents/{filenames}
│   └── media/{type}/{filenames}
├── projects/{projectId}/
│   └── {filenames}
├── temp/{uid}/{uploadId}/
│   └── {filenames}
├── backups/{uid}/{timestamp}/
│   └── {filename}
└── public/
    └── {assets}
```

## 🔒 Exemplos de Queries Seguras

### 1. Firestore - Buscar dados do usuário autenticado

```typescript
import { getAuth } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';

async function getUserData(db) {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User not authenticated');
  }

  const userRef = collection(db, 'users', user.uid);
  const data = await getDocs(userRef);
  
  return data.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

### 2. Firestore - Buscar projetos do usuário

```typescript
async function getUserProjects(db, userId) {
  const projectsRef = collection(db, 'projects');
  const q = query(projectsRef, where('ownerId', '==', userId));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

### 3. Firestore - Criar projeto com validação

```typescript
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

async function createProject(db, auth, projectData) {
  // Validação no cliente
  if (!projectData.name || projectData.name.length === 0) {
    throw new Error('Project name is required');
  }

  if (projectData.name.length > 255) {
    throw new Error('Project name must not exceed 255 characters');
  }

  try {
    const docRef = await addDoc(collection(db, 'projects'), {
      name: projectData.name,
      description: projectData.description || '',
      ownerId: auth.currentUser.uid,
      status: 'active',
      createdAt: serverTimestamp()
    });

    return docRef.id;
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}
```

### 4. Firestore - Adicionar membro ao projeto

```typescript
async function addProjectMember(db, functions, projectId, userId, role) {
  const validateProjectMemberAccess = httpsCallable(
    functions,
    'validateProjectMemberAccess'
  );

  try {
    const result = await validateProjectMemberAccess({
      projectId,
      userId,
      action: 'add',
      role
    });

    return result.data;
  } catch (error) {
    console.error('Error adding member:', error.message);
    throw error;
  }
}
```

### 5. Firestore - Buscar tarefas com filtros

```typescript
async function getProjectTasks(db, projectId, filters = {}) {
  const tasksRef = collection(db, 'projects', projectId, 'tasks');
  
  let q = query(tasksRef);

  if (filters.status) {
    q = query(tasksRef, where('status', '==', filters.status));
  }

  if (filters.priority) {
    q = query(
      tasksRef,
      where('status', '==', filters.status || 'todo'),
      where('priority', '==', filters.priority)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

### 6. Realtime Database - Escutar alterações em tempo real

```typescript
import { getDatabase, ref, onValue } from 'firebase/database';

function subscribeToNotifications(db, userId, callback) {
  const notificationsRef = ref(db, `notifications/${userId}`);
  
  const unsubscribe = onValue(notificationsRef, (snapshot) => {
    const data = snapshot.val();
    callback(data ? Object.entries(data).map(([id, value]) => ({
      id,
      ...value
    })) : []);
  });

  return unsubscribe;
}
```

### 7. Cloud Storage - Upload de arquivo seguro

```typescript
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

async function uploadFile(storage, userId, file) {
  // Validações no cliente
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    throw new Error('File size exceeds 50MB limit');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('File type not allowed');
  }

  try {
    const fileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `users/${userId}/documents/${fileName}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    
    return downloadUrl;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}
```

### 8. Criptografia de dados sensíveis

```typescript
import { doc, collection, setDoc } from 'firebase/firestore';
import { encryptData } from './firebase/functions/validateData';

async function storeSensitiveData(db, userId, sensitiveData) {
  try {
    const encryptionKey = process.env.REACT_APP_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const { encrypted, iv, salt } = encryptData(
      JSON.stringify(sensitiveData),
      encryptionKey
    );

    await setDoc(doc(db, 'users', userId, 'encrypted', 'data'), {
      encryptedData: encrypted,
      iv,
      salt,
      userId,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error storing sensitive data:', error);
    throw error;
  }
}
```

### 9. Rate Limiting - Verificar limite

```typescript
import { httpsCallable } from 'firebase/functions';

async function checkRateLimit(functions, type = 'api', limit = 60, window = 60) {
  const checkRateLimitFn = httpsCallable(functions, 'checkRateLimit');

  try {
    const result = await checkRateLimitFn({
      type,
      limit,
      window
    });

    if (!result.data.allowed) {
      const resetTime = new Date(result.data.resetAt).toLocaleString();
      throw new Error(`Rate limit exceeded. Resets at ${resetTime}`);
    }

    return result.data.remaining;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    throw error;
  }
}
```

### 10. Autenticação - Login com verificação de email

```typescript
import { getAuth, signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';

async function loginUser(email, password) {
  const auth = getAuth();

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      await sendEmailVerification(user);
      throw new Error('Please verify your email before logging in');
    }

    return user;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new Error('User not found');
    }
    if (error.code === 'auth/wrong-password') {
      throw new Error('Incorrect password');
    }
    throw error;
  }
}
```

## 🚀 Implementação

### 1. Deploy das Rules

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Realtime Database rules
firebase deploy --only database

# Deploy Storage rules
firebase deploy --only storage:rules

# Deploy Cloud Functions
firebase deploy --only functions
```

### 2. Configurar Ambiente

```bash
# .env.local
REACT_APP_FIREBASE_API_KEY=xxx
REACT_APP_FIREBASE_AUTH_DOMAIN=xxx
REACT_APP_FIREBASE_PROJECT_ID=xxx
REACT_APP_FIREBASE_STORAGE_BUCKET=xxx
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=xxx
REACT_APP_FIREBASE_APP_ID=xxx
REACT_APP_ENCRYPTION_KEY=xxx
```

### 3. Inicializar Firebase no seu projeto

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

// Initialize Firestore
const db = getFirestore(app);
enableIndexedDbPersistence(db);

// Initialize Storage
const storage = getStorage(app);

// Initialize Realtime Database
const realtimeDb = getDatabase(app);

// Initialize Analytics
const analytics = getAnalytics(app);

export { app, auth, db, storage, realtimeDb, analytics };
```

## 🔍 Monitoramento e Auditoria

### Verificar logs de segurança

```bash
# Ver logs do Firebase
firebase functions:log

# Verificar regras de segurança em tempo real
firebase rules:test
```

### Alertas de segurança

O sistema monitora:
- Tentativas de acesso não autorizado
- Violações de rate limiting
- Operações de exclusão em massa
- Alterações de permissões
- Acessos anormais a dados

## 📊 Índices do Firestore

Os seguintes índices são críticos para performance:

```
users: createdAt ↓, role ↑
projects: ownerId ↑, createdAt ↓
activityLogs: userId ↑, timestamp ↓
notifications: userId ↑, timestamp ↓
```

## 🛡️ Checklist de Segurança

- [ ] Todas as regras foram testadas
- [ ] Variáveis de ambiente configuradas
- [ ] Chaves de API restritas por tipo
- [ ] CORS configurado
- [ ] Backup automático habilitado
- [ ] Monitoramento ativado
- [ ] 2FA habilitado para admins
- [ ] Criptografia de dados sensíveis
- [ ] Rate limiting testado
- [ ] Logs de auditoria configurados

## 📝 Referências

- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Firestore Security Best Practices](https://firebase.google.com/docs/firestore/security/secure-data)
- [Cloud Storage Security](https://firebase.google.com/docs/storage/security)
- [Authentication Best Practices](https://firebase.google.com/docs/auth/best-practices)

## 🤝 Suporte

Para questões de segurança, abra uma issue em: `firebase/issues/security`
