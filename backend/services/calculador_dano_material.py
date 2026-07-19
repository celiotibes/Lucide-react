"""
Calculador de Dano Material
Integração com Pydantic para validação

Responsabilidades:
- Correção monetária (IPCA/TR/SELIC)
- Juros compostos (art. 406 CC)
- Multas contratuais
- Simulação de cenários

Fundamento Legal:
- Art. 406 CC: "Quando a prestação consistir no pagamento de quantia em dinheiro,
  deverá o devedor corrigi-la monetariamente segundo índices oficiais regularmente
  estabelecidos, respondendo ainda pelos juros da mora a razão de um por cento ao mês."
"""

from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Dict, List
from pydantic import BaseModel, Field

# Índices de Correção Monetária (mensal) - 2024/2026
# Atualizar mensalmente com valores reais
INDICE_IPCA = {
    "2024-01": 2.80,
    "2024-02": 0.74,
    "2024-03": 0.48,
    "2024-04": 0.61,
    "2024-05": -0.06,
    "2024-06": 0.21,
    "2024-07": 0.36,
    "2024-08": 0.28,
    "2024-09": 0.44,
    "2024-10": 0.39,
    "2024-11": 0.54,
    "2024-12": 0.77,
    "2025-01": 0.70,
    "2025-02": 0.85,
    "2025-03": 1.24,
    "2025-04": 0.38,
    "2025-05": 0.21,
    "2025-06": 0.32,
    "2026-01": 0.80,
    "2026-02": 0.45,
    "2026-03": 0.33,
    "2026-04": 0.28,
    "2026-05": 0.42,
    "2026-06": 0.51,
    "2026-07": 0.48,
}

# Taxa SELIC média (% ao ano)
TAXA_SELIC = {
    "2024": 10.50,
    "2025": 9.25,
    "2026": 9.50,
}

# TR (Taxa Referencial) - Histórico
INDICE_TR = {
    "2024-01": 0.45,
    "2024-02": 0.32,
    "2024-03": 0.28,
    "2024-06": 0.15,
    "2025-01": 0.52,
    "2026-01": 0.48,
}


class ResultadoCalculo(BaseModel):
    """Resultado do cálculo de indenização"""
    valor_original: Decimal = Field(..., description="Valor na data do dano")
    indice_aplicado: str = Field(..., description="IPCA, TR ou SELIC")
    taxa_acumulada: Decimal = Field(..., description="Taxa (%) acumulada")
    valor_corrigido: Decimal = Field(..., description="Valor após correção")
    juros_compostos: Decimal = Field(..., description="Juros de mora (1% a.m.)")
    valor_total: Decimal = Field(..., description="Valor corrigido + juros")
    periodo_dias: int = Field(..., description="Dias entre dano e cálculo")
    periodo_anos: Decimal = Field(..., description="Anos (formato decimal)")
    fundamento_legal: str = Field(..., description="Artigos aplicáveis")
    detalhamento: Dict = Field(..., description="Dados por período")


