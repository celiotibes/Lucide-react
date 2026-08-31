-- Preset do portfólio real de Florianópolis (docs/40-realidade-multi-comodo-
-- vistorias-cobranca-presets.md), a partir da planilha de 32 unidades em 3
-- endereços. Script OPCIONAL — não roda automaticamente em nenhuma
-- migração; execute manualmente quando quiser popular um banco com esses
-- presets. Idempotente: pode ser rodado mais de uma vez sem duplicar.
--
-- Deliberadamente NÃO inclui: locatário, início/vencimento de contrato,
-- CPF/nome de qualquer pessoa — a planilha de origem já não tinha esses
-- campos preenchidos, e criar um `contrato`/`pessoa` fictício aqui
-- fabricaria uma relação contratual que não existe. Cadastro de inquilinos
-- reais continua fora do repositório, mesmo tratamento dado aos dados
-- reais dos contratos de Curitiba (docs/33) e às credenciais do Growatt
-- (docs/09).
--
-- `comodos.valor_aluguel_referencia` fica deliberadamente NULL — a planilha
-- só tem o valor da unidade inteira, não a quebra por quarto, e estimar
-- dividindo por número de quartos seria inventar um dado que pode não
-- bater com o valor real (o Apto 6 MS já tem valor real conhecido e
-- diferente entre os dois quartos — Quarto 1 é R$ 1.269,00 segundo o
-- contrato assinado, docs/39). Preencha manualmente quando o valor real
-- por quarto de cada unidade for confirmado.
--
-- Regra aplicada (docs/40): toda unidade de 2+ quartos recebe
-- `permite_coliving = true` e um `comodo` por quarto — nunca o contrário
-- (uma unidade de 1 quarto não tem com o que fazer coliving).

do $$
declare
  v_cidade_id uuid;
begin
  select id into v_cidade_id from cidades where nome = 'Florianópolis' limit 1;
  if v_cidade_id is null then
    raise exception 'Cidade "Florianópolis" não encontrada — cadastre-a antes de rodar este seed';
  end if;

  insert into residenciais (nome, cidade_id, endereco)
  select 'Servidão Prof. João Carlos Pottker 25', v_cidade_id, 'Servidão Prof. João Carlos Pottker, 25 - Carvoeira, Florianópolis - SC'
  where not exists (select 1 from residenciais where nome = 'Servidão Prof. João Carlos Pottker 25' and cidade_id = v_cidade_id);

  insert into residenciais (nome, cidade_id, endereco)
  select 'Residencial Milton Sullivan', v_cidade_id, 'Rua Prof. Milton Sullivan, 142 - Carvoeira, Florianópolis - SC'
  where not exists (select 1 from residenciais where nome = 'Residencial Milton Sullivan' and cidade_id = v_cidade_id);

  insert into residenciais (nome, cidade_id, endereco)
  select 'Residencial Ana Maria Nunes', v_cidade_id, 'Rua Ana Maria Nunes, 214 - Córrego Grande, Florianópolis - SC'
  where not exists (select 1 from residenciais where nome = 'Residencial Ana Maria Nunes' and cidade_id = v_cidade_id);
end $$;

-- ============================================================================
-- Servidão Prof. João Carlos Pottker 25 — 21 unidades, 4 de 2 quartos (14, 16, 17, 18)
-- ============================================================================
do $$
declare
  v_residencial_id uuid;
  v_cidade_id uuid;
  v_imovel_id uuid;
  d record;
