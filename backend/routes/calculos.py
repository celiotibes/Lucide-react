"""
Rotas: Cálculos Jurídicos
POST /calcular/dano-material
POST /calcular/pensao-alimenticia
POST /calcular/dano-moral
"""

from fastapi import APIRouter, HTTPException, Query
from datetime import date
from decimal import Decimal
import logging

from services.calculador_dano_material import CalculadorDanoMaterial, ResultadoCalculo
from services.calculador_pensao import (
    CalculadorPensaoAlimenticia,
    AnaliseCredor,
    AnaliseDevedor,
    ResultadoBinomio,
    SituacaoDevedor,
)
from services.calculador_dano_moral import (
    CalculadorDanoMoral,
    TipoDanoMoral,
    ResultadoDanoMoral,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calcular", tags=["calculos"])


# ============================================================================
# DANO MATERIAL
# ============================================================================

@router.post("/dano-material", response_model=ResultadoCalculo)
async def calcular_dano_material(
    data_dano: str,  # YYYY-MM-DD
    valor_original: float,
    tipo_correccao: str = "IPCA",
    data_calculo: str = None,
    juros_compostos: bool = True,
):
    """
    Calcular indenização por dano material

    Args:
        data_dano: Data do evento (YYYY-MM-DD)
        valor_original: Valor em R$
        tipo_correccao: IPCA, TR ou SELIC
        data_calculo: Data para cálculo (hoje se omitido)
        juros_compostos: Aplicar juros de mora (1% a.m.)

    Returns:
        ResultadoCalculo com correção monetária + juros

    Example:
        POST /calcular/dano-material
        {
            "data_dano": "2025-03-15",
            "valor_original": 50000,
            "tipo_correccao": "IPCA"
        }
    """
    try:
        data_dano_obj = date.fromisoformat(data_dano)
        valor_obj = Decimal(str(valor_original))
        data_calculo_obj = date.fromisoformat(data_calculo) if data_calculo else None

        logger.info(f"Calculando dano material: R$ {valor_original} desde {data_dano}")

        resultado = CalculadorDanoMaterial.calcular_indenizacao(
            data_dano=data_dano_obj,
            valor_original=valor_obj,
            tipo_correccao=tipo_correccao,
            data_calculo=data_calculo_obj,
            juros_compostos=juros_compostos,
        )

        logger.info(f"Resultado: R$ {resultado.valor_total}")
        return resultado

    except ValueError as e:
        logger.warning(f"Erro de validação: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Erro ao calcular dano material: {e}")
        raise HTTPException(status_code=500, detail="Erro ao calcular")


# ============================================================================
# PENSÃO ALIMENTÍCIA (Binômio)
# ============================================================================

@router.post("/pensao-alimenticia", response_model=ResultadoBinomio)
async def calcular_pensao_alimenticia(
    renda_credor: float,
    despesas_credor: float,
    idade_credor: int,
    renda_devedor: float,
    despesas_devedor: float,
    situacao_devedor: str = "empregado",
    dependentes_devedor: int = 0,
):
    """
    Análise do binômio necessidade-possibilidade

    Args:
        renda_credor: Renda mensal de quem recebe
        despesas_credor: Despesas mensais
        idade_credor: Idade
        renda_devedor: Renda bruta de quem paga
        despesas_devedor: Despesas essenciais (moradia, saúde)
        situacao_devedor: empregado, autonomo, aposentado, desempregado, invalidez
        dependentes_devedor: Filhos do devedor

    Returns:
        ResultadoBinomio com recomendação

    Example:
        POST /calcular/pensao-alimenticia
        {
            "renda_credor": 1500,
            "despesas_credor": 2500,
            "idade_credor": 18,
            "renda_devedor": 5000,
            "despesas_devedor": 2000,
            "situacao_devedor": "empregado"
        }
    """
    try:
        credor = AnaliseCredor(
            renda_propria=Decimal(str(renda_credor)),
            despesas_mensais=Decimal(str(despesas_credor)),
            idade=idade_credor,
        )

        devedor = AnaliseDevedor(
            renda_bruta=Decimal(str(renda_devedor)),
            despesas_essenciais=Decimal(str(despesas_devedor)),
            situacao=SituacaoDevedor(situacao_devedor),
            dependentes=dependentes_devedor,
        )

        logger.info(f"Analisando binômio: credor R${renda_credor} vs devedor R${renda_devedor}")

        resultado = CalculadorPensaoAlimenticia.analisar_binomio(credor, devedor)

        logger.info(f"Recomendação: {resultado.recomendacao}")
        return resultado

    except ValueError as e:
        logger.warning(f"Erro de validação: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Erro ao analisar pensão: {e}")
        raise HTTPException(status_code=500, detail="Erro ao analisar")


# ============================================================================
# DANO MORAL
# ============================================================================

@router.post("/dano-moral", response_model=ResultadoDanoMoral)
async def calcular_dano_moral(
    tipo_dano: str,  # leve, moderado, grave, muito_grave
    descricao_fato: str,
    fatores_agravantes: list = None,
    fatores_atenuantes: list = None,
    renda_vitima: float = None,
):
    """
    Calcular indenização por dano moral

    Args:
        tipo_dano: leve, moderado, grave, muito_grave
        descricao_fato: Descrição do fato danoso
        fatores_agravantes: Lista (reincidencia, abuso_autoridade, dolo_direto, etc)
        fatores_atenuantes: Lista (boa_fe_relativa, negligencia, etc)
        renda_vitima: Renda mensal (proporcionalidade)

    Returns:
        ResultadoDanoMoral com jurisprudência

    Example:
        POST /calcular/dano-moral
        {
            "tipo_dano": "grave",
            "descricao_fato": "Violação de direitos autorais",
            "fatores_agravantes": ["dolo_direto"],
            "renda_vitima": 5000
        }
    """
    try:
        tipo = TipoDanoMoral(tipo_dano)
        renda = Decimal(str(renda_vitima)) if renda_vitima else None

        logger.info(f"Calculando dano moral {tipo_dano}")

        resultado = CalculadorDanoMoral.calcular_indenizacao(
            tipo=tipo,
            descricao_fato=descricao_fato,
            fatores_agravantes=fatores_agravantes or [],
            fatores_atenuantes=fatores_atenuantes or [],
            renda_vitima=renda,
        )

        logger.info(f"Valor recomendado: R$ {resultado.recomendacao_pedido['valor_ideal']}")
        return resultado

    except ValueError as e:
        logger.warning(f"Erro de validação: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Erro ao calcular dano moral: {e}")
        raise HTTPException(status_code=500, detail="Erro ao calcular")
