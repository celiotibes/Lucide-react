"""
Serviço de Integração: Portal Jus.br (CNJ)

Consulta de processos via API pública do CNJ
Sem autenticação necessária
Endpoint: https://www.cnj.jus.br/api/publico/

Status: FASE 4A
"""

import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# CNJ Portal API
CNJ_PORTAL_URL = "https://www.cnj.jus.br/api/publico"
REQUEST_TIMEOUT = 30.0
CACHE_TTL = 24 * 3600  # 24 horas


class Parte(BaseModel):
    """Parte envolvida no processo"""
    nome: str
    tipo: str  # "Ator", "Réu", etc
    advogados: Optional[List[str]] = None


class Andamento(BaseModel):
    """Movimentação do processo"""
    data: str  # YYYY-MM-DD
    tipo: str
    descricao: str
    tribunal: Optional[str] = None


class ProcessoData(BaseModel):
    """Dados do processo"""
    numero: str
    partes: List[Parte]
    tribunal: str
    data_protocolo: str
    andamentos: List[Andamento]
    status: str
    assunto: str


class CNJPortalClient:
    """Cliente para Portal Jus.br (CNJ)"""

    def __init__(self):
        self.base_url = CNJ_PORTAL_URL
        self.timeout = REQUEST_TIMEOUT

    async def consultar_processo(self, numero: str) -> Optional[ProcessoData]:
        """
        Consultar processo no Portal Jus.br

        Args:
            numero: Número do processo (ex: 0000001-55.2026.7.15.0001)

        Returns:
            ProcessoData ou None se não encontrado
        """
        try:
            # Validar formato número
            if not self._validar_numero_processo(numero):
                logger.warning(f"Número de processo inválido: {numero}")
                return None

            # Fazer requisição
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = f"{self.base_url}/processos/{numero}"
                response = await client.get(url)

                if response.status_code == 200:
                    data = response.json()
                    return self._processar_resposta(data)
                elif response.status_code == 404:
                    logger.info(f"Processo não encontrado: {numero}")
                    return None
                else:
                    logger.error(
                        f"Erro ao consultar CNJ: {response.status_code} - {response.text}"
                    )
                    return None

        except httpx.TimeoutException:
            logger.error(f"Timeout ao consultar Portal Jus.br para {numero}")
            return None
        except httpx.RequestError as e:
            logger.error(f"Erro de conexão com Portal Jus.br: {e}")
            return None
        except Exception as e:
            logger.error(f"Erro inesperado: {e}")
            return None

    async def consultar_andamentos(self, numero: str) -> Optional[List[Andamento]]:
        """
        Consultar andamentos do processo

        Args:
            numero: Número do processo

        Returns:
            Lista de andamentos ou None
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = f"{self.base_url}/processos/{numero}/andamentos"
                response = await client.get(url)

                if response.status_code == 200:
                    data = response.json()
                    return self._processar_andamentos(data)
                else:
                    logger.warning(f"Erro ao consultar andamentos: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Erro ao consultar andamentos: {e}")
            return None

    def _validar_numero_processo(self, numero: str) -> bool:
        """
        Validar formato do número de processo

        Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
        Exemplo: 0000001-55.2026.7.15.0001

        Returns:
            True se válido
        """
        # Remove formatação
        numero_limpo = numero.replace("-", "").replace(".", "")

        # Deve ter 20 dígitos
        if len(numero_limpo) != 20:
            return False

        # Todos devem ser números
        return numero_limpo.isdigit()

    def _processar_resposta(self, data: dict) -> Optional[ProcessoData]:
        """Processar resposta da API do CNJ"""
        try:
            return ProcessoData(
                numero=data.get("numeroProcesso", ""),
                partes=self._processar_partes(data.get("partes", [])),
                tribunal=data.get("tribunal", ""),
                data_protocolo=data.get("dataProtocolo", ""),
                andamentos=self._processar_andamentos(data.get("andamentos", [])),
                status=data.get("status", ""),
                assunto=data.get("assunto", ""),
            )
        except Exception as e:
            logger.error(f"Erro ao processar resposta CNJ: {e}")
            return None

    def _processar_partes(self, partes_raw: list) -> List[Parte]:
        """Processar lista de partes"""
        partes = []
        for parte_raw in partes_raw:
            try:
                parte = Parte(
                    nome=parte_raw.get("nome", ""),
                    tipo=parte_raw.get("tipo", ""),
                    advogados=parte_raw.get("advogados", []),
                )
                partes.append(parte)
            except Exception as e:
                logger.warning(f"Erro ao processar parte: {e}")
                continue
        return partes

    def _processar_andamentos(self, andamentos_raw: list) -> List[Andamento]:
        """Processar lista de andamentos"""
        andamentos = []
        for and_raw in andamentos_raw:
            try:
                and_obj = Andamento(
                    data=and_raw.get("data", ""),
                    tipo=and_raw.get("tipo", ""),
                    descricao=and_raw.get("descricao", ""),
                    tribunal=and_raw.get("tribunal"),
                )
                andamentos.append(and_obj)
            except Exception as e:
                logger.warning(f"Erro ao processar andamento: {e}")
                continue
        return andamentos


# Instância global
cnj_client = CNJPortalClient()
