# 🚀 Lucide-react: Quick Start Guide

## Para Advogados e Operadores Jurídicos

### Instalação Rápida (1 minuto)

```bash
# Clone ou abra o projeto
cd Lucide-react

# Instale dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev

# Abra no navegador
# http://localhost:5173
```

### Usando o Editor (5 minutos)

**Passo 1: Adicionar Fatos Probatórios**
1. No painel esquerdo, clique **"+ Adicionar Fato Probatório"**
2. Escreva o fato: "Contrato assinado em 15/01/2024"
3. Defina certeza: Use o slider ou clique em um preset
   - 🟢 **90%**: Prova documental forte (tenho documento original)
   - 🟡 **65%**: Prova circunstancial (tenho evidências indiretas)
   - 🔴 **35%**: Prova fraca (apenas estimativa/presunção)
4. Adicione fontes: "Contrato original", "Foto da assinatura"
5. Clique **"✓ Adicionar Fato"**

**Passo 2: Escrever Petição**
1. No editor central, clique em um botão de formatação:
   - **B** = Negrito
   - **I** = Itálico  
   - **H1** = Título (use apenas 1 vez)
   - **H2** = Seção principal
   - **H3** = Subseção
   - **•** = Lista com bullet
   - **1** = Lista numerada
   - **"** = Citação em bloco
   - **🔗** = Link

2. Escreva seu conteúdo normalmente

**Passo 3: Monitorar Força Probatória**
- Veja a **Matriz de Prova Visual** no rodapé
- Observe 3 métricas principais:
  - 🎯 **Score Jurimetria**: 0-100 (saúde geral do caso)
  - 📊 **Cobertura Probatória**: % de fatos com prova
  - 📈 **Certeza Média**: Força média de prova

- Cores indicam saúde:
  - 🟢 Verde (80+): Excelente
  - 🟠 Amarelo (60-80): Bom
  - 🔵 Azul (60): Moderado
  - 🔴 Vermelho (<40): Crítico

**Passo 4: Exportar**
- Clique **"HTML"** para fazer download da petição formatada
- Clique **"JSON"** para salvar com metadados jurimetria

## Para Desenvolvedores

### Estrutura Rápida

```
src/
├── components/          ← Componentes React (Editor, Matriz, Validador)
├── services/           ← Lógica de negócio (Jurimetria, Formatação)
├── types/              ← Definições TypeScript
├── utils/              ← Funções auxiliares
└── App.tsx             ← Entrada principal
```

### Adicionar Funcionalidade

**Exemplo: Adicionar novo tipo de fato**

```typescript
// src/types/jurimetriaBR.ts - Adicione ao enum:
export type TipoFato = 
  | 'fato_provavel'      // Existente
  | 'fato_presumido'     // Novo
  | 'fato_circunstancia' // Novo

// src/components/editor/GerenciadorFatos.tsx - No formulário:
<select>
  <option value="fato_provavel">Fato Provável</option>
  <option value="fato_presumido">Fato Presumido</option>
  <option value="fato_circunstancia">Fato Circunstancial</option>
</select>
```

**Exemplo: Usar a Matriz em outro componente**

```typescript
import { MatrizProvaVisual } from '@/components/visualization/MatrizProvaVisual'
import { ServicoJurimetriaBR } from '@/services/servicoJurimetriaBR'

function MeuComponente() {
  const analise = ServicoJurimetriaBR.analisarJurimetria(fatos)
  
  return (
    <MatrizProvaVisual
      analise={analise}
      fatos={fatos}
      exibirDetalhes={true}
      tamanho="expandido"
    />
  )
}
```

### Build para Produção

```bash
# Valida tipos TypeScript + cria build otimizado
npm run build

# Pré-visualiza o build
npm run preview

# Lint do código
npm run lint
```

## 🎯 Paleta de Cores (para customização)

Arquivo: `src/utils/sistemaDesignJudicial.ts`

```typescript
export const CORES_JUDICIAIS = {
  azulPrincipal: '#1A3A52',    // Azul tribunal (títulos, cabeçalhos)
  vermelhoArgumento: '#C41E3A',// Vermelho (força alta, crítica)
  verdeApoio: '#2E7D32',       // Verde (sustentação, sucesso)
  amareloAviso: '#FFC107',     // Amarelo (atenção, moderado)
  // ... mais cores
}
```

## ❓ Perguntas Frequentes

**P: Qual é a diferença entre certeza e peso?**  
R: 
- **Certeza** = Quão forte é a prova (0-100%). Slide na interface.
- **Peso** = Quão importante é para sua tese (1-5). Maior = mais crítico.

**P: Como resetar um documento?**  
R: Botão **↻** na barra de ferramentas (com aviso de confirmação)

**P: Posso editar a cor azul do tribunal?**  
R: Sim, em `src/utils/sistemaDesignJudicial.ts`, mude `azulPrincipal: '#1A3A52'`

**P: Funciona offline?**  
R: Sim. O editor funciona completamente offline. Export em HTML/JSON também.

**P: Posso importar conteúdo existente?**  
R: Sim, copie e cole o HTML ou texto diretamente no editor.

## 🔗 Recursos Úteis

- **Documentação Completa**: `docs/FASE_3A_VISUAL_LAW_EDITOR_PT.md`
- **Tipos TypeScript**: `src/types/jurimetriaBR.ts`
- **Serviços de Backend**: `src/services/` (FASE 2.5)
- **Design System**: `src/utils/sistemaDesignJudicial.ts`

## 🐛 Troubleshooting

**Dev server não inicia?**
```bash
# Limpe cache e reinstale
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Erro de tipo TypeScript?**
```bash
# Valide tipos
npm run build  # Mostrar erros
```

**Componentes não carregam?**
- Verifique console (F12 → Console)
- TipTap precisa de React 19+: verifique `package.json`

## 📞 Suporte

Para suporte técnico ou melhorias:
- Consulte `.claude/CLAUDE.md`
- Revise o histórico de commits no branch

---

**Lucide-react FASE 3A** ⚖️  
Editor visual de petições judiciais com análise jurimetria em tempo real.
