# Módulo de Importação de Documentos

Componentes React para um workflow completo de importação de documentos com upload, preview e revisão.

## Componentes

### ImportUpload

Componente de upload de arquivos com drag-and-drop, validação e barra de progresso.

#### Exemplo de Uso

```tsx
import { ImportUpload } from '@/components/importacao';

export function MyUploadPage() {
  return (
    <ImportUpload
      onUploadSuccess={(result) => {
        console.log('Arquivo carregado:', result.lote_id);
      }}
      onUploadError={(error) => {
        console.error('Erro:', error);
      }}
      maxFileSize={50 * 1024 * 1024} // 50 MB
      acceptedTypes={[
        'application/x-ofx',
        'text/csv',
        'application/pdf',
        'image/jpeg',
        'image/png',
      ]}
    />
  );
}
```

#### Props

- `onUploadSuccess?`: `(result: UploadResult) => void` - Callback quando upload é bem-sucedido
- `onUploadError?`: `(error: string) => void` - Callback quando há erro
- `maxFileSize?`: `number` - Tamanho máximo em bytes (padrão: 50MB)
- `acceptedTypes?`: `string[]` - Lista de MIME types aceitos

#### Funcionalidades

- Drag-and-drop de arquivos
- Clique para selecionar arquivo
- Validação de tipo MIME e tamanho
- Barra de progresso com %
- Exibição de informações do arquivo
- Tratamento robusto de erros
- Acessibilidade total (ARIA labels, navegação por teclado)

---

### ImportPreview

Componente de preview dos dados importados (primeiras 10 linhas) com ações de aprovação/rejeição.

#### Exemplo de Uso

```tsx
import { ImportPreview } from '@/components/importacao';

export function MyPreviewPage() {
  const [loteId, setLoteId] = useState<string | null>(null);

  return (
    <ImportPreview
      loteId={loteId}
      onApprove={(loteId) => {
        console.log('Aprovado:', loteId);
      }}
      onEditMapping={(loteId) => {
        console.log('Editar mapeamento:', loteId);
      }}
      onReject={(loteId, reason) => {
        console.log('Rejeitado:', loteId, reason);
      }}
      onClose={() => setLoteId(null)}
    />
  );
}
```

#### Props

- `loteId`: `string` - ID do lote de importação
- `onApprove?`: `(loteId: string) => void` - Callback ao aprovar
- `onEditMapping?`: `(loteId: string) => void` - Callback ao editar mapeamento
- `onReject?`: `(loteId: string, reason: string) => void` - Callback ao rejeitar
- `onClose?`: `() => void` - Callback ao fechar

#### Funcionalidades

- Exibição das primeiras 10 linhas
- Tipo de arquivo detectado
- Resumo de status de linhas
- Dialog de rejeição com motivo
- Loading states
- Tratamento de erros

---

### ImportReview

Componente completo de revisão de todas as linhas de um lote com filtros, paginação e ações em massa.

#### Exemplo de Uso

```tsx
import { ImportReview, LinhaStatus } from '@/components/importacao';

export function MyReviewPage() {
  return (
    <ImportReview
      loteId="lote-123"
      onComplete={(loteId) => {
        console.log('Importação completa:', loteId);
        // Redirecionar ou atualizar UI
      }}
      onCancel={() => {
        console.log('Cancelado');
      }}
    />
  );
}
```

#### Props

- `loteId`: `string` - ID do lote de importação
- `onComplete?`: `(loteId: string) => void` - Callback ao completar revisão
- `onCancel?`: `() => void` - Callback ao cancelar

#### Funcionalidades

- Tabela com todas as linhas
- Paginação (10 itens por página)
- Filtros por status:
  - PENDENTE
  - DUPLICATA_SUSPEITA
  - VALIDADA
  - PROCESSADA
  - REJEITADA
  - ERRO
  - IGNORADA
- Filtro por duplicatas suspeitas
- Ações por linha:
  - ✓ Aprovar linha individual
  - ✗ Rejeitar linha com motivo
  - Ver detalhes de duplicata (score e comparação)
- Ações em massa:
  - Aprovar todas as linhas
  - Rejeitar todas com motivo
- Seleção de múltiplas linhas
- Indicador de duplicata com score de similaridade
- Navegação por teclado
- Acessibilidade completa

---

## Tipos TypeScript

### UploadResult

```typescript
interface UploadResult {
  sucesso: boolean;
  lote_id?: string;
  arquivo_nome?: string;
  arquivo_hash?: string;
  tipo?: FileType;
  tamanho_bytes?: number;
  criado_em?: string;
  erro?: string;
  detalhes?: string;
}
```

### LinhaImportacao

```typescript
interface LinhaImportacao {
  id: string;
  lote_id: string;
  numero_linha: number;
  dados_brutos: string;
  status: LinhaStatus;
  erro_mensagem?: string;
  duplicata_score?: number; // 0-1
  duplicata_com_id?: string;
  criado_em: string;
}
```

### FileType

```typescript
enum FileType {
  OFX = 'OFX',
  CSV = 'CSV',
  PDF = 'PDF',
  JPEG = 'JPEG',
  PNG = 'PNG',
}
```

