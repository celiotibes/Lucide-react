# Security Tests - OWASP Top 10

## Sobre

Testes de segurança focados em vulnerabilidades OWASP Top 10:

1. **SQL Injection** - Testes com payloads `' OR 1=1 --`
2. **Cross-Site Scripting (XSS)** - Testes com `<script>` tags e event handlers
3. **Cross-Site Request Forgery (CSRF)** - Validação de tokens CSRF
4. **XML External Entity (XXE)** - Payloads de entidades XML maliciosas
5. **Directory Traversal** - Testes com `../../etc/passwd` e variações

## Estrutura de Testes

### Test Suite: owasp-tests.spec.ts

Total de 12 testes cobrindo:

#### SQL Injection (2 testes)
- `test('should block SQL Injection attack: OR 1=1 payload')`
  - Tenta injetar `' OR 1=1 -- ` em campos de busca
  - Valida que payload é bloqueado (HTTP 400/403)
  - Verifica ausência de erros SQL no console

- `test('should block SQL Injection attack: semicolon-based payload')`
  - Tenta injetar `; DROP TABLE users; --`
  - Confirma que comando DDL não é executado
  - Valida resposta de erro apropriada

#### XSS (3 testes)
- `test('should block XSS attack: script tag payload')`
  - Injeta `<script>console.log("XSS_PAYLOAD");</script>` em comentários
  - Verifica que script não foi executado
  - Valida que payload foi escapado no DOM

- `test('should block XSS attack: URL parameter payload')`
  - Tenta injetar no query parameter: `<img src=x onerror=alert("XSS")>`
  - Bloqueia execução de event handlers
  - Verifica sanitização de entrada

- `test('should handle excessively long input gracefully')`
  - Testa resiliência com payloads muito longos
  - Valida que aplicação não crash

#### CSRF (2 testes)
- `test('should reject POST request without CSRF token (403)')`
  - Remove CSRF token de requisição POST
  - Espera HTTP 403 ou falha na requisição
  - Valida que servidor rejeita requisições sem token

- `test('should include CSRF token in forms')`
  - Verifica presença de campo hidden com token CSRF
  - Confirma que formulários estão protegidos

#### XXE (2 testes)
- `test('should block XXE attack: XML entity expansion payload')`
  - Injeta entidade XML externa: `<!ENTITY xxe SYSTEM "file:///etc/passwd">`
  - Verifica que arquivo local não é lido
  - Valida que parsing falha com erro apropriado

- `test('should block XXE attack: Billion Laughs DoS')`
  - Injeta entidades recursivas para detectar DoS
  - Verifica que processamento é rápido (< 2s)
  - Confirma que expansão infinita não ocorre

#### Directory Traversal (2 testes)
- `test('should block Directory Traversal: ../../etc/passwd payload')`
  - Tenta acessar arquivos fora do diretório permitido
  - Tenta várias variações de traversal
  - Valida que todas são bloqueadas com 403

- `test('should block Directory Traversal: encoded traversal payload')`
  - Testa payloads com encoding: `..%2F..%2Fetc`
  - Backslash: `..\\..\\windows`
  - Semicolon: `..;/..;/etc`
  - Confirma que todas as variações são bloqueadas

#### Security Headers (1 teste)
- `test('should include important security headers')`
  - Verifica presença de headers de segurança:
    - Content-Security-Policy (CSP)
    - X-Frame-Options
    - X-Content-Type-Options
    - Strict-Transport-Security

## Execução

### Pré-requisitos

1. Servidor rodando: `npm run dev`
2. Playwright instalado (já incluído em package.json)

### Executar Todos os Testes de Segurança

```bash
npm run test:e2e -- security-tests/owasp-tests.spec.ts
```

### Executar teste específico

```bash
npm run test:e2e -- security-tests/owasp-tests.spec.ts -g "SQL Injection"
```

### Modo UI (visualizar testes em tempo real)

```bash
npm run test:e2e:ui -- security-tests/owasp-tests.spec.ts
```

### Modo headed (navegador visível)

```bash
npm run test:e2e:headed -- security-tests/owasp-tests.spec.ts
```

## Interpretação dos Resultados

### Teste PASSOU (Vulnerabilidade BLOQUEADA)

```
✓ should block SQL Injection attack: OR 1=1 payload
```

