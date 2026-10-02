import{a as s}from"./index-C3WeDz9B.js";function J(e,a,c){const t=L=>{const[R]=s(e,`SELECT COALESCE(SUM(le.valor_credito), 0) - COALESCE(SUM(le.valor_debito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?
         AND le.referencia_documento NOT LIKE 'ENCERRAMENTO-%'`,[a,c,L]);return R?.total||0},o=L=>{const[R]=s(e,`SELECT COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo LIKE ?
         AND le.referencia_documento NOT LIKE 'ENCERRAMENTO-%'`,[a,c,L]);return R?.total||0},i=t("4.1.01"),d=t("4.1.02"),l=t("4.1.03"),r=t("4.2.01"),p=t("4.3.01"),_=i+d+l+r+p,N=o("5.2.10"),u=o("5.2.07"),C=o("5.2.06"),n=o("5.2.12"),E=o("5.2.05"),O=o("5.2.11"),v=o("5.2.13"),g=o("5.3.01"),I=N+u+C+n+E+O+v+g,D=_-I,A=o("5.5.01"),S=0,m=t("4.2.01"),M=t("4.3.01"),T=o("6.4.01"),H=D-A-S-T;return{receitas:{aluguel:i,reajustes:d,rateios:l,juros:r,outras_receitas:p,total_receitas:_},custos:{condominio:N,agua_esgoto:u,eletricidade:C,internet:n,manutencao:E,limpeza:O,seguros:v,depreciacao:g,total_custos:I},resultado_operacional:D,juros_e_multas:{despesa_juros_financiamento:A,despesa_juros_mora:S,receita_juros:m,receita_multa:M,resultado_juros:m+M-A-S},provisoes:{provisao_devedora:T},resultado_final:H}}function f(e,a,c){const t=`
       le.periodo_id IN (
         SELECT pc2.id FROM periodos_contabeis pc2
         INNER JOIN periodos_contabeis pc_alvo ON pc_alvo.id = ?
         WHERE pc2.entidade_id = pc_alvo.entidade_id
           AND (pc2.ano < pc_alvo.ano OR (pc2.ano = pc_alvo.ano AND pc2.mes <= pc_alvo.mes))
       )`,o=n=>{const[E]=s(e,`SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'debito' THEN COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)
             ELSE COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${t} AND cp.codigo LIKE ? AND cp.grupo = 'ativo'`,[a,c,n]);return E?.total||0},i=n=>{const[E]=s(e,`SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0)
             ELSE COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${t} AND cp.codigo LIKE ? AND cp.grupo = 'passivo'`,[a,c,n]);return E?.total||0},d=n=>{const[E]=s(e,`SELECT COALESCE(SUM(
        CASE WHEN cp.natureza = 'credito' THEN COALESCE(le.valor_credito, 0) - COALESCE(le.valor_debito, 0)
             ELSE COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0) END), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       WHERE le.entidade_id = ? AND ${t} AND cp.codigo LIKE ? AND cp.grupo = 'patrimonio_liquido'`,[a,c,n]);return E?.total||0},l=o("1.1%"),r=o("1.2%")+o("1.9%"),p=l+r,_=i("3.1%"),N=i("3.2%")+i("3.3%"),u=_+N,C=d("2.%");return{ativo:{circulante_total:l,nao_circulante_total:r,total_ativo:p},passivo:{circulante_total:_,nao_circulante_total:N,total_passivo:u},patrimonio_liquido:C}}function F(e,a,c){let t=0;const[o]=s(e,"SELECT ano, mes FROM periodos_contabeis WHERE id = ?",[c]);if(o){const[O]=s(e,`SELECT COALESCE(SUM(COALESCE(le.valor_debito, 0) - COALESCE(le.valor_credito, 0)), 0) as total
       FROM ledger_entries le
       INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
       INNER JOIN periodos_contabeis pc ON le.periodo_id = pc.id
       WHERE le.entidade_id = ? AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')
         AND pc.entidade_id = ? AND (pc.ano < ? OR (pc.ano = ? AND pc.mes < ?))`,[a,a,o.ano,o.ano,o.mes]);t=O?.total||0}const[i]=s(e,`SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
       AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`,[a,c]),[d]=s(e,`SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
       AND cp.codigo IN ('1.1.01', '1.1.02', '1.1.03')`,[a,c]),[l]=s(e,`SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo = '1.2.05'`,[a,c]),[r]=s(e,`SELECT COALESCE(SUM(le.valor_credito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo = '3.2.01'`,[a,c]),[p]=s(e,`SELECT COALESCE(SUM(le.valor_debito), 0) as total
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ? AND cp.codigo = '3.2.01'`,[a,c]),_=i?.total||0,N=d?.total||0,u=_-N,C=-(l?.total||0),n=(r?.total||0)-(p?.total||0),E=t+u+C+n;return{saldo_inicial:t,operacional:{entradas:_,saidas:N,liquido:u},investimento:{aquisicoes:l?.total||0,liquido:C},financiamento:{emprestimos:r?.total||0,amortizacoes:p?.total||0,liquido:n},saldo_final:E}}function U(e,a,c){const t=J(e,a,c),o=f(e,a,c),i=F(e,a,c),d=t.resultado_final,l=t.receitas.total_receitas,r=l>0?d/l*100:0;return{dre:t,balanço:o,fluxo_caixa:i,resultado_liquido:d,margem_operacional:r}}export{J as a,f as b,U as g};
