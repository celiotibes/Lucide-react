"""
Testes para RAG - Retrieval Augmented Generation

Valida:
- Geração de embeddings
- Busca de similaridade
- Hermenêutica com jurisprudência
- Resposta a perguntas
"""

import pytest
from decimal import Decimal
from services.legal_embeddings import LegalEmbeddings
from services.pinecone_client import PineconeClient
from services.rag_chain import RAGChain


class TestLegalEmbeddings:
    """Testes para serviço de embeddings"""

    @pytest.fixture
    def embeddings_service(self):
        """Criar instância de embeddings"""
        return LegalEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

    def test_embedding_single_text(self, embeddings_service):
        """Teste: Gerar embedding para um texto"""
        texto = "Violação de direitos autorais sem consentimento"
        embedding = embeddings_service.embeddings_from_text(texto)

        assert embedding is not None
        assert len(embedding) == embeddings_service.get_embedding_dimension()
        assert embeddings_service.get_embedding_dimension() > 0

    def test_embedding_batch(self, embeddings_service):
        """Teste: Gerar embeddings em batch"""
        textos = [
            "Abuso de autoridade por policial",
            "Difamação em rede social",
            "Violação de privacidade",
        ]

        embeddings = embeddings_service.embeddings_from_texts(textos, show_progress=False)

        assert len(embeddings) == 3
        for emb in embeddings:
            assert len(emb) == embeddings_service.get_embedding_dimension()

    def test_similarity_search_local(self, embeddings_service):
        """Teste: Busca local de similaridade (sem Pinecone)"""
        query = "Abuso de autoridade por agente público"
        documentos = [
            "Policial agrediu cidadão sem motivo - abuso de autoridade",
            "Juiz recusou moção válida - violação de direitos",
            "Empresa vendeu produto sem autorização - ilegal",
        ]

        resultados = embeddings_service.similarity(query, documentos, top_k=2)

        assert len(resultados) <= 2
        assert len(resultados) > 0

        # Primeira resultado deve ser mais similar (abuso de autoridade)
        doc_top, score_top = resultados[0]
        assert "abuso" in doc_top.lower() or "autoridade" in doc_top.lower()
        assert score_top > 0  # Score positivo


class TestPineconeIntegration:
    """Testes para integração Pinecone"""

    @pytest.fixture
    def pinecone_client(self):
        """Criar cliente Pinecone (requer API key)"""
        try:
            return PineconeClient()
        except ValueError:
            pytest.skip("PINECONE_API_KEY não configurada")

    def test_pinecone_connection(self, pinecone_client):
        """Teste: Conexão com Pinecone"""
        assert pinecone_client is not None
        assert pinecone_client.index_name == "lucide-jurisprudencia"

    def test_pinecone_stats(self, pinecone_client):
        """Teste: Obter estatísticas do índice"""
        stats = pinecone_client.stats()

        assert "index_name" in stats
        assert "total_vectors" in stats
        assert "dimension" in stats

    def test_inserir_embeddings(self, pinecone_client):
        """Teste: Inserir embeddings no Pinecone"""
        # Criar dados de teste
        vetores = [
            (
                "tjsp_2024_001",
                [0.1] * 384,  # 384 dims para MiniLM
                {
                    "tribunal": "TJSP",
                    "ano": 2024,
                    "tipo": "dano_moral",
                    "resumo": "Violação de privacidade em rede social",
                    "citacao": "0001234-56.2024.7.15.0001",
                },
            ),
            (
                "stj_2023_001",
                [0.2] * 384,
                {
                    "tribunal": "STJ",
                    "ano": 2023,
                    "tipo": "abuso_autoridade",
                    "resumo": "Abuso de autoridade por agente público",
                    "citacao": "RMS 12345/SP",
                },
            ),
        ]

        total = pinecone_client.inserir_embeddings(vetores)
        assert total == 2

    def test_buscar_similaridade(self, pinecone_client):
        """Teste: Buscar vetores similares"""
        query_embedding = [0.15] * 384

        resultados = pinecone_client.buscar_similaridade(
            query_embedding=query_embedding, top_k=2
        )

        assert isinstance(resultados, list)
        assert len(resultados) <= 2

        # Validar estrutura
        for result in resultados:
            assert "id" in result
            assert "score" in result
            assert "metadata" in result


class TestRAGChain:
    """Testes para RAG chain"""

    @pytest.fixture
    def rag_services(self):
        """Criar serviços RAG"""
        try:
            embeddings = LegalEmbeddings()
            pinecone = PineconeClient()
            rag_chain = RAGChain(embeddings, pinecone)
            return rag_chain, embeddings, pinecone
        except:
            pytest.skip("Serviços RAG não disponíveis")

    def test_rag_assembly_context(self, rag_services):
        """Teste: Montar contexto para prompt"""
        rag_chain, _, _ = rag_services

        query = "Abuso de autoridade em detenção"
        context = rag_chain._assembly_context(query, top_k=3)

        assert isinstance(context, str)
        assert len(context) > 0

    def test_rag_hermeneutica_simples(self, rag_services):
        """Teste: Gerar hermenêutica simples (sem Pinecone real)"""
        rag_chain, embeddings, _ = rag_services

        query = "Cliente sofreu violação de direitos autorais"
        calculador_dados = {
            "dano_moral": {
                "tipo_dano": "moderado",
                "valor_recomendado": 15000,
                "fundamento_legal": "Art. 944 CC",
            }
        }

        # Teste sem chamar Claude (mock)
        context = rag_chain._assembly_context(query, top_k=1, calculador_dados=calculador_dados)

        assert "CÁLCULOS JURÍDICOS" in context
        assert "Dano Moral" in context
        assert "15000" in context

    def test_embedding_dimension_consistency(self, rag_services):
        """Teste: Dimensão dos embeddings é consistente"""
        rag_chain, embeddings, pinecone = rag_services

        dim_embeddings = embeddings.get_embedding_dimension()
        dim_pinecone = pinecone.dimension

        assert dim_embeddings == dim_pinecone


class TestRAGWorkflow:
    """Testes E2E para workflow RAG completo"""

    def test_jurisprudencia_relevante_dano_moral(self):
        """Teste: Buscar jurisprudência para dano moral"""
        embeddings = LegalEmbeddings()

        query = "Difamação que afeta carreira profissional"
        docs_exemplo = [
            "Caso de difamação com impacto comprovado na reputação profissional - TJSP 2024",
            "Abuso de autoridade por policial sem justificativa legal",
            "Violação de privacidade em mídia social",
        ]

        resultados = embeddings.similarity(query, docs_exemplo, top_k=2)

        assert len(resultados) > 0
        # Esperado: primeiro resultado é sobre difamação/reputação
        top_doc, score = resultados[0]
        assert any(
            word in top_doc.lower() for word in ["difamação", "reputação", "profissional"]
        )

    def test_jurisprudencia_relevante_abuso_autoridade(self):
        """Teste: Buscar jurisprudência para abuso de autoridade"""
        embeddings = LegalEmbeddings()

        query = "Abuso de autoridade por agente público"
        docs_exemplo = [
            "Policial agrediu cidadão em abordagem - abuso de autoridade claramente comprovado",
            "Juiz recusou habeas corpus válido",
            "Empresa vendeu produtos com fraude",
        ]

        resultados = embeddings.similarity(query, docs_exemplo, top_k=1)

        assert len(resultados) == 1
        top_doc, score = resultados[0]
        assert "policial" in top_doc.lower() or "autoridade" in top_doc.lower()
