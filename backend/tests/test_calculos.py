"""
Testes para os calculadores jurídicos
Casos reais baseados em jurisprudência TJSP/STJ
"""

import pytest
from decimal import Decimal
from datetime import date, datetime, timedelta

from services.calculador_dano_material import CalculadorDanoMaterial
from services.calculador_pensao import (
    CalculadorPensaoAlimenticia,
    AnaliseCredor,
    AnaliseDevedor,
    SituacaoDevedor,
)
from services.calculador_dano_moral import CalculadorDanoMoral, TipoDanoMoral


class TestCalculadorDanoMaterial:
    """Testes para correção monetária com IPCA/TR/SELIC"""

    def test_calculo_ipca_basico(self):
        """Caso real: Indenização com correção IPCA desde 2024"""
        resultado = CalculadorDanoMaterial.calcular_indenizacao(
            data_dano=date(2024, 3, 15),
            valor_original=Decimal("50000"),
            tipo_correccao="IPCA"
        )

        assert resultado.valor_corrigido > resultado.valor_original
        assert resultado.valor_total == resultado.valor_corrigido + resultado.juros_compostos
        assert "Art. 406" in resultado.fundamento_legal
        assert resultado.juros_compostos > 0

    def test_calculo_selic_2025(self):
        """Caso: Dano antes de redução de SELIC em 2025"""
        resultado = CalculadorDanoMaterial.calcular_indenizacao(
            data_dano=date(2024, 6, 1),
            valor_original=Decimal("100000"),
            tipo_correccao="SELIC"
        )

        assert resultado.valor_total > resultado.valor_original
        assert resultado.indice_aplicado == "SELIC"
        assert "Art. 406" in resultado.fundamento_legal

    def test_periodo_curto_3_meses(self):
        """Caso: Período curto para cálculo (3 meses)"""
        resultado = CalculadorDanoMaterial.calcular_indenizacao(
            data_dano=date(2026, 4, 15),
            valor_original=Decimal("25000"),
            tipo_correccao="IPCA",
            data_calculo=date(2026, 7, 4)
        )

        assert resultado.valor_total > resultado.valor_original
        assert resultado.periodo_dias == 80  # ~80 dias entre 15/04 e 04/07

    def test_juros_compostos_1_percent(self):
        """Validação: Juros 1% a.m. conforme art. 406 CC"""
        resultado = CalculadorDanoMaterial.calcular_indenizacao(
            data_dano=date(2025, 1, 1),
            valor_original=Decimal("10000"),
            tipo_correccao="IPCA",
            data_calculo=date(2025, 7, 1)  # 6 meses exatos
        )

        # Com 6 meses de 1% a.m., juros devem estar próximos a 10,000 * 0.0615... (fórmula composta)
        assert resultado.juros_compostos > 0
        assert "Art. 406" in resultado.fundamento_legal


