/** Entidade legal: o titular da contabilidade (`entidades_legais`).
 *
 * Tudo no razão pende dela — `periodos_contabeis`, `contas_plano_contas`, `centros_custo`
 * e `ledger_entries` têm `entidade_id NOT NULL REFERENCES entidades_legais(id)`. Até
 * agora o app nunca criava essa linha: o plano de contas do razão não podia ser semeado,
 * nenhum período existia e nenhum lançamento podia ser gravado. Era a razão estrutural de
 * os Relatórios Integrados mostrarem R$ 0,00 com o Painel cheio de dados.
 *
 * O CPF/CNPJ não é inventável: é `NOT NULL UNIQUE`, vai para a Exportação ECD e identifica
 * uma pessoa real. Por isso ele é perguntado no onboarding e validado de verdade (dígitos
 * verificadores), em vez de semeado com um valor de fachada. */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { garantirPlanoDeContasErp } from "./planoDeContasErp";
import { migrarTransacoesParaLedger, type MigracaoStatus } from "./migracao-ledger";

export type TipoEntidade = "pessoa_fisica" | "pessoa_juridica";
export type RegimeTributario = "simples_nacional" | "presumido" | "lucro_real";

export interface EntidadeLegal {
  id: number;
  tipo: TipoEntidade;
  cpf_cnpj: string;
  nome: string;
  endereco: string | null;
  regime_tributario: RegimeTributario | null;
}

/** Só os dígitos — o banco guarda sem máscara, para a unicidade valer de fato
 * (`123.456.789-09` e `12345678909` são o mesmo documento e passariam os dois). */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

function digitoVerificadorCpf(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return false;
  // 111.111.111-11 e afins passam na conta dos dígitos verificadores e são inválidos.
  if (/^(\d)\1{10}$/.test(d)) return false;
  return (
    digitoVerificadorCpf(d.slice(0, 9), 10) === Number(d[9]) &&
    digitoVerificadorCpf(d.slice(0, 10), 11) === Number(d[10])
  );
}

function digitoVerificadorCnpj(base: string): number {
  // Pesos 2..9 ciclando da direita para a esquerda.
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  return (
    digitoVerificadorCnpj(d.slice(0, 12)) === Number(d[12]) &&
    digitoVerificadorCnpj(d.slice(0, 13)) === Number(d[13])
  );
}

export interface ValidacaoDocumento {
  valido: boolean;
  normalizado: string;
  tipo: TipoEntidade | null;
  erro: string | null;
}

/** Valida o documento e deduz o tipo da entidade pelo comprimento: 11 dígitos = CPF
 * (pessoa física), 14 = CNPJ (pessoa jurídica). */
export function validarDocumento(valor: string): ValidacaoDocumento {
  const normalizado = somenteDigitos(valor);
  if (normalizado.length === 0) {
    return { valido: false, normalizado, tipo: null, erro: "Informe o CPF ou o CNPJ do titular." };
  }
  if (normalizado.length === 11) {
    return cpfValido(normalizado)
      ? { valido: true, normalizado, tipo: "pessoa_fisica", erro: null }
      : { valido: false, normalizado, tipo: "pessoa_fisica", erro: "CPF inválido — confira os dígitos." };
  }
  if (normalizado.length === 14) {
    return cnpjValido(normalizado)
      ? { valido: true, normalizado, tipo: "pessoa_juridica", erro: null }
      : { valido: false, normalizado, tipo: "pessoa_juridica", erro: "CNPJ inválido — confira os dígitos." };
  }
  return {
    valido: false,
    normalizado,
    tipo: null,
    erro: `Um CPF tem 11 dígitos e um CNPJ tem 14; foram informados ${normalizado.length}.`,
  };
}

/** Formata para exibição. Não é o que vai para o banco. */
export function formatarDocumento(valor: string): string {
  const d = somenteDigitos(valor);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return valor;
}

/** A entidade titular da contabilidade, ou null se o onboarding ainda não rodou.
 * O app é monoentidade hoje: a primeira (menor id) é a ativa. */
