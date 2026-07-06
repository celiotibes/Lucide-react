"""Conciliação entre recebimentos e contratos de locação.

Para cada contrato ativo, gera as competências esperadas (mês a mês, entre
início e fim de vigência) e tenta casar cada uma com uma transação de
entrada dentro de uma janela de tolerância de valor e data. O que não casa
vira exceção explícita — nunca é descartado.
"""
import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

TOLERANCIA_VALOR = 0.05   # 5% de diferença aceitável (desconto, juro de atraso, etc.)
TOLERANCIA_DIAS = 10      # dias de atraso ainda considerados o mesmo pagamento


@dataclass
class Competencia:
    contrato_id: int
    imovel_id: int
    mes_referencia: date
    valor_esperado: float


@dataclass
class Excecao:
    competencia: Competencia
    motivo: str


def gerar_competencias(conexao: sqlite3.Connection, hoje: date) -> list[Competencia]:
    contratos = conexao.execute(
        """
        SELECT id, imovel_id, valor_referencia, dia_vencimento, data_inicio, data_fim
        FROM contratos_locacao
        WHERE tipo = 'residencial_fixo'
        """
    ).fetchall()

    competencias = []
    for contrato_id, imovel_id, valor, dia_vencimento, data_inicio, data_fim in contratos:
        inicio = date.fromisoformat(data_inicio)
        fim = date.fromisoformat(data_fim) if data_fim else hoje
        mes = inicio.replace(day=1)
        while mes <= fim:
            competencias.append(Competencia(contrato_id, imovel_id, mes, valor))
            mes += relativedelta(months=1)
    return competencias


def conciliar(conexao: sqlite3.Connection, competencias: list[Competencia]) -> list[Excecao]:
    excecoes = []
    for comp in competencias:
        janela_inicio = comp.mes_referencia - timedelta(days=TOLERANCIA_DIAS)
        janela_fim = (comp.mes_referencia + relativedelta(months=1)) + timedelta(days=TOLERANCIA_DIAS)
        valor_min = comp.valor_esperado * (1 - TOLERANCIA_VALOR)
        valor_max = comp.valor_esperado * (1 + TOLERANCIA_VALOR)

        candidata = conexao.execute(
            """
            SELECT id FROM transacoes
            WHERE contrato_id = ?
              AND data BETWEEN ? AND ?
              AND valor BETWEEN ? AND ?
            LIMIT 1
            """,
            (comp.contrato_id, janela_inicio.isoformat(), janela_fim.isoformat(), valor_min, valor_max),
        ).fetchone()

        if candidata is None:
            excecoes.append(Excecao(comp, "sem recebimento correspondente dentro da tolerância (possível atraso, calote ou pagamento por conta diferente)"))
    return excecoes
