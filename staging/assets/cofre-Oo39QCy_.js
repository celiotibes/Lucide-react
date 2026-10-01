import{a as l,e as d}from"./index-D8BkbAei.js";async function p(a){const i=a instanceof Uint8Array?a.slice().buffer:a,o=await crypto.subtle.digest("SHA-256",i);return Array.from(new Uint8Array(o)).map(n=>n.toString(16).padStart(2,"0")).join("")}async function T(a){return p(await a.arrayBuffer())}function m(a,i,o){return l(a,"SELECT * FROM lotes_importacao WHERE arquivo_hash_sha256 = ? AND conta_id IS ?",[i,o])[0]??null}function h(a){return{data:/^\d{4}-\d{2}-\d{2}$/.test(a.data)?a.data:null,valor:Number.isFinite(a.valor)?a.valor:null}}function g(a,i,o){const n=m(a,i.arquivo_hash_sha256,i.conta_id);if(n)return{lote_id:n.id,ja_existia:!0,linhas_registradas:0,linhas_malformadas:0,linhas_duplicata_provavel:0};d(a,`INSERT INTO lotes_importacao
       (arquivo_nome, arquivo_hash_sha256, arquivo_bytes, tipo_detectado, conta_id, total_linhas)
     VALUES (?, ?, ?, ?, ?, ?)`,[i.arquivo_nome,i.arquivo_hash_sha256,i.arquivo_bytes,i.tipo_detectado,i.conta_id,o.length]);const s=l(a,"SELECT last_insert_rowid() as id")[0].id;let t=0;o.forEach((e,f)=>{const{data:_,valor:u}=h(e),c=[];_===null&&c.push(`data ("${e.data}")`),u===null&&c.push(`valor ("${e.valor}")`),c.length>0&&t++,d(a,`INSERT INTO importacao_linhas
         (lote_id, linha_numero, data, valor, descricao_original, fitid, status, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,[s,f+1,_,u,e.descricaoOriginal,e.fitid??null,c.length>0?"malformada":"pendente",c.length>0?`Ilegível no arquivo: ${c.join(" e ")}. O resto da linha foi preservado — corrija o campo para poder decidir.`:null])});const r=v(a,s);return{lote_id:s,ja_existia:!1,linhas_registradas:o.length,linhas_malformadas:t,linhas_duplicata_provavel:r}}function v(a,i){const o=l(a,"SELECT conta_id FROM lotes_importacao WHERE id = ?",[i])[0]?.conta_id??null;if(o===null)return 0;const n=l(a,"SELECT id, data, valor, fitid FROM importacao_linhas WHERE lote_id = ? AND status = 'pendente'",[i]);let s=0;for(const t of n){let r,e="";t.fitid&&(r=l(a,"SELECT id, descricao_original FROM transacoes WHERE conta_id = ? AND fitid = ? LIMIT 1",[o,t.fitid])[0],r&&(e=`mesmo identificador do banco (FITID ${t.fitid})`)),r||(r=l(a,`SELECT id, descricao_original FROM transacoes
         WHERE conta_id = ? AND data = ? AND ABS(valor - ?) < 0.005
           AND id NOT IN (
             SELECT duplicata_de_id FROM importacao_linhas
             WHERE lote_id = ? AND duplicata_de_id IS NOT NULL
           )
         LIMIT 1`,[o,t.data,t.valor,i])[0],r&&(e="mesma conta, mesma data e mesmo valor")),r&&(d(a,`UPDATE importacao_linhas
       SET status = 'duplicata_provavel', duplicata_de_id = ?, motivo = ?
       WHERE id = ?`,[r.id,`Possível duplicidade por ${e} — já existe a transação #${r.id} "${r.descricao_original}". Confira antes de aprovar.`,t.id]),s++)}return s}function N(a,i){const o=new Map;if(i.length===0)return o;const n=i.map(()=>"?").join(","),s=l(a,`SELECT l.transacao_id, lo.arquivo_nome, lo.arquivo_hash_sha256,
            l.linha_numero, lo.importado_em, l.decidido_em, l.decidido_por
     FROM importacao_linhas l
     JOIN lotes_importacao lo ON lo.id = l.lote_id
     WHERE l.transacao_id IN (${n})`,i);for(const t of s)o.set(t.transacao_id,t);return o}export{p as a,T as h,N as p,g as r};
