# FASE 2.5: Advanced Jurimetry & Proof Summary Framework
## Complete Implementation Guide

**Status**: ✅ COMPLETE - All 4 layers + Proof Summary Framework implemented

---

## Overview: 4 Critical Layers + Strategic Framework

```
┌─────────────────────────────────────────────────────────────────┐
│ PROOF SUMMARY FRAMEWORK (Path B - Content Layer)                │
│ ├─ ExecutiveSummary: Thesis, key proofs, risk assessment        │
│ ├─ Hermenêutica Blindada: Ethos, Pathos, Logos, Kairos          │
│ ├─ ContestationResponseMatrix: Pre-emptive refutations          │
│ └─ HTML Generation: Direct petition inclusion                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: JURIMETRIA (Quantitative Proof Analysis)               │
│ ├─ JurimetryService.ts                                          │
│ ├─ TCP: Taxa de Cobertura Probatória (%)                        │
│ ├─ Strength Distribution: high/moderate/fragile                 │
│ ├─ Risk Gap Analysis: Vulnerable facts identification           │
│ └─ Jurimetric Score: 0-100 overall health                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: MEDIA OPTIMIZATION (Computer Vision)                   │
│ ├─ media_optimizer.py                                           │
│ ├─ Dimension Standards: 1200×675, 800×1000, 150 DPI            │
│ ├─ OCR: Pytesseract Portuguese text extraction                 │
│ ├─ SHA-256: Authenticity verification                          │
│ └─ Compression: Target <500KB per image                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: CONTINGENCY ENGINEERING (Unreadable Assets)            │
│ ├─ UnreadableAssetContingency interface                         │
│ ├─ Semantic Translation: Transcription/summarization            │
│ ├─ Authenticity Proof: Notarial act reference, SHA-256         │
│ └─ Legal Validation: Jurisprudence accepting unreadable media   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: ADVANCED AUTOMATION (Google Drive + Semantic Index)    │
│ ├─ advanced_automation.py                                       │
│ ├─ Scan & Register: File metadata with type inference           │
│ ├─ Google Drive Sync: OAuth2, domain-restricted sharing         │
│ ├─ Semantic Index: Legal-BERT-PT, TF-IDF compatible JSON       │
│ └─ Markdown Export: Direct petition incorporation               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Jurimetria Service

### Files
- `src/types/jurimetry.ts`: Type definitions
- `src/services/jurimetryService.ts`: Calculation logic

### Core Methods

```typescript
// Main entry point
JurimetryService.analyzeJurimetry(facts: FactProof[]): JurimetricAnalysis

// Individual calculations
JurimetryService.calculateTCP(facts): number // Taxa Cobertura
JurimetryService.calculateAverageCertainty(facts): number // Média ponderada
JurimetryService.analyzeStrengthDistribution(facts): FactStrengthDistribution
JurimetryService.identifyRiskGaps(facts): string[] // Lacunas críticas
JurimetryService.calculateJurimetricScore(facts): number // 0-100
JurimetryService.generateVisualMatrix(facts): VisualProofMatrix[]
JurimetryService.generateHtmlMatrix(analysis): string // For petition
```

### Usage Example

```typescript
import { JurimetryService } from '@/services/jurimetryService'
import type { FactProof } from '@/types/jurimetry'

const facts: FactProof[] = [
  {
    factId: 'F1',
    allegation: 'Contrato assinado em 01/2023',
    proofType: 'documentary',
    certaintyDegree: 99,
    proofWeight: 'substancial',
    sources: ['ANEXO_01_Contrato.pdf']
  },
  // ... more facts
]

// Analyze jurimetry
const analysis = JurimetryService.analyzeJurimetry(facts)
console.log(`TCP: ${analysis.tcp.toFixed(1)}%`)
console.log(`Score: ${analysis.jurimetricScore.toFixed(1)}/100`)

// Generate HTML for petition
const html = JurimetryService.generateHtmlMatrix(analysis)
// Insert into petition template
```

### Output Structure

```typescript
interface JurimetricAnalysis {
  tcp: number // 66.7% (Example: 2/3 facts with substantial proof)
  averageCertaintyDegree: number // 77.7% (Example)
  factStrengthDistribution: {
    high: 2    // 80-100% certainty
    moderate: 1 // 50-80%
    fragile: 0  // <50%
  }
  argumentVsProofMatrix: ArgumentProofCorrelation[]
  riskGaps: ['Fact X lacks corroboration', ...]
  jurimetricScore: number // 0-100 (overall health)
  visualMatrix: VisualProofMatrix[] // ASCII bars for display
}
```

---

## Layer 2: Media Optimization

### File
- `scripts/media_optimizer.py`

### Installation

```bash
# Core dependencies
pip install Pillow

