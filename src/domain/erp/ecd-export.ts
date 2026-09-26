/**
 * ECD Export (Escrituração Contábil Digital)
 * Exportação de dados contábeis em formato ECD/ECF para compliance fiscal
 * Baseado em padrões SPED (Sistema Público de Escrituração Digital) do Brasil
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface RegistroECDBloco0 {
  tipo_registro: "0000";
  tipo_escrituracao: "1" | "2"; // 1=Livro Diário, 2=Livro Razão
  nome_contribuinte: string;
  cnpj: string;
  mes_ano_competencia: string; // MMAAAA
  data_inicio_periodo: string; // DDMMAAAA
  data_fim_periodo: string; // DDMMAAAA
  nome_contador: string;
  cpf_contador: string;
  assinatura: string;
}

export interface RegistroECDLancamento {
  tipo_registro: "0200";
  data_lancamento: string; // DDMMAAAA
  numero_sequencia: number;
  codigo_conta: string;
  descricao: string;
  valor_debito: number;
  valor_credito: number;
  documento_origem: string;
  numero_documento: string;
}

export interface RegistroECDBloco9 {
  tipo_registro: "9999";
  numero_linhas: number;
  hash_arquivo: string;
}

export interface RelatorioECD {
  periodo: string;
  data_geracao: string;
  cnpj_contribuinte: string;
  nome_contribuinte: string;
  total_lancamentos: number;
  total_debitos: number;
  total_creditos: number;
  balanceado: boolean;
  registros: (RegistroECDBloco0 | RegistroECDLancamento | RegistroECDBloco9)[];
  avisos: string[];
}

export function gerarExportacaoECD(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  nomeContador: string = "Contador Responsável",
  cpfContador: string = "000.000.000-00"
): RelatorioECD {
  // Obter dados da entidade
  const [entidade] = consultar<{ nome: string; cnpj: string }>(
    db,
    // A tabela é entidades_legais e a coluna é cpf_cnpj (ver schema.sql). "entidades" e
    // "cnpj" não existem no banco do app: a exportação ECD derrubava a tela com
    // "no such table: entidades" antes de gerar qualquer linha.
    "SELECT nome, cpf_cnpj AS cnpj FROM entidades_legais WHERE id = ?",
    [entidade_id],
  );

  const nomeEntidade = entidade?.nome || "Entidade Desconhecida";
  const cnpjEntidade = entidade?.cnpj || "00.000.000/0000-00";

  // Obter período contábil
  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    "SELECT ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  if (!periodo) {
    return {
      periodo: "N/A",
      data_geracao: new Date().toISOString().slice(0, 10),
      cnpj_contribuinte: cnpjEntidade,
      nome_contribuinte: nomeEntidade,
      total_lancamentos: 0,
      total_debitos: 0,
      total_creditos: 0,
      balanceado: false,
      registros: [],
      avisos: ["Período contábil não encontrado"],
    };
  }

  const registros: (RegistroECDBloco0 | RegistroECDLancamento | RegistroECDBloco9)[] = [];
  const avisos: string[] = [];

  // Registro de cabeçalho (Bloco 0000)
  const mesAnoCompetencia = String(periodo.mes).padStart(2, "0") + String(periodo.ano);
  const dataMesInicio = "01" + mesAnoCompetencia;
  const datasMesUltimoDia = new Date(periodo.ano, periodo.mes, 0).getDate();
  const dataMesFim = String(datasMesUltimoDia).padStart(2, "0") + mesAnoCompetencia;

  const registroBlocoInicio: RegistroECDBloco0 = {
    tipo_registro: "0000",
    tipo_escrituracao: "1",
    nome_contribuinte: nomeEntidade,
    cnpj: cnpjEntidade,
    mes_ano_competencia: mesAnoCompetencia,
    data_inicio_periodo: dataMesInicio,
    data_fim_periodo: dataMesFim,
    nome_contador: nomeContador,
    cpf_contador: cpfContador,
    assinatura: "ASSINATURA_DIGITAL",
  };

  registros.push(registroBlocoInicio);

  // Obter todas as contas e seus lançamentos
  // consultar() devolve um array de linhas (uma por conta distinta), não uma linha só —
  // `const [contas] = consultar(...)` pegava a PRIMEIRA conta e a nomeava (no singular
  // sob nome plural) como se fosse a lista inteira; `Array.isArray(contas)` então era
  // sempre falso (era um objeto {id, codigo, descricao}, não array) e o laço abaixo nunca
  // rodava — a exportação ECD saía sempre sem nenhum lançamento, em silêncio.
  const contas = consultar<{
    id: number;
    codigo: string;
    descricao: string;
  }>(
    db,
    `SELECT DISTINCT cp.id, cp.codigo, cp.descricao
     FROM contas_plano_contas cp
     INNER JOIN ledger_entries le ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
     ORDER BY cp.codigo`,
    [entidade_id, periodo_id],
  );

  let numeroSequencia = 1;
  let totalDebitos = 0;
  let totalCreditos = 0;
  const lancamentosArray: RegistroECDLancamento[] = [];

  if (contas && Array.isArray(contas)) {
    for (const conta of contas) {
      // Obter lançamentos da conta — mesmo caso: várias linhas por conta, não uma só.
      const lancamentos = consultar<{
        id: number;
        data_lancamento: string;
        descricao: string;
        valor_debito: number;
        valor_credito: number;
      }>(
        db,
        `SELECT id, data_lancamento, descricao, valor_debito, valor_credito
         FROM ledger_entries
         WHERE entidade_id = ? AND periodo_id = ? AND conta_id = ?
         ORDER BY data_lancamento, id`,
        [entidade_id, periodo_id, conta.id],
      );

      if (lancamentos && Array.isArray(lancamentos)) {
        for (const lancamento of lancamentos) {
          const dataFormatada =
            lancamento.data_lancamento && lancamento.data_lancamento.includes("-")
              ? lancamento.data_lancamento.split("-").reverse().join("")
              : "01" + mesAnoCompetencia;

          const registroLancamento: RegistroECDLancamento = {
            tipo_registro: "0200",
            data_lancamento: dataFormatada,
            numero_sequencia: numeroSequencia++,
            codigo_conta: conta.codigo,
            descricao: lancamento.descricao || conta.descricao || "Lançamento",
            valor_debito: lancamento.valor_debito || 0,
            valor_credito: lancamento.valor_credito || 0,
            documento_origem: "MANUAL",
            numero_documento: String(lancamento.id),
          };

          lancamentosArray.push(registroLancamento);
          totalDebitos += registroLancamento.valor_debito;
          totalCreditos += registroLancamento.valor_credito;
        }
      }
    }
  }

  registros.push(...lancamentosArray);

  // Validação de balanceamento
  const diferenca = Math.abs(totalDebitos - totalCreditos);
  const balanceado = diferenca < 0.01; // Permitir margem de arredondamento

  if (!balanceado) {
    avisos.push(
      `⚠️ Diário não balanceado: diferença de ${Math.abs(totalDebitos - totalCreditos).toFixed(2)}`
    );
    avisos.push(
      `Total Débitos: ${totalDebitos.toFixed(2)} | Total Créditos: ${totalCreditos.toFixed(2)}`
    );
  }

  // Registro de encerramento (Bloco 9999)
  const registroEncerramento: RegistroECDBloco9 = {
    tipo_registro: "9999",
    numero_linhas: registros.length + 1,
    hash_arquivo: gerarHashArquivo(registros),
  };

  registros.push(registroEncerramento);

  return {
    periodo: `${periodo.ano}/${String(periodo.mes).padStart(2, "0")}`,
    data_geracao: new Date().toISOString().slice(0, 10),
    cnpj_contribuinte: cnpjEntidade,
    nome_contribuinte: nomeEntidade,
    total_lancamentos: lancamentosArray.length,
    total_debitos: totalDebitos,
    total_creditos: totalCreditos,
    balanceado,
    registros,
    avisos,
  };
}

function gerarHashArquivo(registros: any[]): string {
  // Simular hash SHA-256 (em produção, usar biblioteca crypto)
  // Para ECD, usamos um hash simplificado baseado no conteúdo
  let hash = 0;
  const conteudo = JSON.stringify(registros);

  for (let i = 0; i < conteudo.length; i++) {
    const char = conteudo.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Converter para 32-bit integer
  }

  return Math.abs(hash).toString(16).padStart(64, "0").slice(0, 64);
}

export function exportarECDComoCsv(relatorio: RelatorioECD): string {
  const linhas: string[] = [];

  // Cabeçalho
  linhas.push("# ECD - Escrituração Contábil Digital");
  linhas.push(`# Período: ${relatorio.periodo}`);
  linhas.push(`# Contribuinte: ${relatorio.nome_contribuinte} (${relatorio.cnpj_contribuinte})`);
  linhas.push(`# Data de Geração: ${relatorio.data_geracao}`);
  linhas.push(`# Lançamentos: ${relatorio.total_lancamentos}`);
  linhas.push(`# Totais: Débitos R$ ${relatorio.total_debitos.toFixed(2)} | Créditos R$ ${relatorio.total_creditos.toFixed(2)}`);
  linhas.push(`# Balanceado: ${relatorio.balanceado ? "Sim" : "Não"}`);
  linhas.push("");

  if (relatorio.avisos.length > 0) {
    linhas.push("# AVISOS:");
    for (const aviso of relatorio.avisos) {
      linhas.push(`# ${aviso}`);
    }
    linhas.push("");
  }

  // Dados dos registros
  linhas.push("TipoRegistro,Data,Sequencia,Conta,Descricao,Debito,Credito,Documento");

  for (const registro of relatorio.registros) {
    if (registro.tipo_registro === "0200") {
      const lancamento = registro as RegistroECDLancamento;
      const debito = lancamento.valor_debito > 0 ? lancamento.valor_debito.toFixed(2) : "";
      const credito = lancamento.valor_credito > 0 ? lancamento.valor_credito.toFixed(2) : "";

      linhas.push(
        `${lancamento.tipo_registro},${lancamento.data_lancamento},${lancamento.numero_sequencia},${lancamento.codigo_conta},"${lancamento.descricao}",${debito},${credito},${lancamento.numero_documento}`
      );
    }
  }

  return linhas.join("\n");
}

export function exportarECDComoTxt(relatorio: RelatorioECD): string {
  const linhas: string[] = [];

  // Formato SPED (padrão Brasil)
  for (const registro of relatorio.registros) {
    if (registro.tipo_registro === "0000") {
      const bloco = registro as RegistroECDBloco0;
      linhas.push(
        `|${bloco.tipo_registro}|${bloco.tipo_escrituracao}|${bloco.nome_contribuinte}|${bloco.cnpj}|` +
        `${bloco.mes_ano_competencia}|${bloco.data_inicio_periodo}|${bloco.data_fim_periodo}|` +
        `${bloco.nome_contador}|${bloco.cpf_contador}|${bloco.assinatura}|`
      );
    } else if (registro.tipo_registro === "0200") {
      const lancamento = registro as RegistroECDLancamento;
      linhas.push(
        `|${lancamento.tipo_registro}|${lancamento.data_lancamento}|${lancamento.numero_sequencia}|` +
        `${lancamento.codigo_conta}|${lancamento.descricao}|${lancamento.valor_debito}|${lancamento.valor_credito}|` +
        `${lancamento.documento_origem}|${lancamento.numero_documento}|`
      );
    } else if (registro.tipo_registro === "9999") {
      const encerramento = registro as RegistroECDBloco9;
      linhas.push(
        `|${encerramento.tipo_registro}|${encerramento.numero_linhas}|${encerramento.hash_arquivo}|`
      );
    }
  }

  return linhas.join("\n");
}
