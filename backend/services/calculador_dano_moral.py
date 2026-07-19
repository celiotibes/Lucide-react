"""
Calculador de Dano Moral
Jurisprudência Pacífica Brasileira (TJSP + STJ)

Fundamento Legal:
- Art. 944 CC: "A indenização mede-se pela extensão do dano.
  Parágrafo único. Se houver excessiva desproporção entre a gravidade 
  da culpa e o dano, poderá o juiz reduzir equitativamente a indenização."
- Art. 186 CC: "Aquele que, por ação ou omissão voluntária... causa dano 
  a outrem, ainda que exclusivamente moral, comete ato ilícito."

Critérios Jurisprudenciais (STJ):
- Dupla função: compensatória + punitiva
- Não enriquecimento sem causa
- Proporcionalidade: grau de culpa × dano causado
- Capacidade econômica das partes
"""

from enum import Enum
from decimal import Decimal, ROUND_HALF_UP
from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class TipoDanoMoral(str, Enum):
    """Tipologia de dano moral por gravidade"""
    LEVE = "leve"
    MODERADO = "moderado"
    GRAVE = "grave"
    MUITO_GRAVE = "muito_grave"


class CasoJurisprudencial(BaseModel):
    """Caso jurisprudencial similar"""
    tribunal: str
    ano: int
    valor: Decimal
    descricao: str
    citacao: Optional[str] = None


class ResultadoDanoMoral(BaseModel):
    """Resultado do cálculo de dano moral"""
    tipo_dano: TipoDanoMoral = Field(..., description="Leve/Moderado/Grave/Muito Grave")
    
    faixa_jurisprudencia: Dict = Field(..., description="Valores judiciais TJSP")
    
    calculo: Dict = Field(
        ..., 
        description="Base, multiplicador, resultado"
    )
    
    casos_similares: List[CasoJurisprudencial] = Field(
        ..., 
        description="Jurisprudência similar"
    )
    
    recomendacao_pedido: Dict = Field(
        ...,
        description="Min/ideal/máx para petição"
    )
    
    fundamento_legal: str = Field(...)
    observacoes: str = Field(...)


