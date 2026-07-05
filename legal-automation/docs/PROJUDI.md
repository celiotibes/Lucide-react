# Projudi TJPR - Peticionamento e Consultas

Integração com o WebService SOAP do Projudi (Tribunal de Justiça do Paraná).

## Configuração

```env
PROJUDI_WSDL_URL=https://tst.tjpr.jus.br/projudi/webservices/projudiIntercomunicacaoWebService222?wsdl
PROJUDI_USERNAME=seu_usuario_tjpr
PROJUDI_PASSWORD=sua_senha_tjpr
```

## Autenticação Projudi

### 1. Login

```bash
curl -X POST http://localhost:3000/api/v1/projudi/auth \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "usuario_tjpr",
    "password": "senha_tjpr"
  }'
```

**Resposta:**
```json
{
  "token": "projudi-token-xyz",
  "expiresAt": "2024-01-16T10:30:00Z"
}
```

## Endpoints Disponíveis

### 1. Obter Dados do Processo

```bash
curl -X GET "http://localhost:3000/api/v1/projudi/processes/0000001-12.2023.8.26.0100" \
  -H "Authorization: Bearer <jwt_token>"
```

**Resposta:**
```json
{
  "numeroProcesso": "0000001-12.2023.8.26.0100",
  "numeroProcessoFormatado": "0000001-12.2023.8.26.0100",
  "anoJudicializado": 2023,
  "status": "Em tramitação",
  "dataAbertura": "2023-01-15",
  "dataUltimaMovimentacao": "2024-01-15",
  "partes": [
    {
      "nome": "João Silva",
      "pessoaJuridica": false,
      "documento": "123.456.789-00",
      "tipo": "Autor",
      "advogados": [
        {
          "nome": "Maria Advogada",
          "oabNumero": "123456",
          "email": "maria@example.com",
          "telefone": "(41) 99999-9999"
        }
      ]
    }
  ],
  "movimentacoes": [
    {
      "dataMovimentacao": "2023-01-15",
      "descricao": "Processo registrado",
      "status": "Concluída",
      "complemento": ""
    }
  ],
  "documentos": [
    {
      "id": "doc-123",
      "descricao": "Petição Inicial",
      "tipo": "PDF",
      "dataUpload": "2023-01-15",
      "tamanho": 256000,
      "nomeArquivo": "peticao-inicial.pdf"
    }
  ]
}
```

### 2. Buscar Processos

```bash
curl -X GET "http://localhost:3000/api/v1/projudi/search?query=João Silva" \
  -H "Authorization: Bearer <jwt_token>"
```

**Parâmetros:**
- `query`: Número do processo, nome da parte ou palavras-chave
- `limit`: Número de resultados (padrão: 20)

### 3. Fazer Download de Documento

```bash
curl -X GET "http://localhost:3000/api/v1/projudi/processes/0000001-12.2023.8.26.0100/documents/doc-123/download" \
  -H "Authorization: Bearer <jwt_token>" \
  --output documento.pdf
```

### 4. Enviar Petição (Principal)

```bash
curl -X POST "http://localhost:3000/api/v1/projudi/petitions" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: multipart/form-data" \
  -F "processNumber=0000001-12.2023.8.26.0100" \
  -F "documentType=PETICAO" \
  -F "description=Petição de Homologação de Sentença" \
  -F "content=@petition.rtf" \
  -F "attachments=@anexo1.pdf" \
  -F "attachments=@anexo2.pdf"
```

**Resposta:**
```json
{
  "protocolo": "2024011500001",
  "dataProtocolo": "2024-01-15",
  "descricao": "Petição enviada com sucesso",
  "sucesso": true,
  "mensagem": "Protocolo gerado com sucesso"
}
```

## Tipos de Documentos

| Código | Tipo | Descrição |
|--------|------|-----------|
| PETICAO | Petição | Petição genérica |
| INICIAL | Petição Inicial | Ação judicial |
| RECURSO | Recurso | Recurso de apelação |
| AGRAVOCIVIL | Agravo | Agravo de instrumento |
| MONOCRATICA | Decisão | Decisão monocrática |
| PARECER | Parecer | Parecer técnico |

## Formatos de Documentos

### Texto RTF
```rtf
{\rtf1\ansi\ansicpg1252\cocoartf1
{\colortbl;\red255\green0\blue0;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11900\viewh8605
\trowd
Conteúdo da petição em RTF...
}
```

