# 🔨 Referência Rápida de Comandos de Build

## Desktop (Electron)

### Mac DMG
```bash
# Desenvolvimento (sem certificado)
npm run build:electron

# Produção (com notarização - requer certificado Apple)
npm run build:electron:publish

# Resultado: dist/CRMT\ -\ Gestão\ Imobiliária-1.0.0.dmg
```

### Windows EXE
```bash
# Desenvolvimento  
npm run build:windows

# Produção (com assinatura - requer certificado Windows)
npm run build:windows:publish

# Resultado: 
# dist/CRMT\ -\ Gestão\ Imobiliária\ Setup\ 1.0.0.exe
# dist/CRMT\ -\ Gestão\ Imobiliária\ 1.0.0.exe (portable)
```

### Mac + Windows (Paralelo)
```bash
# Ambos os builds em uma operação
npm run build:all

# Ou com publicação
npm run build:all:publish

# Resultado: dist/CRMT-*.dmg + dist/CRMT-*.exe (2x)
```

---

## Mobile (Expo/EAS)

### Android

#### APK (Teste/Preview)
```bash
cd mobile-app
eas build --platform android --profile preview

# Resultado: android-app.apk (~80-120 MB)
# Tempo: 5-10 minutos
```

#### AAB (Google Play/Produção)
```bash
cd mobile-app
eas build --platform android --profile production

# Resultado: android-app.aab (~60-90 MB)
# Tempo: 10-15 minutos
```

### iOS

#### Simulator Build (Teste Rápido)
```bash
cd mobile-app
eas build --platform ios --profile preview2

# Resultado: Arquivo para iOS Simulator
# Tempo: 15-20 minutos
```

#### Device Build (Staging)
```bash
cd mobile-app
eas build --platform ios --profile staging

# Resultado: IPA para TestFlight
# Tempo: 20-30 minutos
```

#### App Store Build (Produção)
```bash
cd mobile-app
eas build --platform ios --profile production

# Resultado: IPA para App Store
# Tempo: 20-30 minutos
```

---

## Distribuição & Upload

### Submeter Android para Google Play
```bash
cd mobile-app
eas submit --platform android --latest
```

### Submeter iOS para App Store
```bash
cd mobile-app
eas submit --platform ios --latest

# Ou para TestFlight primeiro
eas submit --platform ios --latest --track internal
```

---

## Verificações Pré-Build

```bash
# Lint
npm run lint

# TypeScript Validation
npm run build:typecheck

# Testes Unitários
npm run test

# Testes E2E
npm run test:e2e

# Testes Completos (recomendado antes de build final)
npm run test && npm run test:e2e && npm run lint
```

---

## Variáveis de Ambiente Necessárias

### Para Build Assinado (Desktop)

**.env.production** (NUNCA commitar)
```bash
# macOS
export CSC_LINK="file:///path/to/mac-certificate.p12"
export CSC_KEY_PASSWORD="senha-do-certificado"
export APPLE_ID="email@icloud.com"
export APPLE_ID_PASSWORD="app-password"

# Windows (PowerShell)
$env:WINDOWS_CERTIFICATE_FILE = "C:\path\windows.pfx"
$env:WINDOWS_CERTIFICATE_PASSWORD = "senha"
```

### Para Build Mobile (EAS)

**Armazenar em EAS Secrets** (não em arquivo local)
```bash
eas secret:create --scope project --name FIREBASE_API_KEY_PROD --value "xxx"
eas secret:create --scope project --name API_CERT_PIN_PROD --value "xxx"
# ... resto das credenciais
```

---

## Visualizar Status de Build

### Verificar histórico de builds EAS
```bash
cd mobile-app
eas build:list

# Ver detalhes de um build específico
eas build:view <BUILD_ID>
```

### Logs de build
```bash
# Ver logs enquanto building
eas build:view <BUILD_ID> --log

# Download completo dos logs
eas build:view <BUILD_ID> --logs
```

---

## Troubleshooting Rápido

### Build falha em certificado Mac
```bash
# Verifique se certificado está em keychain
security find-identity -v -p codesigning

# Adicione certificado ao keychain
security import certificate.p12 -k ~/Library/Keychains/login.keychain-db
```

### EAS build recusado por credenciais
```bash
# Re-login no EAS
eas logout
eas login

# Verificar secrets
eas secret:list
```

### APK/AAB não instala em device
```bash
# Verificar compatibilidade
# Min SDK: 24 (Android 7.0+)
# Target SDK: 34 (Android 14)

# Testar localmente
adb install app.apk
adb logcat  # ver logs de erro
```

---

## Tamanhos Esperados

| Plataforma | Arquivo | Tamanho |
|-----------|---------|---------|
| Mac | DMG | 50-120 MB |
| Windows | Setup EXE | 65-150 MB |
| Windows | Portable | 120-200 MB |
| Android | APK | 80-120 MB |
| Android | AAB | 60-90 MB |
| iOS | IPA | 90-150 MB |

---

## Tempo Estimado Total de Deploy

| Passo | Tempo | Crítico |
|------|-------|---------|
| Testes | 5-10 min | ✅ Sim |
| Build Mac | 10-15 min | ✅ Sim |
| Build Windows | 10-15 min | ✅ Sim |
| Build Android | 10-15 min | Não |
| Build iOS | 20-30 min | ✅ Sim |
| Upload & Review | 1-3 dias | ✅ Sim |
| **TOTAL** | **4-5 horas** | |

---

## One-Liner Deploy Completo

```bash
# Executar tudo (precisa estar no macOS para Mac DMG)
npm run test && npm run build:typecheck && npm run build:all && cd mobile-app && eas build --platform android --profile production && eas build --platform ios --profile production
```

---

## Monitorar Release

### Após submeter iOS
- Revisor Apple revisa em 1-3 dias
- Aprovação automática ou feedback
- `https://appstoreconnect.apple.com/`

### Após submeter Android  
- Validação automática (minutos)
- Disponível em 4-24 horas
- `https://play.google.com/console/`

---

## Checklist Pre-Build

```bash
#!/bin/bash
# Salve como scripts/pre-build-check.sh

echo "🔍 Verificando requisitos de build..."

# Verificar Node version
NODE_VERSION=$(node -v)
echo "✅ Node $NODE_VERSION"

# Verificar npm
NPM_VERSION=$(npm -v)
echo "✅ npm $NPM_VERSION"

# Verificar Electron (se Mac/Windows)
if [ -f "package.json" ]; then
  if grep -q '"electron"' package.json; then
    echo "✅ Electron encontrado"
  fi
fi

# Verificar Expo (se mobile)
if [ -d "mobile-app" ]; then
  echo "✅ Mobile app presente"
  cd mobile-app
  if [ -f "app.json" ]; then
    echo "✅ app.json encontrado"
  fi
fi

# Verificar certificados (Mac)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "🔐 Verificando certificados macOS..."
  security find-identity -v -p codesigning | grep -q "Developer ID" && echo "✅ Dev ID certificado encontrado" || echo "⚠️ Dev ID certificado não encontrado"
fi

echo ""
echo "✅ Pré-build check concluído!"
echo ""
echo "Próximos passos:"
echo "1. npm run test"
echo "2. npm run build:typecheck"
echo "3. npm run build:all"
```

Execute com:
```bash
chmod +x scripts/pre-build-check.sh
./scripts/pre-build-check.sh
```

---

**Status**: ✅ Todos os comandos prontos para uso