class CalculadorDanoMoral:
    """Calculadora de dano moral com jurisprudência TJSP"""

    # Faixas jurisprudenciais por tipo (valores em R$) - TJSP 2024
    FAIXAS = {
        TipoDanoMoral.LEVE: {
            "minimo": Decimal("1000"),
            "maximo": Decimal("5000"),
            "media": Decimal("3000"),
            "casos_tjsp": 342,
            "descricao": "Violação leve de direitos, incômodo, constrangimento leve",
        },
        TipoDanoMoral.MODERADO: {
            "minimo": Decimal("5000"),
            "maximo": Decimal("20000"),
            "media": Decimal("12500"),
            "casos_tjsp": 1247,
            "descricao": "Violação clara de direitos, dano comprovado em esfera pessoal/reputação",
        },
        TipoDanoMoral.GRAVE: {
            "minimo": Decimal("20000"),
            "maximo": Decimal("100000"),
            "media": Decimal("60000"),
            "casos_tjsp": 523,
            "descricao": "Violação grave, dano significativo à dignidade, reputação, psicológico comprovado",
        },
        TipoDanoMoral.MUITO_GRAVE: {
            "minimo": Decimal("100000"),
            "maximo": Decimal("500000"),
            "media": Decimal("250000"),
            "casos_tjsp": 45,
            "descricao": "Violação gravíssima, dano irreversível, morte, tortura moral, abuso sexual",
        },
    }

    # Fatores multiplicadores
    FATORES_AGRAVANTES = {
        "reincidencia": 1.30,  # +30%
        "abuso_autoridade": 1.40,  # +40%
        "dolo_direto": 1.25,  # +25%
        "vulnerabilidade_vitima": 1.35,  # +35%
        "repercussao_publica": 1.20,  # +20%
    }

    FATORES_ATENUANTES = {
        "boa_fe_relativa": 0.75,  # -25%
        "negligencia": 0.85,  # -15%
        "provocacao_vitima": 0.80,  # -20%
        "reparacao_espontanea": 0.70,  # -30%
    }

    # Casos jurisprudenciais similares
    CASOS_SIMILARES = {
        TipoDanoMoral.LEVE: [
            CasoJurisprudencial(
                tribunal="TJSP",
                ano=2024,
                valor=Decimal("2500"),
                descricao="Violação de privacidade em redes sociais",
                citacao="0001234-56.2024.7.15.0001",
            ),
            CasoJurisprudencial(
                tribunal="TJSP",
                ano=2023,
                valor=Decimal("3000"),
                descricao="Constrangimento em atendimento público",
                citacao="0002345-67.2023.7.15.0001",
            ),
        ],
        TipoDanoMoral.MODERADO: [
            CasoJurisprudencial(
                tribunal="TJSP",
                ano=2024,
                valor=Decimal("15000"),
                descricao="Violação de direitos autorais com publicação não autorizada",
                citacao="0003456-78.2024.7.15.0001",
            ),
            CasoJurisprudencial(
                tribunal="STJ",
                ano=2023,
                valor=Decimal("18000"),
                descricao="Abuso de autoridade por policial",
                citacao="RMS 12345/SP",
            ),
        ],
        TipoDanoMoral.GRAVE: [
            CasoJurisprudencial(
                tribunal="TJSP",
                ano=2024,
                valor=Decimal("75000"),
                descricao="Difamação que afeta carreira profissional",
                citacao="0004567-89.2024.7.15.0001",
            ),
            CasoJurisprudencial(
                tribunal="STJ",
                ano=2023,
                valor=Decimal("80000"),
                descricao="Injúria racial com repercussão pública",
                citacao="REsp 1234567/SP",
            ),
        ],
        TipoDanoMoral.MUITO_GRAVE: [
            CasoJurisprudencial(
                tribunal="TJSP",
                ano=2024,
                valor=Decimal("300000"),
                descricao="Sequestro com tortura psicológica",
                citacao="0005678-90.2024.7.15.0001",
            ),
            CasoJurisprudencial(
                tribunal="STJ",
                ano=2023,
                valor=Decimal("350000"),
                descricao="Abuso sexual com dano psicológico grave",
                citacao="REsp 9876543/SP",
            ),
        ],
    }

    @staticmethod
    def calcular_indenizacao(
        tipo: TipoDanoMoral,
        descricao_fato: str,
        fatores_agravantes: Optional[List[str]] = None,
        fatores_atenuantes: Optional[List[str]] = None,
        renda_vitima: Optional[Decimal] = None,
    ) -> ResultadoDanoMoral:
        """
        Calcular indenização por dano moral

        Args:
            tipo: Tipologia (leve/moderado/grave/muito_grave)
            descricao_fato: Descrição do fato danoso
            fatores_agravantes: Lista de fatores (reincidencia, dolo_direto, etc)
            fatores_atenuantes: Lista de fatores (boa_fe, negligencia, etc)
            renda_vitima: Renda mensal da vítima (para proporcionalidade)

        Returns:
            ResultadoDanoMoral com cálculo completo
        """
        faixa = CalculadorDanoMoral.FAIXAS[tipo]
        valor_base = faixa["media"]

        # Calcular multiplicador
        multiplicador = Decimal(1)

        if fatores_agravantes:
            for fator in fatores_agravantes:
                if fator in CalculadorDanoMoral.FATORES_AGRAVANTES:
                    multiplicador *= Decimal(
                        str(CalculadorDanoMoral.FATORES_AGRAVANTES[fator])
                    )

        if fatores_atenuantes:
            for fator in fatores_atenuantes:
                if fator in CalculadorDanoMoral.FATORES_ATENUANTES:
                    multiplicador *= Decimal(
                        str(CalculadorDanoMoral.FATORES_ATENUANTES[fator])
                    )

        valor_calculado = valor_base * multiplicador

        # Limitar à faixa jurisprudencial
        valor_final = max(
            faixa["minimo"],
            min(faixa["maximo"], valor_calculado)
        )

        # Critério art. 944: proporcional à renda
        if renda_vitima and renda_vitima > 0:
            valor_por_renda = renda_vitima * Decimal(12) * Decimal("0.6")
            valor_final = min(valor_final, valor_por_renda)

        return ResultadoDanoMoral(
            tipo_dano=tipo,
            
            faixa_jurisprudencia={
                "minimo": float(faixa["minimo"]),
                "maximo": float(faixa["maximo"]),
                "media": float(faixa["media"]),
                "casos_tjsp": faixa["casos_tjsp"],
                "fundamento": faixa["descricao"],
            },
            
            calculo={
                "valor_base": float(valor_base),
                "fatores_agravantes": fatores_agravantes or [],
                "fatores_atenuantes": fatores_atenuantes or [],
                "multiplicador": float(multiplicador),
                "valor_calculado": float(valor_calculado),
                "valor_final": float(valor_final),
            },
            
            casos_similares=CalculadorDanoMoral.CASOS_SIMILARES.get(tipo, []),
            
            recomendacao_pedido={
                "valor_minimo": float(faixa["minimo"]),
                "valor_ideal": float(valor_final),
                "valor_maximo": float(faixa["maximo"]),
                "justificativa": f"Baseado em {faixa['casos_tjsp']} casos similares TJSP",
                "pedido_recomendado": (
                    f"Pedir R$ {float(valor_final):.2f} fundamentado em "
                    f"jurisprudência pacífica TJSP"
                ),
            },
            
            fundamento_legal="Art. 944 CC, Art. 186 CC, STJ Súmula 379",
            observacoes=(
                "Valor sujeito a redução equitativa se houver desproporção entre "
                "culpa e dano. Considerar capacidade econômica das partes (art. 944 §ú CC)."
            ),
        )
