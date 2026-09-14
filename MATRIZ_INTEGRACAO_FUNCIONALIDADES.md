# Matriz de Integração de Funcionalidades — Análise Cruzada de Repositórios

**Data**: 2026-09-14  
**Objetivo**: Identificar funcionalidades complementares entre Lucide-react, app-bruxel e ERP-CRMT para integração segura.  
**Status**: ⏳ Em análise (subagent rodando em paralelo)

## Estrutura da Matriz

Cada funcionalidade listada segue este padrão:

| Campo | Descrição |
|-------|-----------|
| **Funcionalidade** | Nome descritivo |
| **Origem** | Repositório + branch/arquivo |
| **Descrição** | O que faz |
| **Testes** | Type (unit/e2e/manual) + Status |
| **Qualidade** | low / medium / high |
| **Padrão** | heurística / IA / regras aprendidas / outro |
| **Integração Segura** | Pré-requisitos + cuidados |
| **Impacto no Lucide-react** | Risco (none/low/medium/high) |

## Funcionalidades Investigadas

### 1. Vistorias/Inspections de Imóveis
- [ ] Buscar em: app-bruxel (branches), ERP-CRMT
- [ ] Status: Pendente

### 2. Classificação de Documentos
- [x] Lucide-react: Heurística + fallback IA (fase 2, recém implementado)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Nota**: Lucide-react tem `extrairCamposDeTexto` + `classificarDocumentoComIA` implementado com modelo Haiku

### 3. Regras Aprendidas (Learned Rules)
- [x] Lucide-react: `regras_categorizacao` (transações) + `regras_categorizacao_documentos` (CNPJ/CPF-keyed)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Nota**: Padrão UNIQUE UPSERT por chave, sem banco externo

### 4. Extração de Campos
- [x] Lucide-react: `extrairCamposDeTexto` (valor, data, CNPJ/CPF, fornecedor, tipo)
- [ ] Buscar em: app-bruxel (Python?), ERP-CRMT
- **Nota**: Implementa regex determinístico + fallback IA

### 5. Persistência de Dados
- [x] Lucide-react: sql.js + IndexedDB (100% local, WASM)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Risco de conflito**: Se ERP usar servidor remoto, precisará sincronização

### 6. Relatórios Fiscais/Contábeis
- [x] Lucide-react: DRE, cascata (waterfall), inadimplência, patrimônio, laudo
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Integração**: Compatibilidade de dados+schemas antes de unificar

### 7. Importação de Documentos
- [x] Lucide-react: OFX, CSV, PDF, foto de boleto/recibo (via Pluggy optional)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Nota**: Suporta multiple formatos com extração local

### 8. Sincronização Multi-Dispositivo
- [x] Lucide-react: sync-server (mínimo, "enviar tudo"/"baixar tudo", sem merge)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Integração**: Compatibilidade com possível server remoto do ERP

## Resultado da Análise do Subagent

⏳ *Aguardando conclusão...*

```
[Será preenchido pelo Explore Agent]
```

## Próximos Passos

1. ✅ Criar nova branch: `análise/integração-funcionalidades-cruzadas`
2. ⏳ Rodar Explore Agent para mapear funcionalidades
3. ⏹️ Consolidar matriz com recomendações de integração
4. ⏹️ Identificar conflitos/duplicações e rotas de migração segura
5. ⏹️ Documentar PRE-REQUISITOS para cada integração

## Notas de Segurança

- **Nunca quebrar** o fluxo heurístico de Lucide-react (risco forense)
- **Sempre revisar** dados antes de auto-aplicar (domain honesty principle)
- **Graceful degradation**: Sistema continua funcional sem IA/backend extra
- **Versionamento**: Cada integração entra como nova feature branch com testes
- **Backups**: Preservar schemas/dados atuais antes de migração

---

*Atualização: Este arquivo será preenchido conforme a análise progride.*