begin
  select id into v_cidade_id from cidades where nome = 'Florianópolis' limit 1;
  select id into v_residencial_id from residenciais where nome = 'Servidão Prof. João Carlos Pottker 25' and cidade_id = v_cidade_id;

  for d in
    select * from (values
      ('Kitnet 1', 'kitnet', false, 1, 'disponivel'::text),
      ('Kitnet 2', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 3', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 4', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 5', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 6', 'kitnet', false, 1, 'disponivel'),
      ('Kitnet 7', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 8', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 9', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 10', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 11', 'kitnet', false, 1, 'disponivel'),
      ('Kitnet 12', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 13', 'kitnet', false, 1, 'ocupado'),
      ('Apto 14', 'apartamento', true, 2, 'disponivel'),
      ('Kitnet 15', 'kitnet', false, 1, 'ocupado'),
      ('Apto 16', 'apartamento', true, 2, 'ocupado'),
      ('Apto 17', 'apartamento', true, 2, 'disponivel'),
      ('Apto 18', 'apartamento', true, 2, 'disponivel'),
      ('Kitnet 19', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 20', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 21', 'kitnet', false, 1, 'ocupado')
    ) as t(identificacao, tipo, permite_coliving, quartos, status)
  loop
    if not exists (select 1 from imoveis where residencial_id = v_residencial_id and identificacao = d.identificacao) then
      insert into imoveis (residencial_id, cidade_id, identificacao, tipo, permite_coliving, status, endereco)
      values (v_residencial_id, v_cidade_id, d.identificacao, d.tipo, d.permite_coliving, d.status,
              'Servidão Prof. João Carlos Pottker, 25 - Carvoeira, Florianópolis - SC')
      returning id into v_imovel_id;

      if d.quartos = 2 then
        insert into comodos (imovel_id, identificacao) values
          (v_imovel_id, 'Quarto 1'), (v_imovel_id, 'Quarto 2')
        on conflict (imovel_id, identificacao) do nothing;
      end if;
    end if;
  end loop;
end $$;

-- ============================================================================
-- Rua Prof. Milton Sullivan 142 — 6 unidades, todas de 2 quartos
-- ============================================================================
do $$
declare
  v_residencial_id uuid;
  v_cidade_id uuid;
  v_imovel_id uuid;
  d record;
begin
  select id into v_cidade_id from cidades where nome = 'Florianópolis' limit 1;
  select id into v_residencial_id from residenciais where nome = 'Residencial Milton Sullivan' and cidade_id = v_cidade_id;

  for d in
    select * from (values
      ('Apto 1 MS', 'disponivel'::text),
      ('Apto 2 MS', 'ocupado'),
      ('Apto 3 MS', 'ocupado'),
      ('Apto 4 MS', 'ocupado'),
      ('Apto 5 MS', 'ocupado'),
      ('Apto 6 MS', 'ocupado')
    ) as t(identificacao, status)
  loop
    if not exists (select 1 from imoveis where residencial_id = v_residencial_id and identificacao = d.identificacao) then
      insert into imoveis (residencial_id, cidade_id, identificacao, tipo, permite_coliving, status, endereco)
      values (v_residencial_id, v_cidade_id, d.identificacao, 'apartamento', true, d.status,
              'Rua Prof. Milton Sullivan, 142 - Carvoeira, Florianópolis - SC')
      returning id into v_imovel_id;

      insert into comodos (imovel_id, identificacao) values
        (v_imovel_id, 'Quarto 1'), (v_imovel_id, 'Quarto 2')
      on conflict (imovel_id, identificacao) do nothing;
    end if;
  end loop;
end $$;

-- ============================================================================
-- Rua Ana Maria Nunes 214 — 5 unidades, 3 candidatas a coliving (1 de 3 quartos, 2 de 2 quartos)
-- ============================================================================
do $$
declare
  v_residencial_id uuid;
  v_cidade_id uuid;
  v_imovel_id uuid;
  d record;
begin
  select id into v_cidade_id from cidades where nome = 'Florianópolis' limit 1;
  select id into v_residencial_id from residenciais where nome = 'Residencial Ana Maria Nunes' and cidade_id = v_cidade_id;

  for d in
    select * from (values
      ('Apto 1 AM', 'apartamento', true, 3, 'disponivel'::text),
      ('Apto 2 AM', 'apartamento', true, 2, 'ocupado'),
      ('Kitnet 3 AM', 'kitnet', false, 1, 'ocupado'),
      ('Kitnet 4 AM', 'kitnet', false, 1, 'ocupado'),
      ('Apto 5 AM', 'apartamento', true, 2, 'ocupado')
    ) as t(identificacao, tipo, permite_coliving, quartos, status)
  loop
    if not exists (select 1 from imoveis where residencial_id = v_residencial_id and identificacao = d.identificacao) then
      insert into imoveis (residencial_id, cidade_id, identificacao, tipo, permite_coliving, status, endereco)
      values (v_residencial_id, v_cidade_id, d.identificacao, d.tipo, d.permite_coliving, d.status,
              'Rua Ana Maria Nunes, 214 - Córrego Grande, Florianópolis - SC')
      returning id into v_imovel_id;

      if d.quartos = 2 then
        insert into comodos (imovel_id, identificacao) values
          (v_imovel_id, 'Quarto 1'), (v_imovel_id, 'Quarto 2')
        on conflict (imovel_id, identificacao) do nothing;
      elsif d.quartos = 3 then
        insert into comodos (imovel_id, identificacao) values
          (v_imovel_id, 'Quarto 1'), (v_imovel_id, 'Quarto 2'), (v_imovel_id, 'Quarto 3')
        on conflict (imovel_id, identificacao) do nothing;
      end if;
    end if;
  end loop;
end $$;