Significa: A aplicação bloqueou com sucesso a tentativa de injeção SQL.

Indicadores de sucesso:
- HTTP 400 (Bad Request) ou 403 (Forbidden) recebido
- Nenhum erro SQL no console do navegador
- Usuário não consegue acessar dados não autorizados

### Teste FALHOU (VULNERABILIDADE ATIVA)

```
✗ should block SQL Injection attack: OR 1=1 payload
```

Significa: A aplicação é suscetível a SQL Injection.

Ações necessárias:
1. Revisar código que processa entrada do usuário
2. Implementar prepared statements / parameterized queries
3. Adicionar validação de entrada rigorosa
4. Implementar WAF (Web Application Firewall)

## Boas Práticas para Remediation

### SQL Injection
```typescript
// ❌ VULNERABLE
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ SAFE
const query = 'SELECT * FROM users WHERE email = ?';
db.run(query, [email]);
```

### XSS
```typescript
// ❌ VULNERABLE
element.innerHTML = userInput;

// ✅ SAFE
element.textContent = userInput; // ou usar library de sanitização
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);
```

### CSRF
```typescript
// ✅ Implementar
- Gerar CSRF token único por sessão
- Incluir token em forms: <input type="hidden" name="_csrf" value="token">
- Validar token em requisições POST/PUT/DELETE
- Usar SameSite cookies: Set-Cookie: sessionId=value; SameSite=Strict
```

### XXE
```typescript
// ✅ Implementar
- Desabilitar DTD processing em parsers XML
- Usar allowlist de entidades XML
- Usar JSON ao invés de XML quando possível
```

### Directory Traversal
```typescript
// ❌ VULNERABLE
app.get('/download', (req, res) => {
  const file = req.query.file;
  res.download(file); // Pode acessar ../../etc/passwd
});

// ✅ SAFE
app.get('/download', (req, res) => {
  const file = path.basename(req.query.file); // Remove ../ 
  const safePath = path.join('/downloads', file); // Normaliza
  if (!safePath.startsWith('/downloads')) {
    return res.status(403).send('Forbidden');
  }
  res.download(safePath);
});
```

## CI/CD Integration

Adicionar ao GitHub Actions:

```yaml
- name: Run Security Tests
  run: |
    npm run dev &
    sleep 10
    npm run test:e2e -- security-tests/owasp-tests.spec.ts
```

Adicionar ao GitLab CI:

```yaml
security_tests:
  script:
    - npm run dev &
    - sleep 10
    - npm run test:e2e -- security-tests/owasp-tests.spec.ts
```

## Recursos Adicionais

### OWASP Resources
- https://owasp.org/Top10/
- https://cheatsheetseries.owasp.org/
- https://owasp.org/www-community/attacks/

### Testing Tools
- **ZAP** (Zed Attack Proxy): https://www.zaproxy.org/
- **Burp Suite**: https://portswigger.net/burp
- **OWASP Dependency Check**: https://owasp.org/www-project-dependency-check/

### Dependency Security
```bash
# Verificar vulnerabilidades em dependências
npm audit

# Atualizar automaticamente
npm audit fix
```

## Checklist de Segurança

- [ ] SQL Injection - blocked (5+ payloads testados)
- [ ] XSS - blocked (tags, attributes, URLs)
- [ ] CSRF - tokens presentes e validados
- [ ] XXE - disabled e rejeitado
- [ ] Directory Traversal - bloqueado com 403
- [ ] Security Headers - presentes e corretos
- [ ] Input Validation - comprimento máximo implementado
- [ ] Error Handling - mensagens genéricas (sem detalhar banco/caminho)
- [ ] Logging - requisições suspeitas registradas
- [ ] Rate Limiting - implementado para prevenir brute force

## Escalação de Vulnerabilidades

Se um teste falhar:

1. **Crítico** (SQL Injection, RCE, XXE) → Remediar imediatamente
2. **Alto** (XSS, Directory Traversal) → Remediar antes de próximo release
3. **Médio** (CSRF, weak headers) → Incluir no roadmap de segurança
4. **Baixo** (informação disclosure) → Monitorar e agendar fix

## Próximos Passos

- Adicionar testes para Broken Authentication
- Adicionar testes para API Security
- Implementar automated security scanning
- Realizar penetration testing regular
- Obter certificação de segurança (ex: OWASP Top 10 verified)
