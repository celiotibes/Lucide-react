import { useCallback, useState } from "react";
import { Monitor, Moon, Rows2, Rows3, Sun } from "lucide-react";

/** Preferências de exibição do usuário — tema e densidade das tabelas.
 *
 * Ambas vivem como atributo no <html> (data-theme / data-density) e são lidas pelo
 * CSS, não passadas por prop: qualquer tela do app herda a escolha sem precisar
 * conhecer este módulo. A leitura inicial acontece no import (antes do primeiro
 * render) pra tela não piscar no tema errado. */

export type Tema = "sistema" | "claro" | "escuro";
export type Densidade = "confortavel" | "compacto";

const CHAVE_TEMA = "crmt:tema";
const CHAVE_DENSIDADE = "crmt:densidade";

/** localStorage lança em aba anônima e com dados de site bloqueados, e o app precisa
 * abrir mesmo assim — em qualquer falha caímos no padrão (tema do SO, densidade
 * confortável) em vez de quebrar a renderização. */
function lerArmazenado(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarArmazenado(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* preferência não persiste entre sessões, mas vale para esta */
  }
}

function temaValido(valor: string | null): Tema {
  return valor === "claro" || valor === "escuro" ? valor : "sistema";
}

function densidadeValida(valor: string | null): Densidade {
  return valor === "compacto" ? valor : "confortavel";
}

function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  // "sistema" tira o atributo de vez: sem data-theme, o @media prefers-color-scheme
  // do index.css volta a mandar.
  if (tema === "sistema") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");
}

function aplicarDensidade(densidade: Densidade): void {
  const raiz = document.documentElement;
  if (densidade === "compacto") raiz.setAttribute("data-density", "compact");
  else raiz.removeAttribute("data-density");
}

const temaInicial = temaValido(lerArmazenado(CHAVE_TEMA));
const densidadeInicial = densidadeValida(lerArmazenado(CHAVE_DENSIDADE));
aplicarTema(temaInicial);
aplicarDensidade(densidadeInicial);

const CICLO_TEMA: Record<Tema, Tema> = { sistema: "claro", claro: "escuro", escuro: "sistema" };
const ROTULO_TEMA: Record<Tema, string> = {
  sistema: "Tema: acompanha o sistema",
  claro: "Tema: claro",
  escuro: "Tema: escuro",
};

/** Alterna entre acompanhar o SO, claro e escuro. Um controle de tema só vale se o
 * usuário puder discordar do SO — quem deixa o notebook em escuro mas confere
 * planilha em claro precisa dessa saída. */
export function SeletorTema() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  const alternar = useCallback(() => {
    setTema((atual) => {
      const proximo = CICLO_TEMA[atual];
      aplicarTema(proximo);
      gravarArmazenado(CHAVE_TEMA, proximo);
      return proximo;
    });
  }, []);

  const Icone = tema === "sistema" ? Monitor : tema === "claro" ? Sun : Moon;

  return (
    <button className="btn icon-only" onClick={alternar} title={`${ROTULO_TEMA[tema]} (clique para alternar)`} aria-label={ROTULO_TEMA[tema]}>
      <Icone size={15} />
    </button>
  );
}

const ROTULO_DENSIDADE: Record<Densidade, string> = {
  confortavel: "Densidade: confortável",
  compacto: "Densidade: compacta",
};

/** Alterna a altura das linhas de tabela em todo o app. Conferência de lançamento
 * pede o máximo de linhas por tela; leitura de um caso pede respiro. */
export function SeletorDensidade() {
  const [densidade, setDensidade] = useState<Densidade>(densidadeInicial);

  const alternar = useCallback(() => {
    setDensidade((atual) => {
      const proxima: Densidade = atual === "compacto" ? "confortavel" : "compacto";
      aplicarDensidade(proxima);
      gravarArmazenado(CHAVE_DENSIDADE, proxima);
      return proxima;
    });
  }, []);

  const Icone = densidade === "compacto" ? Rows3 : Rows2;

  return (
    <button
      className="btn icon-only"
      onClick={alternar}
      title={`${ROTULO_DENSIDADE[densidade]} (clique para alternar)`}
      aria-label={ROTULO_DENSIDADE[densidade]}
    >
      <Icone size={15} />
    </button>
  );
}