# Optional: OCR
pip install pytesseract
# Also install Tesseract binary: https://github.com/UB-Mannheim/tesseract/wiki
```

### Usage

```bash
# Basic optimization
python scripts/media_optimizer.py ./images

# With custom output directory
python scripts/media_optimizer.py ./images --output ./optimized

# Without OCR (if Tesseract unavailable)
python scripts/media_optimizer.py ./images  # Gracefully skips OCR
```

### Output Files

1. **optimized_*.png**: Resized images (1200×675 or 800×1000)
2. **media_metadata.json**: JSON structure for React
3. **media_gallery.html**: HTML table with OCR text

### media_metadata.json Structure

```json
{
  "totalAssets": 3,
  "totalCompressionSavings": 245.5,
  "allReadyForCnn": true,
  "assets": [
    {
      "original_filename": "ContractPage1.jpg",
      "optimized_filename": "optimized_ContractPage1.png",
      "dimensions": "1200x675",
      "original_size_kb": 450.2,
      "optimized_size_kb": 204.7,
      "compression_ratio": 54.6,
      "ocr_text": "Contrato de Prestação de Serviços... [truncated]",
      "sha256": "a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1",
      "ready_for_cnn": true,
      "metadata": {
        "authenticityHash": "a8f5c3b9..."
      }
    }
  ]
}
```

### CNN Integration

The optimized metadata is compatible with:
- **YOLO v8**: Object detection in judicial documents
- **ResNet**: Image classification (document type, damage level)
- **Tesseract OCR**: Text extraction from images
- **Tribunal AI**: Court systems' automated processing pipelines

---

## Layer 3: Contingency Engineering

### Type Definition
- `src/types/jurimetry.ts`: `UnreadableAssetContingency`

### Use Case: Corrupted Audio File

```markdown
---

## QUADRO DE HOMOLOGAÇÃO SEMÂNTICA DE ANEXOS ILEGÍVEIS

### ANEXO_04: Audio_WhatsApp_Confissao.mp3
**Status**: Anexo não-estruturado (mídia de áudio)

**Metadados de Autenticidade**:
- Hash SHA-256 Original: `a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1`
- Plataforma de Registro: Verifact (certificado)
- Data de Captura: 15/03/2026

**Transcrição/Sumarização para IA**:
```
[00:00 - 02:14] Diálogo inicial entre Autor e Réu
[02:14 - 02:47] ⚠️ TRECHO CRÍTICO - Réu afirma:
  "Não vou pagar esta parcela"
[02:47 - 03:42] Discussão sobre prazos
```

**Jurisprudência Validadora**:
STJ EREsp 1.654.567/MG - "Áudio como prova não-estruturada 
desde que acompanhado de transcrição e hash de autenticidade"

**Acesso Rápido**:
📥 [CLIQUE PARA OUVIR]
   Protocolo: Compartilhado com @tjpr.jus.br

---
```

### TypeScript Implementation

```typescript
interface UnreadableAssetContingency {
  annexId: 'ANEXO_04'
  originalFilename: 'Audio_WhatsApp_Confissao.mp3'
  reasonUnreadable: 'damaged_scan' | 'encrypted' | 'legacy_format'
  semanticTranslation: {
    transcription: '[00:00-02:47] Critical confession by defendant...',
    description: 'Audio evidence of defendant admission',
    authenticityProof: {
      notarialAct: 'Notary Public act #12345',
      sha256Original: 'a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1',
      dateRecovered: new Date('2026-03-15')
    }
  },
  accessibilityAlternative: {
    googleDriveLink: 'https://drive.google.com/file/d/.../view',
    description: 'Complete audio with timestamp breakdown',
    restrictedToTribunal: true
  },
  jurisprudentialCitation: 'STJ EREsp 1.654.567/MG'
}
```

---

## Layer 4: Advanced Automation

### File
- `scripts/advanced_automation.py`

### Installation

```bash
# Google Drive API
pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client

# Setup OAuth2 credentials from Google Cloud Console
# Save as credentials.json in project root
```

### Usage

```bash
# Register files locally only
python scripts/advanced_automation.py ./peticao_assets --tribunal TJPR

# Register and upload to Google Drive
python scripts/advanced_automation.py ./peticao_assets --tribunal TJPR --upload

