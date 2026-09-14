import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { Vistoria, VistoriaItem, VistoriaLog } from "../types";
import { obterVistoriaOuErro, formatarData, formatarDataHora } from "./utils";

export interface LaudoData {
  vistoria: Vistoria;
  imovel: {
    apelido: string;
    endereco?: string;
    tipo?: string;
  };
  contrato?: {
    locatario: string;
  };
  items: VistoriaItem[];
  historico: VistoriaLog[];
  gerado_em: string;
}

export function gerarDadosLaudo(db: Database, vistoria_id: number): LaudoData {
  const vistoria = obterVistoriaOuErro(db, vistoria_id);

  const [imovel] = consultar<{ apelido: string; endereco?: string; tipo?: string }>(
    db,
    "SELECT apelido, endereco, tipo FROM imoveis WHERE id = ?",
    [vistoria.imovel_id],
  );
  if (!imovel) {
    throw new Error(`Imóvel ${vistoria.imovel_id} não encontrado`);
  }

  let contrato: { locatario: string } | undefined;
  if (vistoria.contrato_id) {
    const result = consultar<{ locatario: string }>(
      db,
      "SELECT locatario FROM contratos_locacao WHERE id = ?",
      [vistoria.contrato_id],
    );
    if (result.length > 0) {
      [contrato] = result;
    }
  }

  const items = consultar<VistoriaItem>(
    db,
    "SELECT * FROM vistoria_item WHERE vistoria_id = ? ORDER BY tipo, criado_em",
    [vistoria_id],
  );

  const historico = consultar<VistoriaLog>(
    db,
    "SELECT * FROM vistoria_log WHERE vistoria_id = ? ORDER BY criado_em ASC",
    [vistoria_id],
  );

  return {
    vistoria,
    imovel,
    contrato,
    items,
    historico,
    gerado_em: new Date().toISOString(),
  };
}

export function registrarGeracaoLaudo(
  db: Database,
  vistoria_id: number,
  nome_arquivo: string,
  hash_sha256: string,
  tamanho_bytes: number,
): void {
  const vistoria = obterVistoriaOuErro(db, vistoria_id);

  const data_emissao = vistoria.data_realizada || formatarData(new Date().toISOString());
  const gerado_em = new Date().toISOString();

  executar(
    db,
    `INSERT INTO documentos_gerados (tipo, nome_arquivo, data_emissao, gerado_em, hash_sha256, tamanho_bytes, imovel_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["laudo_pericial", nome_arquivo, data_emissao, gerado_em, hash_sha256, tamanho_bytes, vistoria.imovel_id],
  );
}

export function obterLaudosGerados(db: Database, vistoria_id: number): Array<{
  id: number;
  nome_arquivo: string;
  data_emissao: string;
  gerado_em: string;
}> {
  const vistoria = obterVistoriaOuErro(db, vistoria_id);

  return consultar<{ id: number; nome_arquivo: string; data_emissao: string; gerado_em: string }>(
    db,
    `SELECT id, nome_arquivo, data_emissao, gerado_em FROM documentos_gerados
     WHERE tipo = 'laudo_pericial' AND imovel_id = ?
     ORDER BY gerado_em DESC`,
    [vistoria.imovel_id],
  );
}

export function formatarLaudoTexto(laudo: LaudoData): string {
  const linhas: string[] = [];

  linhas.push("=".repeat(80));
  linhas.push("LAUDO TÉCNICO DE VISTORIA");
  linhas.push("=".repeat(80));
  linhas.push("");

  linhas.push("INFORMAÇÕES GERAIS");
  linhas.push("-".repeat(80));
  linhas.push(`Imóvel: ${laudo.imovel.apelido}`);
  linhas.push(`Tipo: ${laudo.imovel.tipo || "Não especificado"}`);
  if (laudo.imovel.endereco) {
    linhas.push(`Endereço: ${laudo.imovel.endereco}`);
  }
  linhas.push(`Data Agendada: ${formatarData(laudo.vistoria.data_agendada) || "N/A"}`);
  linhas.push(`Data Realizada: ${formatarData(laudo.vistoria.data_realizada) || "Pendente"}`);
  linhas.push(`Responsável: ${laudo.vistoria.responsavel || "Não definido"}`);
  linhas.push(`Status: ${laudo.vistoria.status}`);
  if (laudo.contrato) {
    linhas.push(`Locatário: ${laudo.contrato.locatario}`);
  }
  linhas.push("");

  if (laudo.items.length > 0) {
    linhas.push("ITENS ENCONTRADOS");
    linhas.push("-".repeat(80));

    const porTipo = laudo.items.reduce(
      (acc, item) => {
        if (!acc[item.tipo]) {
          acc[item.tipo] = [];
        }
        acc[item.tipo].push(item);
        return acc;
      },
      {} as Record<string, VistoriaItem[]>,
    );

    if (porTipo.dano && porTipo.dano.length > 0) {
      linhas.push("\nDanos:");
      porTipo.dano.forEach((item) => {
        const sev = item.severidade || "não informada";
        const valor = item.valor_estimado ? ` (R$ ${item.valor_estimado.toFixed(2)})` : "";
        linhas.push(`  • ${item.descricao} [${sev}]${valor}`);
      });
    }

    if (porTipo.necessidade_reparo && porTipo.necessidade_reparo.length > 0) {
      linhas.push("\nNecessidades de Reparo:");
      porTipo.necessidade_reparo.forEach((item) => {
        const valor = item.valor_estimado ? ` (R$ ${item.valor_estimado.toFixed(2)})` : "";
        linhas.push(`  • ${item.descricao}${valor}`);
      });
    }

    if (porTipo.achado_positivo && porTipo.achado_positivo.length > 0) {
      linhas.push("\nAchados Positivos:");
      porTipo.achado_positivo.forEach((item) => {
        linhas.push(`  ✓ ${item.descricao}`);
      });
    }

    linhas.push("");
  }

  if (laudo.vistoria.valor_estimado !== undefined && laudo.vistoria.valor_estimado > 0) {
    linhas.push("RESUMO FINANCEIRO");
    linhas.push("-".repeat(80));
    linhas.push(`Valor Total Estimado de Danos: R$ ${laudo.vistoria.valor_estimado.toFixed(2)}`);
    linhas.push("");
  }

  if (laudo.vistoria.observacoes) {
    linhas.push("OBSERVAÇÕES");
    linhas.push("-".repeat(80));
    linhas.push(laudo.vistoria.observacoes);
    linhas.push("");
  }

  linhas.push("HISTÓRICO DE AÇÕES");
  linhas.push("-".repeat(80));
  laudo.historico.forEach((log) => {
    const { data, hora } = formatarDataHora(log.criado_em);
    const motivo = log.motivo ? ` — ${log.motivo}` : "";
    linhas.push(`${data} ${hora} - ${log.acao}${motivo}`);
  });

  linhas.push("");
  linhas.push("=".repeat(80));
  const { data: dataGerada, hora: horaGerada } = formatarDataHora(laudo.gerado_em);
  linhas.push(`Laudo gerado em: ${dataGerada} às ${horaGerada}`);
  linhas.push("=".repeat(80));

  return linhas.join("\n");
}
