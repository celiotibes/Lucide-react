"""Roteador de provedores de IA por custo/tarefa.

Este módulo só especifica a interface de troca de provedor — nenhuma chamada
de API é feita aqui. Antes de usar em produção, implemente `Provedor.chamar`
para cada backend (Ollama local, Gemini, Claude) com as respectivas chaves/URLs.

Regra de roteamento (ver dossiê técnico para justificativa de cada escolha):
  - extracao_ocr        -> gemini_flash   (visão, custo baixo por imagem)
  - categorizacao_lote   -> ollama_local   (gratuito, dado sensível fica local)
  - excecao_ambigua      -> claude_haiku   (raciocínio curto, custo baixo)
  - revisao_fechamento   -> claude_sonnet  (contexto contábil amplo)
  - redacao_laudo        -> claude_opus    (documento final, revisão humana obrigatória)
"""
from dataclasses import dataclass
from enum import Enum
from typing import Protocol


class Tarefa(str, Enum):
    EXTRACAO_OCR = "extracao_ocr"
    CATEGORIZACAO_LOTE = "categorizacao_lote"
    EXCECAO_AMBIGUA = "excecao_ambigua"
    REVISAO_FECHAMENTO = "revisao_fechamento"
    REDACAO_LAUDO = "redacao_laudo"


@dataclass(frozen=True)
class PerfilCusto:
    provedor: str
    custo_relativo: str  # rótulo qualitativo: "gratuito" | "baixo" | "medio" | "alto"
    motivo: str


ROTEAMENTO: dict[Tarefa, PerfilCusto] = {
    Tarefa.EXTRACAO_OCR: PerfilCusto(
        provedor="gemini_flash",
        custo_relativo="baixo",
        motivo="modelo de visão mais barato do mercado por imagem, suficiente para campos estruturados",
    ),
    Tarefa.CATEGORIZACAO_LOTE: PerfilCusto(
        provedor="ollama_local",
        custo_relativo="gratuito",
        motivo="dado sensível permanece local; custo marginal zero por lançamento em lote",
    ),
    Tarefa.EXCECAO_AMBIGUA: PerfilCusto(
        provedor="claude_haiku",
        custo_relativo="baixo",
        motivo="melhor custo-benefício em raciocínio curto quando regra e modelo local não resolvem",
    ),
    Tarefa.REVISAO_FECHAMENTO: PerfilCusto(
        provedor="claude_sonnet",
        custo_relativo="medio",
        motivo="precisa de contexto contábil amplo para achar furos antes do fechamento mensal",
    ),
    Tarefa.REDACAO_LAUDO: PerfilCusto(
        provedor="claude_opus",
        custo_relativo="alto",
        motivo="documento final que vai a juízo; vale o modelo mais forte, com revisão humana obrigatória",
    ),
}


class Provedor(Protocol):
    def chamar(self, prompt: str, **kwargs) -> str: ...


def escolher_provedor(tarefa: Tarefa) -> PerfilCusto:
    return ROTEAMENTO[tarefa]


def executar(tarefa: Tarefa, prompt: str, provedores: dict[str, Provedor], **kwargs) -> str:
    """Ponto único de troca de provedor. Chame assim no pipeline:

        resultado = executar(Tarefa.EXTRACAO_OCR, prompt, provedores={"gemini_flash": MeuClienteGemini()})

    `provedores` é injetado pelo chamador — este módulo nunca guarda chaves de API.
    """
    perfil = escolher_provedor(tarefa)
    provedor = provedores.get(perfil.provedor)
    if provedor is None:
        raise RuntimeError(
            f"Provedor '{perfil.provedor}' não configurado para a tarefa '{tarefa.value}'. "
            f"Implemente e registre um cliente antes de rodar esta etapa do pipeline."
        )
    return provedor.chamar(prompt, **kwargs)
