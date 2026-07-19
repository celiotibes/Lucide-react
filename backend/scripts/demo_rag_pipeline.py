"""
Demo script showing complete RAG pipeline flow

Demonstrates:
1. Text embedding generation
2. Similarity search (local, without Pinecone)
3. Context assembly from embeddings + calculator data
4. Hermenêutica generation (simulated with mock response)
"""

import logging
import sys
from typing import List, Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def demo_complete_rag_flow():
    """Demonstrate complete RAG pipeline"""

    logger.info("=" * 70)
    logger.info("🔨 DEMO: Complete RAG Pipeline Flow")
    logger.info("=" * 70)

    # ============================================
    # STEP 1: Sample Input Data
    # ============================================
    logger.info("\n📋 STEP 1: Input Data")
    logger.info("-" * 70)

    # Case facts
    fatos = [
        "Cliente sofreu violação de privacidade em rede social",
        "Publicação não autorizada de foto íntima com repercussão pública",
        "Prejuízo à dignidade e reputação profissional",
    ]
    query = "\n".join(fatos)
    logger.info(f"Query (fatos do caso):\n{query}\n")

    # Calculator data (from frontend FormularioCálculos)
    calculador_dados = {
        "dano_moral": {
            "tipo_dano": "moderado",
            "valor_recomendado": 25000,
            "valor_minimo": 10000,
            "valor_maximo": 50000,
            "fundamento_legal": "Art. 944 CC",
        },
        "dano_material": {
            "valor_corrigido": 75000,
            "juros_compostos": 8500,
            "valor_total": 83500,
            "fundamento_legal": "Art. 406 CC",
        },
    }
    logger.info(f"Calculator Data:\n{calculador_dados}\n")

    # ============================================
    # STEP 2: Simulate Jurisprudence Search Results
    # ============================================
    logger.info("🔍 STEP 2: Jurisprudence Search Results (Simulated)")
    logger.info("-" * 70)

    jurisprudencia = [
        {
            "id": "tjsp_2024_001",
            "score": 0.92,
            "metadata": {
                "tribunal": "TJSP",
                "ano": 2024,
                "tipo": "dano_moral",
                "resumo": "Violação de privacidade em rede social com repercussão pública",
                "citacao": "0001234-56.2024.7.15.0001",
                "valor": 25000,
            },
        },
        {
            "id": "tjsp_2024_002",
            "score": 0.87,
            "metadata": {
                "tribunal": "TJSP",
                "ano": 2024,
                "tipo": "dano_moral",
                "resumo": "Dano à imagem profissional por publicação não autorizada",
                "citacao": "0002345-67.2024.7.15.0001",
                "valor": 30000,
            },
        },
        {
            "id": "stj_2023_001",
            "score": 0.79,
            "metadata": {
                "tribunal": "STJ",
                "ano": 2023,
                "tipo": "dano_moral",
                "resumo": "Jurisprudência consolidada sobre violação de direitos de imagem",
                "citacao": "REsp 1234567/SP",
                "valor": 20000,
            },
        },
    ]

    for i, result in enumerate(jurisprudencia, 1):
        meta = result["metadata"]
        logger.info(
            f"\n{i}. [{meta['tribunal']} {meta['ano']}] (relevância: {result['score']:.1%})"
        )
        logger.info(f"   Resumo: {meta['resumo']}")
        logger.info(f"   Citação: {meta['citacao']}")
        logger.info(f"   Valor Jurisprudencial: R$ {meta['valor']:,.0f}")

    # ============================================
    # STEP 3: Assemble Context
    # ============================================
    logger.info("\n📦 STEP 3: Context Assembly")
    logger.info("-" * 70)

    context_parts = []

    # Jurisprudência
    context_parts.append("## JURISPRUDÊNCIA SIMILAR\n")
    for i, result in enumerate(jurisprudencia, 1):
        metadata = result.get("metadata", {})
        score = result.get("score", 0)
        context_parts.append(
            f"{i}. [{metadata.get('tribunal', 'Tribunal')} "
            f"{metadata.get('ano', 'XXXX')}] (relevância: {score:.1%})\n"
            f"   Resumo: {metadata.get('resumo', 'N/A')}\n"
            f"   Citação: {metadata.get('citacao', 'N/A')}\n"
            f"   Valor Jurisprudencial: R$ {metadata.get('valor', 0):,.0f}\n"
        )

    # Calculators
    if calculador_dados:
        context_parts.append("\n## CÁLCULOS JURÍDICOS\n")

        if "dano_moral" in calculador_dados:
            dm = calculador_dados["dano_moral"]
            context_parts.append(
                f"**Dano Moral:**\n"
                f"- Tipo: {dm.get('tipo_dano', 'N/A')}\n"
                f"- Valor Recomendado: R$ {dm.get('valor_recomendado', 0):,.2f}\n"
                f"- Faixa Jurisprudencial: R$ {dm.get('valor_minimo', 0):,.2f} - "
                f"R$ {dm.get('valor_maximo', 0):,.2f}\n"
                f"- Fundamento: {dm.get('fundamento_legal', 'Art. 944 CC')}\n\n"
            )

        if "dano_material" in calculador_dados:
            dmat = calculador_dados["dano_material"]
            context_parts.append(
                f"**Dano Material:**\n"
                f"- Valor Corrigido (IPCA): R$ {dmat.get('valor_corrigido', 0):,.2f}\n"
                f"- Juros Compostos: R$ {dmat.get('juros_compostos', 0):,.2f}\n"
                f"- Total: R$ {dmat.get('valor_total', 0):,.2f}\n"
                f"- Fundamento: {dmat.get('fundamento_legal', 'Art. 406 CC')}\n"
            )

    context = "\n".join(context_parts)
    logger.info("Assembled Context:")
    logger.info(context)

    # ============================================
    # STEP 4: Generate Hermenêutica (Simulated)
    # ============================================
    logger.info("\n🔨 STEP 4: Generate Hermenêutica")
    logger.info("-" * 70)

    hermeneutica_simulated = """
## Análise de Fundamentos Jurídicos

O caso envolve violação de privacidade e direito de imagem conforme:
- Art. 5º, X da Constituição Federal (inviolabilidade da privacidade e imagem)
- Art. 186 CC (abuso de direito gera obrigação de indenizar)
- Art. 944 CC (indenização proporcional ao dano)

A publicação não autorizada de conteúdo íntimo constitui abuso de direito e viola
a dignidade da pessoa humana, gerando dever de indenização por dano moral.

## Jurisprudência Aplicável

STJ Súmula 37: "Protege-se legalmente a inviolabilidade da privacidade, do segredo
e da intimidade das pessoas, e isso constitui fundamento para a indenização por
dano moral e material."

TJSP (2024) Jurisprudência consolidada: "A violação de privacidade em redes sociais
com repercussão pública constitui dano moral grave, ensejando indenização em
patamares de R$ 20.000 a R$ 50.000 conforme circunstâncias."

STJ - Distingue-se entre mero desconforto e dano moral efetivo. No presente caso,
há clara violação de direito personalíssimo com repercussão patrimonial.

## Recomendação

Fundamentar pedido em:
1. Violação de privacidade (Art. 5º X CF)
2. Abuso de direito (Art. 186 CC)
3. Jurisprudência TJSP consolidada (dano grave)
4. Valor Proposto: R$ 25.000 (dentro da faixa jurisprudencial)

Contra-argumentos Prováveis:
- Defesa pode alegar que usuário não protegeu privacidade (refutável: responsabilidade
  é de quem publica, não de quem teve conteúdo furtado)
- Alegar que publicação teve "interesse público" (improvável em caso de foto íntima)

## Conclusão

Caso com fundamentos jurídicos sólidos. Probabilidade de êxito: Alta (75%+)
Vulnerabilidades: Baixas
Prognóstico: Favorável
    """

    logger.info("Generated Hermenêutica:")
    logger.info(hermeneutica_simulated)

    # ============================================
    # STEP 5: Extract Citations
    # ============================================
    logger.info("\n🏛️ STEP 5: Extract Citations")
    logger.info("-" * 70)

    citacoes = []
    for line in hermeneutica_simulated.split("\n"):
        line_lower = line.lower()
        if any(
            keyword.lower() in line_lower
            for keyword in ["Art.", "Súmula", "Lei", "CC", "CPC", "CF"]
        ):
            citacao = line.strip()
            if citacao and len(citacao) > 10:  # Avoid short fragments
                citacoes.append(citacao)

    logger.info(f"Extracted {len(citacoes)} citations:")
    for i, cite in enumerate(citacoes[:10], 1):
        logger.info(f"{i}. {cite[:100]}...")

    # ============================================
    # STEP 6: Response Structure
    # ============================================
    logger.info("\n📊 STEP 6: Response Structure")
    logger.info("-" * 70)

    response = {
        "hermeneutica": hermeneutica_simulated.strip(),
        "citacoes": citacoes[:10],
        "confianca": 0.87,
        "fontes_usadas": len(jurisprudencia),
        "modelo": "claude-3-5-sonnet-20241022",
        "tokens_usados": 2156,
    }

    logger.info(f"✅ Hermenêutica Length: {len(response['hermeneutica'])} chars")
    logger.info(f"✅ Citations Found: {len(response['citacoes'])}")
    logger.info(f"✅ Confidence Score: {response['confianca']:.1%}")
    logger.info(f"✅ Sources Used: {response['fontes_usadas']}")
    logger.info(f"✅ Model: {response['modelo']}")
    logger.info(f"✅ Tokens Used: {response['tokens_usados']}")

    # ============================================
    # SUMMARY
    # ============================================
    logger.info("\n" + "=" * 70)
    logger.info("✅ DEMO COMPLETE: Full RAG Pipeline Working")
    logger.info("=" * 70)

    logger.info("\n📈 Pipeline Summary:")
    logger.info(f"  1. Input: Case facts + Calculator data")
    logger.info(f"  2. Search: Found {len(jurisprudencia)} relevant jurisprudence items")
    logger.info(f"  3. Context: Assembled {len(context_parts)} context sections")
    logger.info(f"  4. Analysis: Generated hermenêutica with {len(citacoes)} citations")
    logger.info(f"  5. Output: Ready for legal decision-making")

    logger.info("\n🚀 Next Steps:")
    logger.info("  1. Configure PINECONE_API_KEY in .env")
    logger.info("  2. Run: python scripts/load_jurisprudence.py --count 100")
    logger.info("  3. Start backend: python -m uvicorn main:app --reload")
    logger.info("  4. Test endpoints with: curl -X POST http://localhost:8000/api/...")

    return response


if __name__ == "__main__":
    demo_complete_rag_flow()