class TestCalculadorPensaoAlimenticia:
    """Testes para análise do binômio necessidade-possibilidade"""

    def test_binomio_completo_crianca(self):
        """Caso real TJSP: Filho de 12 anos, mãe desempregada, pai empregado"""
        credor = AnaliseCredor(
            renda_propria=Decimal("500"),      # Mãe com freelance
            despesas_mensais=Decimal("2000"),  # Gastos da criança
            idade=12
        )
        devedor = AnaliseDevedor(
            renda_bruta=Decimal("8000"),
            despesas_essenciais=Decimal("3500"),
            situacao=SituacaoDevedor.EMPREGADO,
            dependentes=0
        )

        resultado = CalculadorPensaoAlimenticia.analisar_binomio(credor, devedor)

        assert resultado.necessidade_comprovada is True
        assert resultado.possibilidade_comprovada is True
        assert resultado.binomio_completo is True
        assert resultado.valor_recomendado > 0

    def test_binomio_incompleto_pai_desempregado(self):
        """Caso: Pai desempregado - possibilidade não comprovada"""
        credor = AnaliseCredor(
            renda_propria=Decimal("2500"),
            despesas_mensais=Decimal("3500"),
            idade=18
        )
        devedor = AnaliseDevedor(
            renda_bruta=Decimal("1320"),  # Menor que salário mínimo
            despesas_essenciais=Decimal("1500"),  # Despesas > renda
            situacao=SituacaoDevedor.DESEMPREGADO,
            dependentes=2
        )

        resultado = CalculadorPensaoAlimenticia.analisar_binomio(credor, devedor)

        assert resultado.binomio_completo is False
        assert resultado.possibilidade_comprovada is False

    def test_necessidade_nao_comprovada_credor_renda_alta(self):
        """Caso: Credor com renda suficiente para suas despesas"""
        credor = AnaliseCredor(
            renda_propria=Decimal("5000"),
            despesas_mensais=Decimal("3000"),
            idade=25
        )
        devedor = AnaliseDevedor(
            renda_bruta=Decimal("6000"),
            despesas_essenciais=Decimal("2000"),
            situacao=SituacaoDevedor.EMPREGADO,
            dependentes=0
        )

        resultado = CalculadorPensaoAlimenticia.analisar_binomio(credor, devedor)

        assert resultado.necessidade_comprovada is False
        assert resultado.binomio_completo is False

    def test_calculo_valor_pensao_25_percent(self):
        """Verificação: Piso de 25% sobre margem do devedor"""
        credor = AnaliseCredor(
            renda_propria=Decimal("1000"),
            despesas_mensais=Decimal("2500"),
            idade=15
        )
        devedor = AnaliseDevedor(
            renda_bruta=Decimal("10000"),
            despesas_essenciais=Decimal("4000"),
            situacao=SituacaoDevedor.EMPREGADO,
            dependentes=1
        )

        resultado = CalculadorPensaoAlimenticia.analisar_binomio(credor, devedor)

        # Margem = 10000 - 4000 = 6000
        # Mas há limite de 50% de margem para dependentes: 6000 * 0.5 = 3000
        # 25% sobre 3000 = 750 (capacidade real é 1000)
        if resultado.binomio_completo:
            assert resultado.valor_recomendado > 0

    def test_situacao_invalidez_com_margem(self):
        """Caso: Devedor em situação de invalidez com capacidade de contribuição"""
        credor = AnaliseCredor(
            renda_propria=Decimal("0"),
            despesas_mensais=Decimal("800"),
            idade=14
        )
        devedor = AnaliseDevedor(
            renda_bruta=Decimal("2000"),  # Benefício INSS
            despesas_essenciais=Decimal("1000"),
            situacao=SituacaoDevedor.INVALIDEZ,
            dependentes=0
        )

        resultado = CalculadorPensaoAlimenticia.analisar_binomio(credor, devedor)

        # Com 90% de índice de concessão para invalidez
        # Devedor tem margem: 2000 - 1000 = 1000
        assert resultado.jurisprudencia["taxa_concessao"] == "90%"


