import type { Database } from "sql.js";
import { executar } from "../../db/connection";

/**
 * Popula o banco com dados de exemplo para testar o Portal do Prestador
 * (data de demonstração)
 */
export function gerarDadosApontamentosDemonstracao(db: Database): void {
  const agora = new Date().toISOString();
  const hoje = new Date().toISOString().split("T")[0];
  const ontem = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const anteontem = new Date(Date.now() - 172800000).toISOString().split("T")[0];

  // Garantir que temos prestadores
  const prestadores = [
    { nome: "João Silva", cpf: "123.456.789-00", servico: "Limpeza e manutenção" },
    { nome: "Maria Santos", cpf: "987.654.321-00", servico: "Gestão de Airbnb" },
  ];

  for (const p of prestadores) {
    try {
      executar(db, "INSERT INTO prestadores (nome, cpf_cnpj, servico) VALUES (?, ?, ?)", [p.nome, p.cpf, p.servico]);
    } catch {
      // Prestador já existe
    }
  }

  // Apontamento de hoje (em rascunho)
  try {
    executar(
      db,
      `INSERT INTO apontamentos_diarios
       (prestador_id, data, entrada, saida_intervalo, retorno_intervalo, saida_final, status, observacoes, criado_em, atualizado_em)
       VALUES (1, ?, '08:30:00', '12:00:00', '13:00:00', '17:30:00', 'rascunho', 'Dia normal de trabalho', ?, ?)`,
      [hoje, agora, agora]
    );

    const [apt] = db.exec(
      "SELECT id FROM apontamentos_diarios WHERE prestador_id = 1 AND data = ? ORDER BY id DESC LIMIT 1",
      [hoje]
    );

    if (apt?.values?.[0]) {
      // id é INTEGER PRIMARY KEY (schema.sql) — sempre number, mas db.exec() devolve
      // SqlValue (que também admite Uint8Array), daí a asserção para bater com o
      // parâmetro (string | number | null)[] que executar() espera.
      const aptId = apt.values[0][0] as number;

      // Adicionar atividades ao apontamento de hoje
      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'diaria', 'Limpeza residencial - 8h', 160.00, 0, 160.00, ?)`,
        [aptId, agora]
      );

      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'deslocamento', 'Combustível', 25.00, 0, 25.00, ?)`,
        [aptId, agora]
      );

      // Adicionar ao histórico de horários
      executar(db, `INSERT INTO historico_horarios (apontamento_id, tipo_evento, horario, criado_em) VALUES (?, 'chegada', '08:30:00', ?)`, [aptId, agora]);
      executar(db, `INSERT INTO historico_horarios (apontamento_id, tipo_evento, horario, criado_em) VALUES (?, 'saida_intervalo', '12:00:00', ?)`, [aptId, agora]);
      executar(db, `INSERT INTO historico_horarios (apontamento_id, tipo_evento, horario, criado_em) VALUES (?, 'retorno', '13:00:00', ?)`, [aptId, agora]);
      executar(db, `INSERT INTO historico_horarios (apontamento_id, tipo_evento, horario, criado_em) VALUES (?, 'saida', '17:30:00', ?)`, [aptId, agora]);
    }
  } catch (e) {
    // Apontamento já existe
  }

  // Apontamento de ontem (enviado)
  try {
    executar(
      db,
      `INSERT INTO apontamentos_diarios
       (prestador_id, data, entrada, saida_intervalo, retorno_intervalo, saida_final, status, observacoes, criado_em, atualizado_em)
       VALUES (1, ?, '08:00:00', '12:30:00', '13:30:00', '18:00:00', 'enviado', 'Trabalho em condomínio', ?, ?)`,
      [ontem, agora, agora]
    );

    const [apt] = db.exec(
      "SELECT id FROM apontamentos_diarios WHERE prestador_id = 1 AND data = ? ORDER BY id DESC LIMIT 1",
      [ontem]
    );

    if (apt?.values?.[0]) {
      const aptId = apt.values[0][0] as number; // id é INTEGER PRIMARY KEY (schema.sql)

      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'diaria', 'Limpeza de condomínio - 9.5h', 190.00, 0, 190.00, ?)`,
        [aptId, agora]
      );

      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'urgencia', 'Reparo urgente de vazamento', 80.00, 50, 120.00, ?)`,
        [aptId, agora]
      );
    }
  } catch (e) {
    // Apontamento já existe
  }

  // Apontamento de anteontem (aprovado)
  try {
    executar(
      db,
      `INSERT INTO apontamentos_diarios
       (prestador_id, data, entrada, saida_intervalo, retorno_intervalo, saida_final, status, observacoes, criado_em, atualizado_em)
       VALUES (1, ?, '07:30:00', '12:00:00', '13:00:00', '17:00:00', 'aprovado', 'Trabalho de rotina', ?, ?)`,
      [anteontem, agora, agora]
    );

    const [apt] = db.exec(
      "SELECT id FROM apontamentos_diarios WHERE prestador_id = 1 AND data = ? ORDER BY id DESC LIMIT 1",
      [anteontem]
    );

    if (apt?.values?.[0]) {
      const aptId = apt.values[0][0] as number; // id é INTEGER PRIMARY KEY (schema.sql)

      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'diaria', 'Limpeza residencial - 9h', 180.00, 0, 180.00, ?)`,
        [aptId, agora]
      );

      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'materiais', 'Produtos de limpeza', 35.00, 0, 35.00, ?)`,
        [aptId, agora]
      );
    }
  } catch (e) {
    // Apontamento já existe
  }

  // Apontamento para o segundo prestador (Maria)
  try {
    executar(
      db,
      `INSERT INTO apontamentos_diarios
       (prestador_id, data, entrada, saida_intervalo, retorno_intervalo, saida_final, status, observacoes, criado_em, atualizado_em)
       VALUES (2, ?, '10:00:00', '12:00:00', '13:30:00', '19:00:00', 'enviado', 'Gestão e check-in de hóspede', ?, ?)`,
      [hoje, agora, agora]
    );

    const [apt] = db.exec(
      "SELECT id FROM apontamentos_diarios WHERE prestador_id = 2 AND data = ? ORDER BY id DESC LIMIT 1",
      [hoje]
    );

    if (apt?.values?.[0]) {
      const aptId = apt.values[0][0] as number; // id é INTEGER PRIMARY KEY (schema.sql)

      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'airbnb', 'Gestão de Airbnb - 8h', 240.00, 0, 240.00, ?)`,
        [aptId, agora]
      );

      executar(
        db,
        `INSERT INTO itens_remuneraveis
         (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
         VALUES (?, 'deslocamento', 'Combustível e estacionamento', 40.00, 0, 40.00, ?)`,
        [aptId, agora]
      );
    }
  } catch (e) {
    // Apontamento já existe
  }

  console.log("✓ Dados de demonstração de apontamentos carregados");
}
