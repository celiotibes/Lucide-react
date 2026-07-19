"""
Rotas: Consulta de Processos
GET /processos/{numero} - Consultar processo no Portal Jus.br
GET /processos/{numero}/andamentos - Histórico de andamentos
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import logging

from services.cnj_portal import cnj_client, ProcessoData, Andamento

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/processos", tags=["processos"])


@router.get("/{numero}", response_model=ProcessoData)
async def consultar_processo(numero: str):
    """
    Consultar dados completos do processo no Portal Jus.br

    Args:
        numero: Número do processo (ex: 0000001-55.2026.7.15.0001)

    Returns:
        ProcessoData com informações completas

    Raises:
        HTTPException: 404 se não encontrado, 400 se inválido
    """
    try:
        if not numero or len(numero) < 10:
            raise HTTPException(status_code=400, detail="Número de processo inválido")

        logger.info(f"Consultando processo: {numero}")

        processo = await cnj_client.consultar_processo(numero)

        if processo is None:
            logger.warning(f"Processo não encontrado: {numero}")
            raise HTTPException(status_code=404, detail="Processo não encontrado")

        logger.info(f"Processo encontrado: {numero}")
        return processo

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao consultar processo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao consultar processo")


@router.get("/{numero}/andamentos", response_model=list[Andamento])
async def consultar_andamentos(numero: str):
    """
    Consultar histórico de andamentos do processo

    Args:
        numero: Número do processo

    Returns:
        Lista de andamentos ordenados por data

    Raises:
        HTTPException: 404 se não encontrado
    """
    try:
        logger.info(f"Consultando andamentos: {numero}")

        andamentos = await cnj_client.consultar_andamentos(numero)

        if andamentos is None:
            raise HTTPException(status_code=404, detail="Andamentos não encontrados")

        # Ordenar por data (mais recente primeiro)
        andamentos_sorted = sorted(andamentos, key=lambda x: x.data, reverse=True)

        logger.info(f"Andamentos encontrados: {len(andamentos_sorted)}")
        return andamentos_sorted

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao consultar andamentos: {e}")
        raise HTTPException(status_code=500, detail="Erro ao consultar andamentos")


@router.get("/")
async def listar_processos(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Listar processos (placeholder para futura paginação)

    Args:
        limit: Máximo de resultados
        offset: Offset de paginação

    Returns:
        Lista de processos (vazio por enquanto)
    """
    return {
        "message": "Endpoint para listar processos será implementado em fase futura",
        "limit": limit,
        "offset": offset,
        "processos": [],
    }
