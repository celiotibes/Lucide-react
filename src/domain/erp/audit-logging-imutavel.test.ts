import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { GerenciadorAuditLoggingImutavel, TipoOperacao } from "./audit-logging-imutavel";

/**
 * Prova de persistência real da trilha de auditoria (Painel de Auditoria):
 * `GerenciadorAuditLoggingImutavel.definirBanco(db)` grava cada `registrarAudit` na tabela
 * `auditoria_log` do banco sql.js de verdade (schema real, não um fixture inventado — ver
 * `src/test/fixtureDb.ts`), e `validarIntegridade()` relê do banco (não da memória do
 * processo que escreveu) para confirmar a cadeia ou apontar exatamente onde ela quebrou.
 *
 * Sem o teste de adulteração abaixo, a cadeia de hash seria decorativa: bateria sempre
 * "íntegra" mesmo com o conteúdo alterado por fora, porque nada recalcularia o hash a
 * partir do que está de fato gravado nas colunas.
 */
describe("GerenciadorAuditLoggingImutavel — persistência em auditoria_log", () => {
  it("uma instância nova (simula reload da página) enxerga, via banco, o que outra instância gravou", async () => {
    const db = await criarBancoDeTeste();

    const escritor = new GerenciadorAuditLoggingImutavel();
    escritor.definirBanco(db);

    await escritor.registrarAudit(
      "operador-local",
      "operador@local",
      TipoOperacao.LEITURA,
      "PainelAuditoria",
      "painel-auditoria",
      "Abertura do painel",
      "127.0.0.1",
      "vitest",
      "SUCESSO",
      "teste",
    );
    await escritor.registrarAudit(
      "operador-local",
      "operador@local",
      TipoOperacao.CONFIGURACAO,
      "CadeiaAuditoria",
      "verificacao-integridade",
      "Verificação de integridade da cadeia",
      "127.0.0.1",
      "vitest",
      "SUCESSO",
      "teste",
    );

    // Linhas de verdade na tabela real do schema.
    const linhas = db.exec("SELECT COUNT(*) FROM auditoria_log")[0].values[0][0];
    expect(linhas).toBe(2);

    // Instância nova: nunca recebeu um registrarAudit, só o banco — se ela enxerga os
    // registros, é porque leu de auditoria_log, não de algum estado compartilhado em
    // memória entre instâncias (não existe tal coisa nesta classe).
    const leitor = new GerenciadorAuditLoggingImutavel();
    leitor.definirBanco(db);

    const registros = await leitor.consultarAudit({});
    expect(registros).toHaveLength(2);
    expect(registros.some((r) => r.entidade_descricao === "Abertura do painel")).toBe(true);

    const verificacao = await leitor.validarIntegridade();
    expect(verificacao.integro).toBe(true);
    expect(verificacao.registros_verificados).toBe(2);
    expect(verificacao.registros_corrompidos).toBe(0);
  });

  it("detecta e localiza adulteração: UPDATE direto em valor_novo quebra a verificação exatamente naquele registro", async () => {
    const db = await criarBancoDeTeste();
    const gerenciador = new GerenciadorAuditLoggingImutavel();
    gerenciador.definirBanco(db);

    await gerenciador.registrarAudit(
      "operador-local", "operador@local", TipoOperacao.CRIACAO,
      "BackupExecution", "1", "Backup 1", "127.0.0.1", "vitest", "SUCESSO", "teste",
      undefined, undefined, { checksum_sha256: "aaa" },
    );
    await gerenciador.registrarAudit(
      "operador-local", "operador@local", TipoOperacao.CRIACAO,
      "BackupExecution", "2", "Backup 2", "127.0.0.1", "vitest", "SUCESSO", "teste",
      undefined, undefined, { checksum_sha256: "bbb" },
    );
    await gerenciador.registrarAudit(
      "operador-local", "operador@local", TipoOperacao.CRIACAO,
      "BackupExecution", "3", "Backup 3", "127.0.0.1", "vitest", "SUCESSO", "teste",
      undefined, undefined, { checksum_sha256: "ccc" },
    );

    // Antes de adulterar: uma instância nova, lendo só do banco, confirma que a cadeia
    // está íntegra — prova que a verificação de fato reconstrói a partir do banco (não
    // "herda" um resultado já calculado pela instância que escreveu).
    const leitorAntes = new GerenciadorAuditLoggingImutavel();
    leitorAntes.definirBanco(db);
    const antes = await leitorAntes.validarIntegridade();
    expect(antes.integro).toBe(true);
    expect(antes.registros_corrompidos).toBe(0);

    // Adulteração: UPDATE direto no banco em `valor_novo` do 2º registro (id_entidade
    // original "2"), sem tocar em hash_sha256/hash_anterior/assinatura_digital —
    // exatamente o cenário que uma cadeia de hash meramente decorativa deixaria passar.
    db.run(
      `UPDATE auditoria_log SET valor_novo = ? WHERE descricao_alteracao LIKE '2%'`,
      [JSON.stringify({ checksum_sha256: "ADULTERADO" })],
    );

    const leitorDepois = new GerenciadorAuditLoggingImutavel();
    leitorDepois.definirBanco(db);
    const depois = await leitorDepois.validarIntegridade();

    expect(depois.integro).toBe(false);
    expect(depois.registros_corrompidos).toBe(1);
    // Índice 0-based: o 2º registro gravado é o índice 1 — sem ambiguidade sobre onde a
    // cadeia quebrou.
    expect(depois.primeiro_erro_sequencia).toBe(1);
    expect(depois.detalhes.some((d) => /hash não confere/.test(d))).toBe(true);
  });
});
