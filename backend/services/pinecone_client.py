"""
Cliente Pinecone para armazenamento de embeddings jurídicos

Responsabilidades:
- Criar/deletar índices
- Inserir embeddings com metadados
- Buscar similaridade
- Atualizar/deletar vetores

Documentação: https://docs.pinecone.io/
"""

import logging
import os
from typing import List, Dict, Optional, Tuple
try:
    from pinecone import Pinecone
except ImportError:
    # Suporte para versão antiga
    from pinecone import Pinecone
import time

logger = logging.getLogger(__name__)


class PineconeClient:
    """Cliente para gerenciar índice Pinecone"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        environment: Optional[str] = None,
        index_name: str = "lucide-jurisprudencia",
        dimension: int = 384,  # Padrão para all-MiniLM-L6-v2
    ):
        """
        Inicializar cliente Pinecone

        Args:
            api_key: Chave API Pinecone (padrão: PINECONE_API_KEY env var)
            environment: Environment Pinecone (padrão: PINECONE_ENVIRONMENT env var)
            index_name: Nome do índice
            dimension: Dimensão dos embeddings (384 para MiniLM, 768 para MPNet)
        """
        self.api_key = api_key or os.getenv("PINECONE_API_KEY")
        self.environment = environment or os.getenv("PINECONE_ENVIRONMENT", "gcp-starter")
        self.index_name = index_name
        self.dimension = dimension

        if not self.api_key:
            raise ValueError("PINECONE_API_KEY não configurada")

        logger.info(f"🔌 Conectando ao Pinecone ({self.environment})...")

        try:
            self.pc = Pinecone(api_key=self.api_key)
            logger.info("✅ Conectado ao Pinecone")

            # Verificar índice
            self.index = self._get_or_create_index()
        except Exception as e:
            logger.error(f"❌ Erro ao conectar Pinecone: {e}")
            raise

    def _get_or_create_index(self):
        """Obter índice existente ou criar novo"""
        try:
            # Listar índices
            indexes = self.pc.list_indexes().names
            logger.info(f"📊 Índices disponíveis: {indexes}")

            if self.index_name in indexes:
                logger.info(f"✅ Usando índice existente: {self.index_name}")
                return self.pc.Index(self.index_name)
            else:
                logger.info(f"🆕 Criando índice: {self.index_name}")
                self.pc.create_index(
                    name=self.index_name,
                    dimension=self.dimension,
                    metric="cosine",  # Similaridade cosseno
                    spec={
                        "serverless": {
                            "cloud": "gcp",
                            "region": "us-central1",
                        }
                    },
                )
                # Aguardar criação
                time.sleep(5)
                return self.pc.Index(self.index_name)

        except Exception as e:
            logger.error(f"❌ Erro ao gerenciar índice: {e}")
            raise

    def inserir_embeddings(
        self,
        vectors: List[Tuple[str, List[float], Dict]],
        batch_size: int = 100,
    ) -> int:
        """
        Inserir embeddings com metadados

        Args:
            vectors: Lista de (id, embedding, metadata)
                - id: ID único (ex: "tjsp_2024_001")
                - embedding: Lista de floats
                - metadata: Dict com tribunal, ano, texto resumido, etc
            batch_size: Processar em lotes

        Returns:
            Número de vetores inseridos
        """
        if not vectors:
            logger.warning("⚠️ Lista vazia de vetores")
            return 0

        logger.info(f"📤 Inserindo {len(vectors)} vetores em lotes de {batch_size}...")

        try:
            total_inserted = 0

            for i in range(0, len(vectors), batch_size):
                batch = vectors[i : i + batch_size]
                upsert_data = [
                    (vec_id, embedding, metadata)
                    for vec_id, embedding, metadata in batch
                ]

                self.index.upsert(vectors=upsert_data)
                total_inserted += len(batch)

                if (i // batch_size + 1) % 10 == 0:
                    logger.info(f"   ✅ {total_inserted}/{len(vectors)} inseridos")

            logger.info(f"✅ {total_inserted} vetores inseridos com sucesso")
            return total_inserted

        except Exception as e:
            logger.error(f"❌ Erro ao inserir embeddings: {e}")
            raise

    def buscar_similaridade(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter_dict: Optional[Dict] = None,
    ) -> List[Dict]:
        """
        Buscar vetores similares

        Args:
            query_embedding: Embedding da query
            top_k: Número de resultados
            filter_dict: Filtro por metadados (ex: {"tribunal": "TJSP"})

        Returns:
            Lista de resultados com score e metadados
        """
        logger.info(f"🔍 Buscando top {top_k} resultados similares...")

        try:
            results = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                include_metadata=True,
                filter=filter_dict,
            )

            parsed_results = []
            for match in results.matches:
                parsed_results.append(
                    {
                        "id": match.id,
                        "score": float(match.score),
                        "metadata": match.metadata or {},
                    }
                )

            logger.info(f"✅ {len(parsed_results)} resultados encontrados")
            return parsed_results

        except Exception as e:
            logger.error(f"❌ Erro ao buscar: {e}")
            raise

    def deletar_vetor(self, vector_id: str) -> bool:
        """Deletar um vetor por ID"""
        try:
            self.index.delete(ids=[vector_id])
            logger.info(f"✅ Vetor deletado: {vector_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao deletar: {e}")
            return False

    def limpar_indice(self) -> bool:
        """Deletar todos os vetores do índice"""
        try:
            logger.warning("⚠️ Limpando índice inteiro...")
            self.index.delete(delete_all=True)
            logger.info("✅ Índice limpo")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao limpar índice: {e}")
            return False

    def deletar_indice(self) -> bool:
        """Deletar índice inteiro"""
        try:
            logger.warning(f"⚠️ Deletando índice: {self.index_name}")
            self.pc.delete_index(self.index_name)
            logger.info("✅ Índice deletado")
            return True
        except Exception as e:
            logger.error(f"❌ Erro ao deletar índice: {e}")
            return False

    def stats(self) -> Dict:
        """Obter estatísticas do índice"""
        try:
            index_stats = self.index.describe_index_stats()
            return {
                "index_name": self.index_name,
                "total_vectors": index_stats.total_vector_count,
                "dimension": index_stats.dimension,
                "namespaces": list(index_stats.namespaces.keys()) if index_stats.namespaces else [],
            }
        except Exception as e:
            logger.error(f"❌ Erro ao obter stats: {e}")
            return {}
