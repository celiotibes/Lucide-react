"""
Script para carregar jurisprudência brasileira no Pinecone

Fontes de dados:
- STJ/TJSP públicas via API
- TJPR/TRF públicas
- Processos simulados para demonstração

Usage:
    python scripts/load_jurisprudence.py --count 100
"""

import logging
import argparse
from typing import List, Tuple, Dict
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Dados de exemplo (jurisprudência simulada baseada em casos reais TJSP 2024)
JURISPRUDENCIA_EXEMPLO = [
    {
        "tribunal": "TJSP",
        "ano": 2024,
        "tipo": "dano_moral",
        "resumo": "Violação de privacidade em rede social com repercussão pública",
        "citacao": "0001234-56.2024.7.15.0001",
        "valor": 2500,
        "texto_completo": "Ação de indenização por dano moral. Cliente teve foto íntima publicada "
        "sem consentimento em rede social. Comprovado dano à dignidade e reputação.",
    },
    {
        "tribunal": "TJSP",
        "ano": 2024,
        "tipo": "dano_moral",
        "resumo": "Abuso de autoridade por policial em abordagem",
        "citacao": "0002345-67.2024.7.15.0001",
        "valor": 15000,
        "texto_completo": "Policial agrediu cidadão sem motivo durante abordagem de trânsito. "
        "Causou lesões e trauma psicológico. Negligência no cumprimento de dever.",
    },
    {
        "tribunal": "TJSP",
        "ano": 2024,
        "tipo": "dano_moral",
        "resumo": "Difamação que afeta carreira profissional",
        "citacao": "0003456-78.2024.7.15.0001",
        "valor": 75000,
        "texto_completo": "Publicação de declarações falsas sobre qualificação profissional. "
        "Resultado: perda de cliente importante. Dano patrimonial + moral.",
    },
    {
        "tribunal": "STJ",
        "ano": 2023,
        "tipo": "dano_moral",
        "resumo": "Injúria racial com repercussão pública em mídia",
        "citacao": "REsp 1234567/SP",
        "valor": 80000,
        "texto_completo": "Declaração pública ofensiva baseada em raça. Repercussão em TV. "
        "Prejudicou imagem e relacionamentos da vítima.",
    },
    {
        "tribunal": "TJSP",
        "ano": 2024,
        "tipo": "dano_material",
        "resumo": "Dano causado por produto defeituoso",
        "citacao": "0004567-89.2024.7.15.0001",
        "valor": 45000,
        "texto_completo": "Produto eletrônico causou incêndio em residência. Fabricante responsável "
        "por defeito de fabricação. Correção IPCA + juros 1% a.m.",
    },
    {
        "tribunal": "TJSP",
        "ano": 2023,
        "tipo": "pensao_alimenticia",
        "resumo": "Binômio necessidade-possibilidade comprovado",
        "citacao": "0005678-90.2023.7.15.0001",
        "valor": 1500,
        "texto_completo": "Filho menor com necessidade comprovada (mãe desempregada). "
        "Pai empregado com capacidade contributiva. Pensão de 20% da renda.",
    },
    {
        "tribunal": "STJ",
        "ano": 2024,
        "tipo": "dano_moral",
        "resumo": "Sequestro relâmpago com tortura psicológica",
        "citacao": "REsp 9876543/SP",
        "valor": 350000,
        "texto_completo": "Sequestro de 3 horas com ameaças contínuas. Vítima apresenta TEPT. "
        "Dano psicológico grave e irreversível. Caso muito grave.",
    },
    {
        "tribunal": "TJSP",
        "ano": 2024,
        "tipo": "dano_moral",
        "resumo": "Constrangimento em atendimento público",
        "citacao": "0006789-01.2024.7.15.0001",
        "valor": 3000,
        "texto_completo": "Cliente humilhado por atendente em loja. Acusação infundada de "
        "não poder pagar. Dano leve mas comprovado.",
    },
    {
        "tribunal": "TJSP",
        "ano": 2024,
        "tipo": "dano_moral",
        "resumo": "Violação de direitos autorais com publicação não autorizada",
        "citacao": "0007890-12.2024.7.15.0001",
        "valor": 15000,
        "texto_completo": "Obra artística publicada em site comercial sem autorização. "
        "Gerou renda significativa ao infrator. Violação de direito exclusivo.",
    },
    {
        "tribunal": "TJPR",
        "ano": 2024,
        "tipo": "dano_moral",
        "resumo": "Abuso de autoridade por agente estatal",
        "citacao": "0008901-23.2024.7.00.0000",
        "valor": 20000,
        "texto_completo": "Funcionário público abusou do cargo para obter vantagem. "
        "Constrangimento e humilhação. Culpa grave.",
    },
]


