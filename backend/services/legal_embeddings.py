"""
Serviço de Embeddings para Jurisprudência Brasileira
Usando sentence-transformers com modelo otimizado para legal

Modelos disponíveis:
- sentence-transformers/all-MiniLM-L6-v2 (universal, recomendado)
- sentence-transformers/all-mpnet-base-v2 (mais preciso, mais lento)
- Custom fine-tuned em jurisprudência (futuro)
"""

import logging
from typing import List, Dict, Tuple
from sentence_transformers import SentenceTransformer
import numpy as np

logger = logging.getLogger(__name__)


class LegalEmbeddings:
    """Gerador de embeddings para textos jurídicos"""

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        cache_folder: str = "./models",
    ):
        """
        Inicializar modelo de embeddings

        Args:
            model_name: Nome do modelo sentence-transformers
            cache_folder: Diretório para cache de modelos
        """
        self.model_name = model_name
        self.cache_folder = cache_folder

        logger.info(f"🔄 Carregando modelo {model_name}...")
        try:
            self.model = SentenceTransformer(model_name, cache_folder=cache_folder)
            logger.info(f"✅ Modelo carregado: {model_name}")
            logger.info(f"📊 Dimensão de embeddings: {self.model.get_sentence_embedding_dimension()}")
        except Exception as e:
            logger.error(f"❌ Erro ao carregar modelo: {e}")
            raise

    def embeddings_from_text(self, text: str) -> np.ndarray:
        """
        Gerar embedding para um único texto

        Args:
            text: Texto jurídico (ementa, parecer, etc)

        Returns:
            np.ndarray com embedding (dimensão 384 ou 768)
        """
        if not text or not isinstance(text, str):
            logger.warning("⚠️ Texto vazio ou inválido recebido")
            return np.zeros(self.model.get_sentence_embedding_dimension())

        # Limpeza básica
        text = text.strip()[:1000]  # Limitar a 1000 chars

        try:
            embedding = self.model.encode(text, convert_to_tensor=False)
            return embedding
        except Exception as e:
            logger.error(f"❌ Erro ao gerar embedding: {e}")
            raise

    def embeddings_from_texts(self, texts: List[str], show_progress: bool = True) -> List[np.ndarray]:
        """
        Gerar embeddings em batch (mais eficiente)

        Args:
            texts: Lista de textos
            show_progress: Mostrar barra de progresso

        Returns:
            Lista de embeddings
        """
        logger.info(f"📦 Gerando embeddings para {len(texts)} textos...")

        # Limpeza
        cleaned_texts = [t.strip()[:1000] if t else "" for t in texts]

        try:
            embeddings = self.model.encode(
                cleaned_texts,
                convert_to_tensor=False,
                show_progress_bar=show_progress,
                batch_size=32,  # Processar 32 por vez
            )
            logger.info(f"✅ {len(embeddings)} embeddings gerados")
            return embeddings
        except Exception as e:
            logger.error(f"❌ Erro ao gerar embeddings em batch: {e}")
            raise

    def similarity(self, query: str, documents: List[str], top_k: int = 5) -> List[Tuple[str, float]]:
        """
        Buscar similaridade entre query e documentos (sem Pinecone)
        Útil para testes locais

        Args:
            query: Texto de busca
            documents: Lista de documentos
            top_k: Top K resultados

        Returns:
            Lista de (documento, score) ordenado por relevância
        """
        logger.info(f"🔍 Buscando similaridade para query: {query[:50]}...")

        query_embedding = self.embeddings_from_text(query)
        doc_embeddings = self.embeddings_from_texts(documents, show_progress=False)

        # Calcular similaridade cosseno
        similarities = []
        for i, doc_emb in enumerate(doc_embeddings):
            # Cosseno = (A·B) / (||A|| * ||B||)
            cos_sim = np.dot(query_embedding, doc_emb) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(doc_emb) + 1e-8
            )
            similarities.append((documents[i], float(cos_sim)))

        # Ordenar por score decrescente
        similarities.sort(key=lambda x: x[1], reverse=True)
        results = similarities[:top_k]

        logger.info(f"✅ Top {len(results)} resultados encontrados")
        for i, (doc, score) in enumerate(results, 1):
            logger.info(f"   {i}. Score {score:.4f}: {doc[:50]}...")

        return results

    def get_embedding_dimension(self) -> int:
        """Retorna dimensão dos embeddings"""
        return self.model.get_sentence_embedding_dimension()