### PDF
Pode ser incluído como anexo:
```bash
-F "attachments=@documento.pdf"
```

## Exemplo Prático: Petição Automatizada

```typescript
import { projudiSoapClient } from '@/projudi/soapClient';

async function peticaoAutomatizada(processNumber: string, userId: string) {
  // 1. Obter dados do processo
  const token = await projudiSoapClient.authenticate(username, password);
  const processo = await projudiSoapClient.getProcessData(processNumber, token);
  
  // 2. Construir conteúdo RTF
  const content = buildRTFContent(
    processo,
    'Requerimento de Penhora',
    'Solicita-se a penhora de bens...'
  );
  
  // 3. Enviar petição
  const petition = {
    numeroProcesso: processNumber,
    tipoDocumento: 'PETICAO',
    descricaoDocumento: 'Requerimento de Penhora',
    documentoRTF: content,
    dataMovimentacao: new Date().toISOString(),
  };
  
  const result = await projudiSoapClient.submitPetition(petition, token);
  
  if (result.sucesso) {
    console.log(`✓ Petição enviada: ${result.protocolo}`);
    return result;
  } else {
    console.error(`✗ Falha: ${result.mensagem}`);
    throw new Error(result.mensagem);
  }
}
```

## Geração de RTF

```typescript
function buildRTFContent(processo: any, titulo: string, body: string): string {
  const rtf = `
{\\rtf1\\ansi\\ansicpg1252\\cocoartf1
{\\colortbl;\\red255\\green0\\blue0;}
{\\*\\expandedcolortbl;;}
\\margl1440\\margr1440\\vieww11900\\viewh8605\\trowd

{\\fonttbl\\f0\\fswiss Helvetica;}
{\\colortbl;\\red0\\green0\\blue0;}

\\f0\\fs20

${titulo}\\par
\\par
Número: ${processo.numeroProcesso}\\par
Partes: ${processo.partes.map(p => p.nome).join(', ')}\\par
\\par
${body}
}
`;
  return rtf;
}
```

## Sincronização com Certificado Digital

A petição é assinada automaticamente com o certificado do advogado:

```typescript
async function peticaoAssinada(
  processNumber: string,
  petitionContent: string,
  certificateFingerprint: string,
  certPassword: string
) {
  // 1. Obter certificado
  const cert = await certificateManager.getCertificate(certificateFingerprint);
  
  // 2. Verificar validade
  const isValid = await certificateManager.isValidCertificate(cert);
  if (!isValid) {
    throw new Error('Certificado expirado ou inválido');
  }
  
  // 3. Assinar conteúdo
  const privateKey = await certificateManager.getCertificateForSigning(
    certificateFingerprint,
    certPassword
  );
  
  // 4. Enviar assinado
  const token = await projudiSoapClient.authenticate(username, password);
  return await projudiSoapClient.submitPetition({
    numeroProcesso: processNumber,
    tipoDocumento: 'PETICAO',
    descricaoDocumento: 'Petição Assinada Digitalmente',
    documentoRTF: petitionContent,
    dataMovimentacao: new Date().toISOString(),
  }, token);
}
```

## Tratamento de Erros

| Erro | Causa | Solução |
|------|-------|---------|
| Token inválido | Sessão expirou | Fazer login novamente |
| Processo não encontrado | Número incorreto | Verificar número CNJ |
| Documento rejeitado | Formato inválido | Enviar em RTF ou PDF |
| Certificado não assinado | Cert expirado | Renovar certificado |

## Monitoramento de Status

```typescript
async function monitorarPeticao(protocolo: string, processNumber: string) {
  const interval = setInterval(async () => {
    const processo = await projudiSoapClient.getProcessData(processNumber, token);
    const movimento = processo.movimentacoes[0];
    
    console.log(`Status: ${movimento.descricao} (${movimento.dataMovimentacao})`);
    
    if (movimento.status === 'Concluída') {
      clearInterval(interval);
      console.log('✓ Petição processada!');
    }
  }, 60000); // A cada minuto
}
```

## Rate Limiting

Projudi possui limitações:
- Max 100 requisições por minuto
- Max 1000 requisições por hora
- Implementar backoff automático

```typescript
const rateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
});

await rateLimiter.wait();
await projudiSoapClient.submitPetition(...);
```