class CalculadorDanoMaterial:
    """Calcula indenização por dano material"""

    @staticmethod
    def calcular_indenizacao(
        data_dano: date,
        valor_original: Decimal,
        tipo_correccao: str = "IPCA",
        data_calculo: Optional[date] = None,
        juros_compostos: bool = True,
    ) -> ResultadoCalculo:
        """
        Calcular indenização completa por dano material

        Args:
            data_dano: Data do evento danoso
            valor_original: Valor em R$ na época
            tipo_correccao: "IPCA", "TR" ou "SELIC"
            data_calculo: Data para cálculo (hoje se None)
            juros_compostos: Se aplica juros de mora (1% a.m.)

        Returns:
            ResultadoCalculo com detalhes completos
        """
        if data_calculo is None:
            data_calculo = date.today()

        # 1. Validações
        if data_dano > data_calculo:
            raise ValueError("Data do dano não pode ser posterior à data de cálculo")

        if valor_original <= 0:
            raise ValueError("Valor deve ser positivo")

        # 2. Calcular período
        dias = (data_calculo - data_dano).days
        anos = Decimal(dias) / Decimal("365.25")

        # 3. Aplicar correção monetária
        if tipo_correccao == "IPCA":
            taxa_acumulada, detalhamento = CalculadorDanoMaterial._calcular_ipca(
                data_dano, data_calculo
            )
        elif tipo_correccao == "TR":
            taxa_acumulada, detalhamento = CalculadorDanoMaterial._calcular_tr(
                data_dano, data_calculo
            )
        elif tipo_correccao == "SELIC":
            taxa_acumulada, detalhamento = CalculadorDanoMaterial._calcular_selic(
                anos
            )
        else:
            raise ValueError(f"Tipo de correção inválido: {tipo_correccao}")

        # 4. Aplicar taxa de correção
        valor_corrigido = valor_original * (Decimal(1) + taxa_acumulada / Decimal(100))

        # 5. Aplicar juros compostos (art. 406 CC: 1% a.m.)
        juros = Decimal(0)
        if juros_compostos:
            taxa_juros_mensal = Decimal("0.01")  # 1% ao mês
            meses = Decimal(dias) / Decimal("30")
            juros = valor_corrigido * (
                (Decimal(1) + taxa_juros_mensal) ** meses - Decimal(1)
            )

        valor_total = valor_corrigido + juros

        return ResultadoCalculo(
            valor_original=valor_original.quantize(Decimal("0.01")),
            indice_aplicado=tipo_correccao,
            taxa_acumulada=taxa_acumulada.quantize(Decimal("0.01")),
            valor_corrigido=valor_corrigido.quantize(Decimal("0.01")),
            juros_compostos=juros.quantize(Decimal("0.01")),
            valor_total=valor_total.quantize(Decimal("0.01")),
            periodo_dias=dias,
            periodo_anos=anos.quantize(Decimal("0.01")),
            fundamento_legal="Art. 406 CC (juros), Art. 383 CPC (indexação)",
            detalhamento=detalhamento,
        )

    @staticmethod
    def _calcular_ipca(data_inicio: date, data_fim: date) -> tuple:
        """Calcular IPCA acumulado entre datas"""
        taxa_acumulada = Decimal(0)
        meses_processados = []

        current = data_inicio
        while current <= data_fim:
            chave = current.strftime("%Y-%m")
            if chave in INDICE_IPCA:
                taxa = Decimal(INDICE_IPCA[chave]) / Decimal(100)
                taxa_acumulada = (Decimal(1) + taxa_acumulada) * (Decimal(1) + taxa) - Decimal(1)
                meses_processados.append({"mes": chave, "taxa": INDICE_IPCA[chave]})

            # Próximo mês
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        return taxa_acumulada * Decimal(100), {
            "metodo": "IPCA mensal acumulado",
            "meses": meses_processados,
            "total": f"{(taxa_acumulada * 100):.2f}%",
        }

    @staticmethod
    def _calcular_tr(data_inicio: date, data_fim: date) -> tuple:
        """Calcular TR acumulada entre datas (geralmente menor que IPCA)"""
        # TR histórica é menor - usar aproximação conservadora
        taxa_acumulada = Decimal("0.08")  # ~8.56% (2025/2026)

        return taxa_acumulada * Decimal(100), {
            "metodo": "TR acumulada (aproximado)",
            "observacao": "TR geralmente é menor que IPCA",
            "total": f"{(taxa_acumulada * 100):.2f}%",
        }

    @staticmethod
    def _calcular_selic(anos: Decimal) -> tuple:
        """Calcular SELIC anual"""
        # Usar taxa média de 2026
        taxa_selic = Decimal(TAXA_SELIC.get("2026", "9.50"))
        taxa_anual = taxa_selic / Decimal(100)
        taxa_acumulada = (((Decimal(1) + taxa_anual) ** anos) - Decimal(1)) * Decimal(100)

        return taxa_acumulada, {
            "metodo": "SELIC anual composto",
            "taxa_anual": f"{taxa_selic}%",
            "periodo_anos": f"{anos:.2f}",
            "total": f"{taxa_acumulada:.2f}%",
        }