### LinhaStatus

```typescript
enum LinhaStatus {
  PENDENTE = 'PENDENTE',
  DUPLICATA_SUSPEITA = 'DUPLICATA_SUSPEITA',
  VALIDADA = 'VALIDADA',
  PROCESSADA = 'PROCESSADA',
  REJEITADA = 'REJEITADA',
  ERRO = 'ERRO',
  IGNORADA = 'IGNORADA',
}
```

---

## Funções de API

O módulo `api.ts` fornece funções para comunicação com o servidor:

### uploadArquivo

```typescript
uploadArquivo(file: File, onProgress?: (progress: number) => void): Promise<UploadResult>
```

Upload de arquivo com suporte a callbacks de progresso.

### obterLote

```typescript
obterLote(loteId: string): Promise<LoteImportacao>
```

Obter detalhes do lote.

### obterPreview

```typescript
obterPreview(loteId: string): Promise<PreviewDados>
```

Obter preview das primeiras 10 linhas.

### obterLinhas

```typescript
obterLinhas(
  loteId: string,
  opcoes?: {
    pagina?: number;
    limite?: number;
    status?: LinhaStatus[];
    comDuplicata?: boolean;
  }
): Promise<{ linhas: LinhaImportacao[]; paginacao: Paginacao }>
```

Obter linhas com paginação e filtros.

### aprovarLinha

```typescript
aprovarLinha(loteId: string, linhaId: string): Promise<ResultadoRevisaoLinha>
```

Aprovar linha individual.

### rejeitarLinha

```typescript
rejeitarLinha(loteId: string, linhaId: string, motivo: string): Promise<ResultadoRevisaoLinha>
```

Rejeitar linha individual com motivo.

### obterDetalheDuplicata

```typescript
obterDetalheDuplicata(loteId: string, linhaId: string): Promise<{
  linha_original: LinhaImportacao;
  linha_duplicada: LinhaImportacao;
  score: number;
}>
```

Obter detalhes de uma possível duplicata.

### aprovarTodos

```typescript
aprovarTodos(loteId: string): Promise<ResultadoRevisaoBulk>
```

Aprovar todas as linhas em massa.

### rejeitarTodos

```typescript
rejeitarTodos(loteId: string, motivo?: string): Promise<ResultadoRevisaoBulk>
```

Rejeitar todas as linhas em massa.

---

## Workflow Completo Exemplo

```tsx
import { useState } from 'react';
import { ImportUpload, ImportPreview, ImportReview } from '@/components/importacao';
import type { UploadResult } from '@/components/importacao';

export function ImportWorkflow() {
  const [step, setStep] = useState<'upload' | 'preview' | 'review'>('upload');
  const [loteId, setLoteId] = useState<string | null>(null);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Importar Documentos</h1>

      {step === 'upload' && (
        <ImportUpload
          onUploadSuccess={(result: UploadResult) => {
            setLoteId(result.lote_id!);
            setStep('preview');
          }}
        />
      )}

      {step === 'preview' && loteId && (
        <ImportPreview
          loteId={loteId}
          onApprove={(loteId) => {
            setStep('review');
          }}
          onReject={() => {
            setStep('upload');
            setLoteId(null);
          }}
          onClose={() => {
            setStep('upload');
            setLoteId(null);
          }}
        />
      )}

      {step === 'review' && loteId && (
        <ImportReview
          loteId={loteId}
          onComplete={() => {
            // Importação completa, redirecionar ou atualizar
            alert('Importação completa!');
            setStep('upload');
            setLoteId(null);
          }}
          onCancel={() => {
            setStep('upload');
            setLoteId(null);
          }}
        />
      )}
    </div>
  );
}
```

---

## Testes

Executar testes:

```bash
npm run test
npm run test:watch
```

Os testes estão em `__tests__/ImportUpload.test.tsx` e cobrem:

- Renderização
- Validação de arquivo
- Upload com progresso
- Error handling
- Callbacks
- Drag and drop
- Estados
- Acessibilidade

---

## Estilo

Os componentes usam Tailwind CSS com classes inline (sem arquivos CSS separados) para manter a modularidade. Adapte as classes conforme necessário para sua marca.

### Cores Utilizadas

- **Sucesso**: Green (green-50, green-600, green-700)
- **Erro**: Red (red-50, red-600, red-700)
- **Aviso**: Orange/Yellow (orange-50, yellow-50)
- **Info**: Blue (blue-50, blue-600)
- **Padrão**: Gray

---

## Acessibilidade

Todos os componentes incluem:

- ARIA labels descritivos
- Navegação por teclado (Tab, Enter, Space)
- Focus states visuais
- Descrições de ícones
- Roles ARIA apropriados
- Contraste de cores conforme WCAG AA

---

## Próximas Melhorias

- [ ] Suporte a múltiplos arquivos simultâneos
- [ ] Cancelamento de upload em progresso
- [ ] Retry automático
- [ ] Exportar relatório de revisão
- [ ] Integração com websockets para status em tempo real
- [ ] Suporte a preview de PDF/imagens
- [ ] Histórico de importações