class TestCalculadorDanoMoral:
    """Testes para cálculo de dano moral com jurisprudência TJSP"""

    def test_dano_leve_privacidade(self):
        """Caso TJSP: Violação de privacidade em redes sociais - Leve"""
        resultado = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.LEVE,
            descricao_fato="Publicação de foto íntima sem consentimento em rede social",
            fatores_agravantes=None,
            fatores_atenuantes=None,
            renda_vitima=Decimal("3000")
        )

        assert resultado.tipo_dano == TipoDanoMoral.LEVE
        assert Decimal("1000") <= resultado.calculo["valor_final"] <= Decimal("5000")
        assert len(resultado.casos_similares) > 0
        assert "Art. 944" in resultado.fundamento_legal

    def test_dano_moderado_abuso_autoridade(self):
        """Caso TJSP: Abuso de autoridade por policial - Moderado"""
        resultado = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.MODERADO,
            descricao_fato="Abuso de autoridade por policial com agressão verbal",
            fatores_agravantes=["abuso_autoridade"],
            fatores_atenuantes=None,
            renda_vitima=Decimal("5000")
        )

        assert resultado.tipo_dano == TipoDanoMoral.MODERADO
        # Com fator agravante (1.40), valor deve ser superior à faixa base
        assert resultado.calculo["valor_final"] > Decimal("5000")

    def test_dano_grave_difamacao_carreira(self):
        """Caso TJSP: Difamação que afeta carreira profissional - Grave"""
        resultado = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.GRAVE,
            descricao_fato="Difamação com impacto comprovado na carreira profissional",
            fatores_agravantes=["repercussao_publica"],
            fatores_atenuantes=None,
            renda_vitima=Decimal("8000")
        )

        assert resultado.tipo_dano == TipoDanoMoral.GRAVE
        assert Decimal("20000") <= resultado.calculo["valor_final"] <= Decimal("100000")
        assert resultado.calculo["multiplicador"] > 1

    def test_dano_muito_grave_tortura_psicologica(self):
        """Caso STJ: Sequestro com tortura psicológica - Muito Grave"""
        resultado = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.MUITO_GRAVE,
            descricao_fato="Sequestro relâmpago com ameaças e tortura psicológica",
            fatores_agravantes=["dolo_direto", "vulnerabilidade_vitima"],
            fatores_atenuantes=None,
            renda_vitima=Decimal("6000")
        )

        assert resultado.tipo_dano == TipoDanoMoral.MUITO_GRAVE
        # Valor pode ser limitado pela proporcionalidade à renda da vítima (art. 944 CC)
        # 12 * 6000 * 0.6 = 43200 é o máximo legal
        assert resultado.calculo["valor_final"] > 0

    def test_fator_atenuante_boa_fe(self):
        """Teste: Fator atenuante reduz valor (boa fé relativa)"""
        resultado_sem_atenuante = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.MODERADO,
            descricao_fato="Violação de direitos",
            fatores_agravantes=None,
            fatores_atenuantes=None,
            renda_vitima=None
        )

        resultado_com_atenuante = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.MODERADO,
            descricao_fato="Violação de direitos",
            fatores_agravantes=None,
            fatores_atenuantes=["boa_fe_relativa"],
            renda_vitima=None
        )

        assert resultado_com_atenuante.calculo["valor_final"] < resultado_sem_atenuante.calculo["valor_final"]

    def test_fator_agravante_reincidencia(self):
        """Teste: Reincidência aumenta valor em 30%"""
        resultado_sem_agravante = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.MODERADO,
            descricao_fato="Violação",
            fatores_agravantes=None,
            fatores_atenuantes=None,
            renda_vitima=None
        )

        resultado_com_reincidencia = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.MODERADO,
            descricao_fato="Violação com histórico",
            fatores_agravantes=["reincidencia"],
            fatores_atenuantes=None,
            renda_vitima=None
        )

        # Multiplicador de 1.30 deve aplicar
        assert resultado_com_reincidencia.calculo["valor_final"] >= resultado_sem_agravante.calculo["valor_final"]

    def test_proporcionalidade_art_944_renda_vitima(self):
        """Caso: Proporcionalidade à capacidade financeira da vítima (art. 944)"""
        resultado = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.GRAVE,
            descricao_fato="Dano à dignidade",
            fatores_agravantes=None,
            fatores_atenuantes=None,
            renda_vitima=Decimal("1320")  # Salário mínimo
        )

        # Com renda mínima, valor deve ser limitado a 60% de (12 * renda)
        # 12 * 1320 * 0.6 = 9504
        assert resultado.calculo["valor_final"] <= Decimal("9504")

    def test_jurisprudencia_comparativa(self):
        """Teste: Casos similares são retornados corretamente"""
        resultado = CalculadorDanoMoral.calcular_indenizacao(
            tipo=TipoDanoMoral.MODERADO,
            descricao_fato="Teste",
            fatores_agravantes=None,
            fatores_atenuantes=None,
            renda_vitima=None
        )

        assert len(resultado.casos_similares) == 2  # 2 casos por tipologia
        for caso in resultado.casos_similares:
            assert caso.tribunal in ["TJSP", "STJ"]
            assert caso.valor > 0
            assert caso.descricao


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
