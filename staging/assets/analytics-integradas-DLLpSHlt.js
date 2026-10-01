import{a as t}from"./index-GvobYiIN.js";function N(a,l,i){const[n]=t(a,`SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.grupo = 'receita'`,[l,i]),[e]=t(a,`SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.grupo = 'despesa'`,[l,i]),o=n?.total||0,E=e?.total||0,r=o-E,s=o>0?r/o*100:0,[c]=t(a,`SELECT COALESCE(SUM(
      CASE WHEN cp.natureza = 'debito' THEN le.valor_debito
           ELSE le.valor_credito END), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo IN ('1.2.05')`,[l,i]),_=c?.total?r/c.total*100:0,[d]=t(a,`SELECT COALESCE(SUM(valor_referencia), 0) as valor FROM contratos_locacao
     WHERE data_fim IS NULL OR data_fim >= DATE('now')`,[]),S=(d?.valor||0)>0?0/(d?.valor||0)*100:0,[p]=t(a,"SELECT ano, mes FROM periodos_contabeis WHERE id = ?",[i]);return{periodo:`${p?.ano}/${String(p?.mes||1).padStart(2,"0")}`,receita_total:o,despesa_total:E,resultado_liquido:r,margem_operacional:s,roi_patrimonio:_,taxa_inadimplencia:S}}function v(a,l,i,n){const e=N(a,l,i),o=N(a,l,n),E=o.receita_total>0?(e.receita_total-o.receita_total)/o.receita_total*100:0,r=o.despesa_total>0?(e.despesa_total-o.despesa_total)/o.despesa_total*100:0,s=o.resultado_liquido!==0?(e.resultado_liquido-o.resultado_liquido)/Math.abs(o.resultado_liquido)*100:0;let c="estavel";return s>5?c="crescente":s<-5&&(c="decrescente"),{periodo_atual:e,periodo_anterior:o,variacao_receita_pct:E,variacao_despesa_pct:r,variacao_lucro_pct:s,tendencia:c}}function C(a){const[l]=t(a,"SELECT COUNT(*) as total FROM imoveis WHERE uso_pessoal = 0 AND financiado = 0",[]),[i]=t(a,`SELECT COUNT(DISTINCT c.imovel_id) as count, COALESCE(SUM(c.valor_referencia), 0) as receita
     FROM contratos_locacao c
     WHERE c.data_fim IS NULL OR c.data_fim >= DATE('now')`,[]),[n]=t(a,`SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cp.codigo = '4.1.01'`,[]),e=l?.total||0,o=i?.count||0,E=e-o,r=e>0?o/e*100:0,s=i?.receita||0,c=n?.total||0,_=s-c;return{total_imoveis:e,imoveis_alugados:o,imoveis_vagos:E,taxa_ocupacao_pct:r,receita_potencial:s,receita_realizada:c,gap_receita:_}}function m(a){const[l]=t(a,`SELECT COALESCE(SUM(i.valor_aquisicao), 0) as valor_total
     FROM imoveis i`,[]),[i]=t(a,`SELECT COALESCE(SUM(
      CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
           ELSE le.valor_debito END), 0) as valor_financiado
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cp.codigo = '3.2.01'`,[]),[n]=t(a,`SELECT COALESCE(SUM(
      CASE WHEN cp.natureza = 'credito' THEN le.valor_credito
           ELSE le.valor_debito END), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE cp.codigo = '5.3.01'`,[]),e=l?.valor_total||0,o=i?.valor_financiado||0,E=e-o,r=n?.total||0,s=e-r,c=e>0?o/e*100:0;return{valor_total_imoveis:e,valor_depreciacao_acumulada:r,valor_liquido_imoveis:s,proporção_financiado_pct:c,valor_financiado:o,valor_proprio:E}}function O(a){return t(a,`SELECT
      i.id as imovel_id,
      i.apelido,
      COALESCE(SUM(CASE WHEN le.origem_modulo = 'contratos' THEN le.valor_credito ELSE 0 END), 0) as receita_mensal,
      COALESCE(SUM(CASE WHEN le.origem_modulo IN ('rateios', 'vistorias') THEN le.valor_debito ELSE 0 END), 0) as despesa_mensal,
      (COALESCE(SUM(CASE WHEN le.origem_modulo = 'contratos' THEN le.valor_credito ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN le.origem_modulo IN ('rateios', 'vistorias') THEN le.valor_debito ELSE 0 END), 0)) as resultado_liquido,
      CASE WHEN i.valor_aquisicao > 0
        THEN (((COALESCE(SUM(CASE WHEN le.origem_modulo = 'contratos' THEN le.valor_credito ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN le.origem_modulo IN ('rateios', 'vistorias') THEN le.valor_debito ELSE 0 END), 0)) / i.valor_aquisicao) * 100)
        ELSE 0 END as taxa_rentabilidade_pct
     FROM imoveis i
     LEFT JOIN ledger_entries le ON i.id = le.origem_id AND le.origem_modulo IN ('contratos', 'rateios', 'vistorias')
     WHERE i.uso_pessoal = 0 AND i.financiado = 0
     GROUP BY i.id
     ORDER BY resultado_liquido DESC`,[])}export{v as a,C as b,N as c,m as d,O as e};
