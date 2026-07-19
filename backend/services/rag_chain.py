"""
RAG Chain para análise jurídica com hermenêutica blindada

Fluxo:
1. Query (fatos do caso) → embedding
2. Buscar jurisprudência similar no Pinecone
3. Context assembly (top-k resultados + calculadores)
4. Prompt jurídico especializado
5. Claude gera hermenêutica com citações
"""

import logging
from typing import List, Dict, Optional
from anthropic import Anthropic

logger = logging.getLogger(__name__)


class RAGChain:
    """RAG chain para análise jurídica com Claude"""

    def __init__(
        self,
        legal_embeddings,
        pinecone_client,
        model: str = "claude-3-5-sonnet-20241022",
    ):
        """
        Inicializar RAG chain

        Args:
            legal_embeddings: Instância LegalEmbeddings
            pinecone_client: Instância PineconeClient
            model: Modelo Claude a usar
        """
        self.embeddings = legal_embeddings
        self.pinecone = pinecone_client
        self.model = model
        self.client = Anthropic()

        logger.info(f"🔗 RAG Chain inicializado com modelo {model}")

    def _assembly_context(
        self,
        query: str,
        top_k: int = 5,
        calculador_dados: Optional[Dict] = None,
    ) -> str:
        """
        Montar contexto para prompt

        Args:
            query: Pergunta/fatos
            top_k: Número de resultados jurisprudenciais
            calculador_dados: Dados dos calculadores (dano, pensão, etc)

        Returns:
            Contexto formatado como string
        """
        logger.info("📋 Montando contexto...")

        # 1. Buscar jurisprudência similar
        query_embedding = self.embeddings.embeddings_from_text(query)
        jurisprudencia = self.pinecone.buscar_similaridade(
            query_embedding=query_embedding.tolist(),
            top_k=top_k,
        )

        context_parts = []

        # 2. Adicionar jurisprudência
        if jurisprudencia:
            context_parts.append("## JURISPRUDÊNCIA SIMILAR\n")
            for i, result in enumerate(jurisprudencia, 1):
                metadata = result.get("metadata", {})
                score = result.get("score", 0)
                context_parts.append(
                    f"{i}. [{metadata.get('tribunal', 'Tribunal')} "
                    f"{metadata.get('ano', 'XXXX')}] (relevância: {score:.2%})\n"
                    f"   Resumo: {metadata.get('resumo', 'N/A')}\n"
                    f"   Citação: {metadata.get('citacao', 'N/A')}\n"
                )

        # 3. Adicionar dados dos calculadores
        if calculador_dados:
            context_parts.append("\n## CÁLCULOS JURÍDICOS\n")
            if "dano_material" in calculador_dados:
                dm = calculador_dados["dano_material"]
                context_parts.append(
                    f"**Dano Material:**\n"
                    f"- Valor Corrigido: R$ {dm.get('valor_corrigido', 0):,.2f}\n"
                    f"- Juros: R$ {dm.get('juros_compostos', 0):,.2f}\n"
                    f"- Total: R$ {dm.get('valor_total', 0):,.2f}\n"
                    f"- Fundamento: {dm.get('fundamento_legal', 'Art. 406 CC')}\n\n"
                )

            if "pensao" in calculador_dados:
                p = calculador_dados["pensao"]
                context_parts.append(
                    f"**Pensão Alimentícia:**\n"
                    f"- Necessidade Comprovada: {'Sim' if p.get('necessidade_comprovada') else 'Não'}\n"
                    f"- Possibilidade Comprovada: {'Sim' if p.get('possibilidade_comprovada') else 'Não'}\n"
                    f"- Valor Sugerido: R$ {p.get('valor_recomendado', 0):,.2f}\n"
                    f"- Fundamento: {p.get('fundamento_legal', 'Art. 1.694 CC')}\n\n"
                )

            if "dano_moral" in calculador_dados:
                dm_moral = calculador_dados["dano_moral"]
                context_parts.append(
                    f"**Dano Moral:**\n"
                    f"- Tipo: {dm_moral.get('tipo_dano', 'N/A')}\n"
                    f"- Valor Recomendado: R$ {dm_moral.get('valor_recomendado', 0):,.2f}\n"
                    f"- Faixa Jurisprudencial: R$ {dm_moral.get('valor_minimo', 0):,.2f} - "
                    f"R$ {dm_moral.get('valor_maximo', 0):,.2f}\n"
                    f"- Fundamento: {dm_moral.get('fundamento_legal', 'Art. 944 CC')}\n"
                )

        context = "\n".join(context_parts)
        logger.info(f"✅ Contexto montado com {len(jurisprudencia)} fontes")
        return context

    def gerar_hermeneutica(
        self,
        query: str,
        top_k: int = 5,
        calculador_dados: Optional[Dict] = None,
        temperatura: float = 0.3,
    ) -> Dict:
        """
        Gerar hermenêutica blindada com RAG

        Args:
            query: Fatos/pergunta do caso
            top_k: Resultados jurisprudenciais a trazer
            calculador_dados: Dados dos calculadores
            temperatura: Criatividade (0.3 = preciso)

        Returns:
            Dict com hermenêutica, citações, confiança
        """
        logger.info("🔨 Gerando hermenêutica...")

        # 1. Montar contexto
        context = self._assembly_context(query, top_k, calculador_dados)

        # 2. Prompt jurídico especializado
        system_prompt = """Você é um expert em direito brasileiro com especialização em:
- Jurisprudência TJSP, STJ e STF
- Hermenêutica jurídica (interpretação de leis)
- Cálculos de indenizações e pensões
- Análise crítica de estratégias processuais

Analise os fatos fornecidos e gere uma HERMENÊUTICA BLINDADA com:
1. Análise de fundamentos jurídicos
2. Jurisprudência similar com citações
3. Recomendações processuais
4. Riscos/vulnerabilidades
5. Contra-argumentos prováveis

Formato: Use markdown, cite artigos de lei e jurisprudência."""

        user_prompt = f"""Fatos do caso:
{query}

Contexto jurisprudencial e cálculos:
{context}

Gere uma hermenêutica completa para este caso."""

        # 3. Chamar Claude
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                temperature=temperatura,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )

            hermeneutica = response.content[0].text

            # 4. Extrair citações (simples: linhas com "Art.", "Súmula", etc)
            citacoes = []
            for line in hermeneutica.split("\n"):
                if any(keyword in line for keyword in ["Art.", "Súmula", "Lei", "CC", "CPC"]):
                    citacoes.append(line.strip())

            logger.info(f"✅ Hermenêutica gerada ({len(hermeneutica)} chars, {len(citacoes)} citações)")

            return {
                "hermeneutica": hermeneutica,
                "citacoes": citacoes[:10],  # Top 10 citações
                "confianca": 0.85,  # Score de confiança
                "fontes_usadas": top_k,
                "modelo": self.model,
                "tokens_usados": response.usage.output_tokens,
            }

        except Exception as e:
            logger.error(f"❌ Erro ao gerar hermenêutica: {e}")
            raise

    def responder_pergunta(
        self,
        pergunta: str,
        contexto_jurisprudencia: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Responder pergunta jurídica específica com RAG

        Args:
            pergunta: Pergunta sobre o caso
            contexto_jurisprudencia: Jurisprudência já recuperada

        Returns:
            Resposta com fontes
        """
        logger.info(f"❓ Respondendo pergunta: {pergunta[:50]}...")

        query_embedding = self.embeddings.embeddings_from_text(pergunta)
        resultados = self.pinecone.buscar_similaridade(
            query_embedding=query_embedding.tolist(),
            top_k=3,
        )

        context_texto = "Jurisprudência relevante:\n"
        for r in resultados:
            metadata = r.get("metadata", {})
            context_texto += f"- {metadata.get('resumo', 'N/A')} [{metadata.get('citacao', 'N/A')}]\n"

        system_prompt = """Você é um especialista em direito brasileiro.
Responda a pergunta jurídica baseado na jurisprudência fornecida.
Cite sempre as fontes e artigos relevantes."""

        user_prompt = f"""Pergunta: {pergunta}

{context_texto}

Responda a pergunta."""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1000,
                temperature=0.2,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )

            resposta = response.content[0].text

            logger.info("✅ Pergunta respondida")
            return {
                "pergunta": pergunta,
                "resposta": resposta,
                "fontes": resultados,
                "confianca": 0.80,
            }

        except Exception as e:
            logger.error(f"❌ Erro ao responder: {e}")
            raise
