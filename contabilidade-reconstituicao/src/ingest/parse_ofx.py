"""Ingestão de extratos OFX/CSV para a tabela `transacoes`.

Cada conta bancária é importada de forma idempotente: o par (conta_id, fitid)
é único, então reimportar o mesmo extrato não duplica lançamentos.
"""
import csv
import sqlite3
from dataclasses import dataclass
from datetime import date

from ofxparse import OfxParser


@dataclass
class TransacaoBruta:
    data: date
    valor: float
    descricao_original: str
    fitid: str


def ler_ofx(caminho: str) -> list[TransacaoBruta]:
    with open(caminho, "rb") as arquivo:
        ofx = OfxParser.parse(arquivo)

    transacoes = []
    for conta in ofx.accounts:
        for lancamento in conta.statement.transactions:
            transacoes.append(
                TransacaoBruta(
                    data=lancamento.date.date(),
                    valor=float(lancamento.amount),
                    descricao_original=lancamento.memo or lancamento.payee or "",
                    fitid=lancamento.id,
                )
            )
    return transacoes


def ler_csv(caminho: str, coluna_data: str, coluna_valor: str, coluna_descricao: str) -> list[TransacaoBruta]:
    """Fallback para bancos que só exportam CSV. `fitid` é sintetizado
    a partir dos próprios campos para manter a deduplicação.
    """
    transacoes = []
    with open(caminho, newline="", encoding="utf-8-sig") as arquivo:
        leitor = csv.DictReader(arquivo)
        for linha in leitor:
            fitid = f"{linha[coluna_data]}|{linha[coluna_valor]}|{linha[coluna_descricao]}"
            transacoes.append(
                TransacaoBruta(
                    data=date.fromisoformat(linha[coluna_data]),
                    valor=float(linha[coluna_valor].replace(",", ".")),
                    descricao_original=linha[coluna_descricao],
                    fitid=fitid,
                )
            )
    return transacoes


def importar(conexao: sqlite3.Connection, conta_id: int, transacoes: list[TransacaoBruta]) -> int:
    """Insere as transações ignorando duplicidades já existentes.
    Retorna a quantidade de linhas efetivamente inseridas.
    """
    cursor = conexao.cursor()
    inseridas = 0
    for transacao in transacoes:
        cursor.execute(
            """
            INSERT OR IGNORE INTO transacoes (conta_id, data, valor, descricao_original, fitid)
            VALUES (?, ?, ?, ?, ?)
            """,
            (conta_id, transacao.data.isoformat(), transacao.valor, transacao.descricao_original, transacao.fitid),
        )
        inseridas += cursor.rowcount
    conexao.commit()
    return inseridas