export function obterEntidadeAtiva(db: Database): EntidadeLegal | null {
  try {
    return (
      consultar<EntidadeLegal>(
        db,
        `SELECT id, tipo, cpf_cnpj, nome, endereco, regime_tributario
         FROM entidades_legais ORDER BY id ASC LIMIT 1`,
      )[0] ?? null
    );
  } catch {
    return null; // banco antigo sem a tabela — schema.sql a cria na próxima abertura
  }
}

export interface DadosOnboarding {
  nome: string;
  cpf_cnpj: string;
  endereco?: string;
  regime_tributario?: RegimeTributario | null;
}

export interface ResultadoOnboarding {
  sucesso: boolean;
  entidade_id?: number;
  mensagem: string;
  migracao?: MigracaoStatus;
}

/** Cria a entidade legal, semeia o plano de contas do razão e traz para o razão as
 * transações que já estavam no banco.
 *
 * As três coisas juntas são o que "ligar o razão" significa na prática: sem a entidade
 * não há a quem pendurar as contas; sem as contas não há onde lançar; e sem a migração o
 * razão fica vazio mesmo com o extrato inteiro já importado. */
export function criarEntidadeLegal(db: Database, dados: DadosOnboarding): ResultadoOnboarding {
  const nome = dados.nome.trim();
  if (nome.length < 2) {
    return { sucesso: false, mensagem: "Informe o nome do titular." };
  }

  const doc = validarDocumento(dados.cpf_cnpj);
  if (!doc.valido || !doc.tipo) {
    return { sucesso: false, mensagem: doc.erro ?? "Documento inválido." };
  }

  const jaExiste = consultar<{ id: number; nome: string }>(
    db,
    "SELECT id, nome FROM entidades_legais WHERE cpf_cnpj = ?",
    [doc.normalizado],
  )[0];
  if (jaExiste) {
    return {
      sucesso: false,
      mensagem: `Já existe uma entidade com este documento: ${jaExiste.nome}.`,
    };
  }

  try {
    executar(
      db,
      `INSERT INTO entidades_legais (tipo, cpf_cnpj, nome, endereco, regime_tributario)
       VALUES (?, ?, ?, ?, ?)`,
      [
        doc.tipo,
        doc.normalizado,
        nome,
        dados.endereco?.trim() || null,
        dados.regime_tributario ?? null,
      ],
    );
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Não foi possível cadastrar a entidade: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }

  const entidade_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0]?.id;
  if (!entidade_id) {
    return { sucesso: false, mensagem: "A entidade foi gravada mas o id não pôde ser lido." };
  }

  garantirPlanoDeContasErp(db, entidade_id);
  const migracao = migrarTransacoesParaLedger(db, entidade_id);

  return {
    sucesso: true,
    entidade_id,
    migracao,
    mensagem: resumirMigracao(migracao),
  };
}

/** Roda a migração para uma entidade já existente — usada depois de cada importação de
 * extrato, quando há transações novas que ainda não chegaram ao razão. */
export function sincronizarRazao(db: Database, entidade_id: number): MigracaoStatus {
  garantirPlanoDeContasErp(db, entidade_id);
  return migrarTransacoesParaLedger(db, entidade_id);
}

/** Frase única para toast/aviso — deliberadamente literal sobre o que ficou pendente. */
export function resumirMigracao(m: MigracaoStatus): string {
  if (m.total_transacoes === 0) return "Razão pronto. Não havia transações para lançar ainda.";

  const partes = [`${m.transacoes_migradas} de ${m.total_transacoes} transações lançadas no razão`];
  if (m.transacoes_ja_migradas > 0) partes.push(`${m.transacoes_ja_migradas} já estavam lá`);
  if (m.transacoes_sem_classificacao > 0) {
    partes.push(`${m.transacoes_sem_classificacao} em classificação pendente (conta 1.9.99)`);
  }
  if (m.transacoes_falhadas > 0) partes.push(`${m.transacoes_falhadas} não puderam ser lançadas`);
  return `${partes.join(" · ")}.`;
}
