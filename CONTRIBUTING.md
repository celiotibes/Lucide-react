# 🤝 Guia de Contribuição

Obrigado por querer contribuir para o **Sistema de Gerenciamento de Aluguéis**! Este guia explica como trabalhar com este projeto.

---

## 📋 Sumário

1. [Código de Conduta](#código-de-conduta)
2. [Como Começar](#como-começar)
3. [Processo de Pull Request](#processo-de-pull-request)
4. [Padrões de Código](#padrões-de-código)
5. [Commits & Messages](#commits--messages)
6. [Testes](#testes)
7. [Documentação](#documentação)

---

## 🤝 Código de Conduta

Este projeto adere a um Código de Conduta. Ao participar, você concorda em mantê-lo:

- ✅ Ser respeitoso com todos
- ✅ Aceitar críticas construtivas
- ✅ Focar no que é melhor para a comunidade
- ✅ Mostrar empatia com outros membros

**Violações**: Reportar para [support@example.com](mailto:support@example.com)

---

## 🚀 Como Começar

### Setup Local

```bash
# 1. Fork o repositório
# (GitHub UI → Fork button)

# 2. Clone seu fork
git clone https://github.com/seu-usuario/Lucide-react.git
cd Lucide-react

# 3. Adicione upstream remote
git remote add upstream https://github.com/celiotibes/Lucide-react.git

# 4. Instale dependências
npm install

# 5. Setup completo (docker-compose)
make dev

# 6. Validar setup
make health
```

### Branches

```bash
# Para features
git checkout -b feature/nome-da-feature

# Para bugs
git checkout -b fix/nome-do-bug

# Para documentação
git checkout -b docs/nome-da-documentacao

# Para hotfix urgente
git checkout -b hotfix/nome-do-hotfix
```

---

## 📝 Processo de Pull Request

### Antes de Começar

- [ ] Verificar [Issues abertas](https://github.com/celiotibes/Lucide-react/issues)
- [ ] Verificar [PRs em review](https://github.com/celiotibes/Lucide-react/pulls)
- [ ] Abrir Issue para discussão antes de trabalho grande

### Criar PR

1. **Atualizar base branch**
```bash
git fetch upstream
git rebase upstream/develop
```

2. **Fazer commits claros** (veja [Convenções de Commit](#convenções-de-commit))

3. **Push para seu fork**
```bash
git push origin feature/nome-da-feature
```

4. **Abrir PR no GitHub**
   - Preencher template completamente
   - Referenciar issues relacionadas (#123)
   - Descrever mudanças claramente

### Checklist de PR

```markdown
## 📋 Checklist

- [ ] Código segue style guide
- [ ] Auto-review do código feito
- [ ] Comentários adicionados para lógica complexa
- [ ] Documentação atualizada
- [ ] Sem warnings novo
- [ ] Testes adicionados para novas features
- [ ] Testes passando (make test)
- [ ] Linting passando (make lint)
- [ ] Sem breaking changes (ou documentado)
```

### Review Process

- ✅ Mínimo 1 review antes de merge
- ✅ CI/CD deve passar
- ✅ Sem conflitos com main/develop
- ✅ Commits squashed se necessário

---

## 📐 Padrões de Código

### TypeScript

```typescript
// ✅ BOM: Nomes claros, tipos definidos
interface PropertyFilters {
  city?: string;
  type?: PropertyType;
  minPrice?: number;
}

async function fetchProperties(filters: PropertyFilters): Promise<Property[]> {
  // implementation
}

// ❌ EVITAR: Tipos genéricos, nomes vagas
async function fetch(f: any): Promise<any> {
  // implementation
}
```

### Padrões

- ✅ Use `const` por padrão
- ✅ Use `async/await` em vez de `.then()`
- ✅ Adicione tipos a funções públicas
- ✅ Use constantes para valores mágicos
- ✅ Funções pequenas e focadas (< 30 linhas)
- ✅ Nomes descritivos

### Organização

```
backend/src/
├── shared/        # Código compartilhado
├── [domain]/      # Organizado por domínio
│   ├── services/
│   ├── workers/
│   ├── types.ts
│   └── index.ts
```

---

## 📝 Commits & Messages

### Convenções de Commit

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Tipos

```
feat:      Nova feature
fix:       Bug fix
perf:      Otimização
docs:      Documentação
style:     Formatação (sem mudança lógica)
refactor:  Refatoração sem mudança de feature
test:      Testes
chore:     Build, deps, etc
ci:        Mudanças CI/CD
```

### Exemplos

```bash
# Feature
git commit -m "feat(listings): adicionar filtro por plataforma"

# Bug fix
git commit -m "fix(sync): corrigir erro em sincronização Booking (#123)"

# Performance
git commit -m "perf(dashboard): cache de 5 minutos em analytics"

# Documentation
git commit -m "docs: atualizar guia de deployment"

# Breaking change (RARO)
git commit -m "feat!: remover endpoint /sync/manual (migrate para /listings/{id}/sync)"
```

### Regras

- ✅ Use imperativo ("add" não "added" ou "adds")
- ✅ Não capitalize primeira letra
- ✅ Sem ponto final
- ✅ < 50 caracteres no subject
- ✅ Reference issues: "fixes #123"
- ✅ Explique o porquê, não o quê

---

## 🧪 Testes

### Adicionar Testes

- ✅ Cada feature deve ter teste
- ✅ Cada bug fix deve ter teste
- ✅ Coverage mínimo: 80%

### Rodar Testes

```bash
make test              # Todos
make test-unit         # Unitários
make test-integration  # Integração
make test-e2e          # End-to-end
```

### Exemplo

```typescript
describe('PropertyService', () => {
  it('should list properties filtered by city', async () => {
    const result = await propertyService.list({ city: 'Florianópolis' });
    
    expect(result).toHaveLength(5);
    expect(result[0].city).toBe('Florianópolis');
  });

  it('should throw error for invalid city', async () => {
    await expect(
      propertyService.list({ city: '' })
    ).rejects.toThrow('City is required');
  });
});
```

---

## 📚 Documentação

### Quando Documentar

- ✅ Nova feature pública
- ✅ Mudança em API
- ✅ Novo padrão de código
- ✅ Breaking changes
- ✅ Instruções de setup/deploy

### Onde

- `API_DOCUMENTATION.md` - Endpoints
- `ARCHITECTURE.md` - Design de sistema
- `README.md` - Quick start
- Inline comments - Lógica complexa (não óbvia)

### Exemplo de Comentário

```typescript
// ✅ BOM: Explica o porquê
// Cache por 5 min para evitar bombardear API de preços
const cachedPrices = await cache.get('prices');

// ❌ RUIM: Explica o óbvio
// Get prices from cache
const cachedPrices = await cache.get('prices');
```

---

## ⚡ Quick Checklist Antes de Fazer Push

```bash
# 1. Atualizar base
git fetch upstream
git rebase upstream/develop

# 2. Qualidade
make lint              # Linting OK?
make format            # Formatação OK?
make test              # Testes passando?

# 3. Performance (se relevante)
make perf-load         # Performance OK?

# 4. Commits
git log --oneline -5   # Mensagens claras?

# 5. Push
git push origin feature/nome
```

---

## 🔄 Workflow Completo (Exemplo)

```bash
# 1. Setup
git checkout develop
git pull upstream develop
git checkout -b feature/novo-filtro

# 2. Desenvolvimento
vim backend/src/listings/services.ts
npm run dev           # Testar local

# 3. Testes
npm run test:unit
npm run test:integration
make lint

# 4. Commit
git add backend/src/listings/
git commit -m "feat(listings): adicionar filtro por platform"

# 5. Push & PR
git push origin feature/novo-filtro
# Abrir PR no GitHub (preencher template)

# 6. Revisão
# Feedback dos reviewers
# Fazer ajustes se necessário

# 7. Merge
# Após aprovação, PR é automaticamente mergeado
```

---

## 🆘 Precisa de Ajuda?

- **Dúvidas sobre código**: Abrir discussion ou comentar em PR
- **Conflitos de merge**: Me contacte via PR comments
- **Problemas técnicos**: [GitHub Issues](https://github.com/celiotibes/Lucide-react/issues)
- **Segurança**: [security@example.com](mailto:security@example.com)

---

## 📊 Tipos de Contribuição

Aceitamos contribuições em:

- 🐛 **Bug fixes** - Correções de issues conhecidas
- ✨ **Features** - Novas funcionalidades
- 📚 **Documentation** - Melhorias de docs
- 🧪 **Tests** - Aumentar cobertura
- ⚡ **Performance** - Otimizações
- 🔒 **Security** - Melhorias de segurança
- 🎨 **UI/UX** - Melhorias de interface

---

## 🎯 Dicas Finais

1. **Comece pequeno** - Contribuições pequenas são mais fáceis de revisar
2. **Comunique** - Abra issue antes de trabalho grande
3. **Seja respeitoso** - Valorizamos feedback construtivo
4. **Teste tudo** - Certifique-se que mudanças funcionam
5. **Documente** - Explique o porquê das mudanças

---

**Obrigado por contribuir! 🙏**

Suas contribuições fazem este projeto melhor para todos.

---

**Última atualização**: 2024-01-20  
**Status**: ✅ Bem-vindo(a)!