# Specify processo number for semantic index
python scripts/advanced_automation.py ./peticao_assets --tribunal TJPR --upload --processo 0012345-67.2026.8.16.0001
```

### Output Files

1. **metadata_registry.json**: Complete file inventory
2. **semantic_index.json**: Compatible with Legal-BERT-PT, TF-IDF
3. **ANEXOS_INDEX.md**: Markdown table for petition inclusion

### semantic_index.json Structure

```json
{
  "caseMetadata": {
    "processoNumber": "0012345-67.2026.8.16.0001",
    "tribunal": "TJPR",
    "exportedAt": "2026-07-04T15:30:00Z"
  },
  "annexesIndex": [
    {
      "annexId": "ANEXO_01",
      "filename": "Contrato.pdf",
      "type": "document_structured",
      "hash": "a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1",
      "link": "https://drive.google.com/file/d/.../view",
      "sharingProtocol": "domain_restricted",
      "accessibleBy": ["tjpr.jus.br", "cnj.jus.br"],
      "extractedContent": {
        "fulltext": null,
        "entities": ["Empresa XYZ", "Sr. João Silva"],
        "keywords": ["contrato", "prestação", "serviços"]
      }
    }
  ]
}
```

### Tribunal Domains Supported

```python
TRIBUNAL_DOMAINS = {
    'TJPR': 'tjpr.jus.br',      # Paraná State Court
    'TJSC': 'tjsc.jus.br',      # Santa Catarina State Court
    'TJMT': 'tjmt.jus.br',      # Mato Grosso State Court
    'TJRO': 'tjro.jus.br',      # Rondônia State Court
    'TRF4': 'trf4.jus.br',      # Federal Regional Court 4
    'JFPR': 'jfpr.jus.br',      # Federal Court Paraná
    'CNJ': 'cnj.jus.br'         # National Council of Justice
}
```

---

## Proof Summary Framework

### Files
- `src/types/proofSummary.ts`: Type definitions
- `src/services/proofSummaryService.ts`: Generation logic

### Core Methods

```typescript
// Main entry point
ProofSummaryService.generateProofSummary(
  petitionId: string,
  facts: FactProof[],
  jurisprudence?: any[]
): ProofSummaryFramework

// Strategic analysis
ProofSummaryService.generateContestationResponseMatrix(
  facts: FactProof[],
  expectedContestations: string[]
): ContestationResponseMatrix

// HTML generation
ProofSummaryService.generateHtmlProofSummary(
  framework: ProofSummaryFramework
): string
```

### Usage Example

```typescript
import { ProofSummaryService } from '@/services/proofSummaryService'
import { JurimetryService } from '@/services/jurimetryService'

const facts = [...] // FactProof[]

// Step 1: Get jurimetry analysis
const jurimetryAnalysis = JurimetryService.analyzeJurimetry(facts)

// Step 2: Generate proof summary framework
const proofSummary = ProofSummaryService.generateProofSummary(
  'PETICAO_001',
  facts,
  jurisprudence
)

// Step 3: Analyze expected contestations
const expectedContestations = [
  'Challenge witness credibility',
  'Argue insufficient proof strength',
  'Attack procedure for evidence collection'
]

const responseMatrix = ProofSummaryService.generateContestationResponseMatrix(
  facts,
  expectedContestations
)

// Step 4: Generate HTML for petition
const htmlFramework = ProofSummaryService.generateHtmlProofSummary(proofSummary)
```

### Hermenêutica Blindada: 4 Pillars

#### 1. Ethos (Credibility)
- Authority based on documentary evidence
- Credibility markers: Contemporary docs, digital evidence, expert testimony
- Presumption of good faith in legal proceedings

#### 2. Pathos (Emotional & Justice Appeal)
- Justice demands respect for contractual obligations
- Unjust enrichment prevention
- Protection of reasonable reliance interests
- Prevention of abuse of procedural rights

#### 3. Logos (Logical Structure)
- Syllogistic chains: Law → Fact → Conclusion
- Preponderance of evidence standard
- Burden of proof allocation
- Jurisprudential precedent

#### 4. Kairos (Timeliness & Opportunity)
- Swift resolution prevents evidence decay
- Timely presentation prevents witness unavailability
- Opportunity to justice shouldn't be lost through procedural delays
- Protection of legitimate expectations

### Output Structure

```typescript
interface ProofSummaryFramework {
  petitionId: string
  executiveSummary: {
    mainArgument: string // 1-sentence thesis
    keyProofs: string[] // 3-5 strongest proofs
    expectedOutcome: string
    riskAssessment: string
    hermeneuticShield: string
  }
  factsSummary: ProofSummaryFact[] // Each with weight, shields, citations
  contestationAnalysis: {
    expectedContestations: string[]
    vulnerabilityAreas: string[]
    preemptiveRefutations: string[]
  }
  strategicHermeneutics: {
    ethosApproach: {...}
    pathosApproach: {...}
    logosApproach: {
      syllogisms: SyllogisticChain[]
    }
    kairosApproach: {...}
  }
  conclusiveSynthesis: {
    synthesisStatement: string
    requestedRelief: string
    alternativeRelief: string
    proceduralSafeguards: ProceduralSafeguard[]
  }
  generatedAt: Date
}
```

### Contestation Response Matrix

Each expected contestation gets:
1. **Direct Response**: Factual refutation
2. **Logical Basis**: Why our position is stronger
3. **Supporting Proof**: Specific annexes or jurisprudence
4. **Backup Response**: Secondary argument if primary challenged
5. **Strength Rating**: 0-100 confidence

---

## Integration Flow

### Complete Petition Generation Workflow

```
1. GATHER FACTS
   ├─ User provides allegations + evidence
   └─ Creates FactProof[] array

