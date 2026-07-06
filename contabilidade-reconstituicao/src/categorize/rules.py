"""Categorização determinística: roda antes de qualquer IA.

Cada regra casa um padrão na descrição bruta do extrato com um código do
plano de contas e, opcionalmente, um contrato/imóvel/prestador. Regras são
carregadas de um CSV editável (`data/regras_categorizacao.csv`) para que
o próprio usuário vá refinando a base sem tocar em código.
"""
import csv
import re
import sqlite3
from dataclasses import dataclass


@dataclass
class Regra:
    padrao: re.Pattern
    plano_conta_codigo: str
    contrato_id: int | None
    imovel_id: int | None
    prestador_id: int | None


def carregar_regras(caminho_csv: str) -> list[Regra]:
    regras = []
    with open(caminho_csv, newline="", encoding="utf-8") as arquivo:
        for linha in csv.DictReader(arquivo):
            regras.append(
                Regra(
                    padrao=re.compile(linha["padrao_regex"], re.IGNORECASE),
                    plano_conta_codigo=linha["plano_conta_codigo"],
                    contrato_id=int(linha["contrato_id"]) if linha.get("contrato_id") else None,
                    imovel_id=int(linha["imovel_id"]) if linha.get("imovel_id") else None,
                    prestador_id=int(linha["prestador_id"]) if linha.get("prestador_id") else None,
                )
            )
    return regras


def aplicar_regras(conexao: sqlite3.Connection, regras: list[Regra]) -> int:
    """Categoriza transações ainda sem plano de contas. Retorna quantas
    foram resolvidas por regra (o resto segue para o router de IA).
    """
    cursor = conexao.cursor()
    pendentes = cursor.execute(
        "SELECT id, descricao_original FROM transacoes WHERE plano_conta_codigo IS NULL"
    ).fetchall()

    resolvidas = 0
    for transacao_id, descricao in pendentes:
        for regra in regras:
            if regra.padrao.search(descricao):
                cursor.execute(
                    """
                    UPDATE transacoes
                    SET plano_conta_codigo = ?, contrato_id = ?, imovel_id = ?, prestador_id = ?,
                        categorizado_por = 'regra'
                    WHERE id = ?
                    """,
                    (regra.plano_conta_codigo, regra.contrato_id, regra.imovel_id, regra.prestador_id, transacao_id),
                )
                resolvidas += 1
                break
    conexao.commit()
    return resolvidas