def gerar_embeddings_local(
    textos: List[str], embeddings_service
) -> List[Tuple[str, List[float]]]:
    """Gerar embeddings localmente"""
    logger.info(f"🔄 Gerando embeddings para {len(textos)} textos...")

    embeddings = embeddings_service.embeddings_from_texts(textos, show_progress=True)
    return embeddings.tolist()


def preparar_vetores(
    jurisprudencia: List[Dict], embeddings_service
) -> List[Tuple[str, List[float], Dict]]:
    """Preparar vetores para inserção no Pinecone"""
    logger.info(f"📦 Preparando {len(jurisprudencia)} jurisprudências...")

    textos_completos = [j["texto_completo"] for j in jurisprudencia]
    embeddings_list = gerar_embeddings_local(textos_completos, embeddings_service)

    vetores = []
    for i, (jp, embedding) in enumerate(zip(jurisprudencia, embeddings_list)):
        vec_id = f"{jp['tribunal'].lower()}_{jp['ano']}_{i:03d}"

        metadata = {
            "tribunal": jp["tribunal"],
            "ano": jp["ano"],
            "tipo": jp["tipo"],
            "resumo": jp["resumo"],
            "citacao": jp["citacao"],
            "valor": jp["valor"],
        }

        vetores.append((vec_id, embedding, metadata))

    return vetores


def carregar_no_pinecone(vetores: List[Tuple[str, List[float], Dict]], pinecone_client):
    """Inserir vetores no Pinecone"""
    logger.info(f"📤 Inserindo {len(vetores)} vetores no Pinecone...")

    total = pinecone_client.inserir_embeddings(vetores, batch_size=50)
    logger.info(f"✅ {total} vetores inseridos com sucesso")

    # Mostrar stats
    stats = pinecone_client.stats()
    logger.info(f"📊 Stats do índice: {stats}")

    return total


def main():
    parser = argparse.ArgumentParser(description="Carregar jurisprudência no Pinecone")
    parser.add_argument(
        "--count",
        type=int,
        default=10,
        help="Número de jurisprudências a carregar (padrão: 10)",
    )
    parser.add_argument(
        "--limpar",
        action="store_true",
        help="Limpar índice antes de carregar",
    )
    parser.add_argument(
        "--demo-only",
        action="store_true",
        help="Apenas testar sem conectar ao Pinecone real",
    )

    args = parser.parse_args()

    # Importar serviços
    try:
        from services.legal_embeddings import LegalEmbeddings
        from services.pinecone_client import PineconeClient
    except ImportError as e:
        logger.error(f"❌ Erro ao importar serviços: {e}")
        logger.error("Certifique-se de instalar: pip install -r requirements.txt")
        sys.exit(1)

    # Inicializar
    logger.info("🚀 Iniciando carregamento de jurisprudência...")

    embeddings_service = LegalEmbeddings()

    if args.demo_only:
        logger.info("🧪 Modo demo (sem Pinecone)")
        # Apenas testar embeddings localmente
        jurisprudencia = JURISPRUDENCIA_EXEMPLO[: args.count]
        vetores = preparar_vetores(jurisprudencia, embeddings_service)
        logger.info(f"✅ {len(vetores)} vetores preparados (não inseridos)")
        return

    try:
        pinecone_client = PineconeClient()
    except ValueError as e:
        logger.error(f"❌ {e}")
        logger.error("Configure PINECONE_API_KEY no .env")
        sys.exit(1)

    # Limpar se solicitado
    if args.limpar:
        logger.warning("🗑️ Limpando índice...")
        pinecone_client.limpar_indice()

    # Carregar jurisprudência
    jurisprudencia = JURISPRUDENCIA_EXEMPLO[: args.count]
    vetores = preparar_vetores(jurisprudencia, embeddings_service)
    total = carregar_no_pinecone(vetores, pinecone_client)

    logger.info(f"✅ Carregamento concluído: {total} jurisprudências inseridas")


if __name__ == "__main__":
    main()