2. JURIMETRY ANALYSIS (Layer 1)
   ├─ JurimetryService.analyzeJurimetry(facts)
   ├─ Output: TCP, certainty, strength distribution, risk gaps
   └─ HTML table with visual proof matrix

3. MEDIA OPTIMIZATION (Layer 2)
   ├─ python media_optimizer.py ./images
   ├─ Output: OCR text, SHA-256 hashes, optimized dimensions
   └─ metadata.json for React component integration

4. PROOF SUMMARY FRAMEWORK
   ├─ ProofSummaryService.generateProofSummary(facts)
   ├─ Analyzes expected contestations
   ├─ Builds hermeneutic shields (Ethos/Pathos/Logos/Kairos)
   └─ HTML ready for petition

5. ADVANCED AUTOMATION (Layer 4)
   ├─ python advanced_automation.py ./assets --upload
   ├─ Google Drive upload with domain-restricted sharing
   ├─ Semantic index (Legal-BERT-PT compatible)
   └─ Markdown table for petition

6. CONTINGENCY HANDLING (Layer 3)
   ├─ For unreadable assets: Create UnreadableAssetContingency
   ├─ Add semantic translation + transcription
   ├─ Include notarial reference + jurisprudence citation
   └─ Alternative Google Drive link with tribunal domain

7. FINAL PETITION
   ├─ Combine all HTML sections
   ├─ Apply CSS @page formatting (Path A - next phase)
   ├─ Export as PDF via Eproc/PJe/Projudi
   └─ All tribunal AI systems can read & index
```

---

## Next Steps: Path A (CSS @page Implementation)

The Proof Summary Framework (Path B) provides the **content layer**.
Path A will provide the **presentation layer** via CSS @page rules:

```css
@page {
  margin: 3cm 2.5cm;
  @top-left {
    content: "Tribunal Name";
  }
  @top-right {
    content: "Petition Number";
  }
  @bottom-center {
    content: "Page " counter(page) " of " counter(pages);
  }
}

@page :first {
  margin-top: 5cm; /* Extra space for caption */
}
```

This will ensure:
- Perfect judicial formatting per tribunal standards
- Automatic page breaks after key sections
- Headers/footers with petition metadata
- Semantic HTML validation (H1-H6, tables, lists)
- Ready for direct Eproc/PJe/Projudi submission

---

## Testing Checklist

- [x] Jurimetry: TCP calculation, strength distribution, risk gap identification
- [x] Media Optimizer: Image resizing, OCR, SHA-256, compression
- [x] Contingency: UnreadableAssetContingency types and templates
- [x] Advanced Automation: File registration, Google Drive sync, semantic indexing
- [x] Proof Summary: Hermeneutic framework, contestation analysis, response matrices
- [ ] CSS @page: Judicial formatting templates (Path A - next)
- [ ] React Components: Visual editor integration (FASE 3A)
- [ ] Claude API: Automatic text generation for proof summaries (FASE 3C)

---

## Status Summary

**FASE 2.5 Completion**:
- ✅ Jurimetry Service (JurimetryService.ts, types/jurimetry.ts)
- ✅ Media Optimizer (media_optimizer.py)
- ✅ Contingency Framework (UnreadableAssetContingency types)
- ✅ Advanced Automation (advanced_automation.py)
- ✅ Proof Summary Framework (ProofSummaryService.ts, types/proofSummary.ts)

**Ready for FASE 3A** (Visual Law Editor):
- TipTap integration with semantic validation
- Real-time proof matrix generation
- Hermeneutic shield visualization
- Live preview with dual view (visual + HTML)
- Export to Eproc/PJe/Projudi

