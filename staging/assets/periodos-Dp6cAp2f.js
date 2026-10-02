import{a as r}from"./index-C3WeDz9B.js";function a(e,o){return r(e,`SELECT
      p.id, p.entidade_id, p.ano, p.mes, p.status, p.data_abertura, p.data_fechamento,
      COALESCE((SELECT SUM(valor_debito) FROM ledger_entries WHERE periodo_id = p.id), 0) AS total_debito,
      COALESCE((SELECT SUM(valor_credito) FROM ledger_entries WHERE periodo_id = p.id), 0) AS total_credito,
      (SELECT COUNT(*) FROM ledger_entries WHERE periodo_id = p.id) AS qtd_lancamentos
     FROM periodos_contabeis p
     WHERE p.entidade_id = ?
     ORDER BY p.ano DESC, p.mes DESC`,[o])}function i(e,o){return r(e,`SELECT id, data_encerramento, encerrado_por, total_debito, total_credito,
              balancete_OK, hash_snapshot, observacoes
       FROM ledger_encerramentos
       WHERE periodo_id = ?
       ORDER BY id DESC
       LIMIT 1`,[o])[0]??null}const d=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];export{d as N,a as l,i as o};
