import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { VistoriaLog } from "../types";

export interface AuditSummary {
  vistoria_id: number;
  total_acoes: number;
  primeira_acao: AcaoComTempo;
  ultima_acao: AcaoComTempo;
  acoes: AcaoComTempo[];
}

export interface AcaoComTempo {
  acao: string;
  criado_em: string;
  usuario_id?: number;
  motivo?: string;
  tempo_desde_anterior?: string; // diferença em formato legível (ex: "2 dias, 3 horas")
}

export function obterAudit(db: Database, vistoria_id: number): AuditSummary {
  const historico = consultar<VistoriaLog>(
    db,
    "SELECT * FROM vistoria_log WHERE vistoria_id = ? ORDER BY criado_em ASC",
    [vistoria_id],
  );

  if (historico.length === 0) {
    throw new Error(`Nenhum registro de auditoria encontrado para vistoria ${vistoria_id}`);
  }

  const acoes: AcaoComTempo[] = historico.map((log, index) => {
    const acao: AcaoComTempo = {
      acao: log.acao,
      criado_em: log.criado_em,
      usuario_id: log.usuario_id,
      motivo: log.motivo,
    };

    if (index > 0) {
      const anterior = new Date(historico[index - 1].criado_em).getTime();
      const atual = new Date(log.criado_em).getTime();
      const diff = Math.floor((atual - anterior) / 1000); // em segundos

      acao.tempo_desde_anterior = formatarDiferenca(diff);
    }

    return acao;
  });

  return {
    vistoria_id,
    total_acoes: historico.length,
    primeira_acao: acoes[0],
    ultima_acao: acoes[acoes.length - 1],
    acoes,
  };
}

export function obterTempoDecorrido(db: Database, vistoria_id: number): {
  criado_em: string;
  tempo_decorrido: string;
  duracao_em_segundos: number;
} {
  const historico = consultar<VistoriaLog>(
    db,
    "SELECT * FROM vistoria_log WHERE vistoria_id = ? ORDER BY criado_em ASC",
    [vistoria_id],
  );

  if (historico.length === 0) {
    throw new Error(`Nenhum registro de auditoria encontrado para vistoria ${vistoria_id}`);
  }

  const primeira = historico[0];
  const ultima = historico[historico.length - 1];
  const primeiraTempo = new Date(primeira.criado_em).getTime();
  const ultimaTempo = new Date(ultima.criado_em).getTime();
  const duracao = Math.floor((ultimaTempo - primeiraTempo) / 1000);

  return {
    criado_em: primeira.criado_em,
    tempo_decorrido: formatarDiferenca(duracao),
    duracao_em_segundos: duracao,
  };
}

function formatarDiferenca(segundos: number): string {
  if (segundos < 60) {
    return `${segundos}s`;
  }

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) {
    return `${minutos}m`;
  }

  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const m = minutos % 60;
    return m > 0 ? `${horas}h ${m}m` : `${horas}h`;
  }

  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  return h > 0 ? `${dias}d ${h}h` : `${dias}d`;
}
