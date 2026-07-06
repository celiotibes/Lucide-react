"""Geração de DRE a partir do razão consolidado.

Agrega transações já categorizadas por plano de contas e período, com corte
opcional por imóvel. O resultado é o que alimenta o fechamento contábil
formal (Domínio/Makro) e, na ponta final, o software de cálculo pericial.
"""
import sqlite3
from dataclasses import dataclass


@dataclass
class LinhaDre:
    codigo: str
    descricao: str
    grupo: str
    total: float


def gerar_dre(
    conexao: sqlite3.Connection,
    data_inicio: str,
    data_fim: str,
    imovel_id: int | None = None,
) -> list[LinhaDre]:
    filtro_imovel = "AND t.imovel_id = ?" if imovel_id is not None else ""
    parametros = [data_inicio, data_fim]
    if imovel_id is not None:
        parametros.append(imovel_id)

    linhas = conexao.execute(
        f"""
        SELECT p.codigo, p.descricao, p.grupo, SUM(t.valor) AS total
        FROM transacoes t
        JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
        WHERE t.data BETWEEN ? AND ?
          AND p.grupo IN ('receita', 'despesa')
          {filtro_imovel}
        GROUP BY p.codigo, p.descricao, p.grupo
        ORDER BY p.grupo, p.codigo
        """,
        parametros,
    ).fetchall()

    return [LinhaDre(codigo, descricao, grupo, total) for codigo, descricao, grupo, total in linhas]


def resultado_liquido(linhas: list[LinhaDre]) -> float:
    receitas = sum(l.total for l in linhas if l.grupo == "receita")
    despesas = sum(l.total for l in linhas if l.grupo == "despesa")
    return receitas + despesas  # despesas já armazenadas como valores negativos


def formatar_texto(linhas: list[LinhaDre]) -> str:
    saida = ["DRE", "=" * 40, "\nRECEITAS"]
    for l in linhas:
        if l.grupo == "receita":
            saida.append(f"  {l.codigo}  {l.descricao:<30} {l.total:>14,.2f}")
    saida.append("\nDESPESAS")
    for l in linhas:
        if l.grupo == "despesa":
            saida.append(f"  {l.codigo}  {l.descricao:<30} {l.total:>14,.2f}")
    saida.append("\n" + "-" * 40)
    saida.append(f"RESULTADO LÍQUIDO: {resultado_liquido(linhas):>20,.2f}")
    return "\n".join(saida)
