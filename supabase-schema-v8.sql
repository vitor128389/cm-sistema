-- =============================================
-- v8: pagamento dividido — uma venda pode ser paga em mais
-- de uma forma (ex: parte no Pix, parte no Crédito).
-- =============================================

-- "vendas.forma_pagamento" passa a aceitar também "Dividido" (quando a
-- venda tem mais de uma forma de pagamento — o detalhe fica em venda_pagamentos)
alter table vendas drop constraint if exists vendas_forma_pagamento_check;
alter table vendas add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('Dinheiro','Pix','Débito','Crédito','Dividido'));

create table if not exists venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  forma_pagamento text not null check (forma_pagamento in ('Dinheiro','Pix','Débito','Crédito')),
  parcelas int not null default 1,
  valor numeric(10,2) not null,
  criado_em timestamptz not null default now()
);

alter table venda_pagamentos enable row level security;

do $$ begin
  execute (select coalesce(string_agg(format('drop policy if exists %I on venda_pagamentos;', policyname), ' '), '') from pg_policies where tablename = 'venda_pagamentos');
end $$;

create policy "acesso_por_loja_venda_pagamentos" on venda_pagamentos for all using (
  exists (
    select 1 from vendas v
    join usuarios u on u.id = auth.uid()
    where v.id = venda_pagamentos.venda_id and (u.funcao = 'admin' or u.loja_id = v.loja_id)
  )
);

create index if not exists idx_venda_pagamentos_venda on venda_pagamentos(venda_id);

-- migra vendas já existentes pra ter uma linha de pagamento cada (retrocompatibilidade
-- com tudo que já foi vendido antes dessa mudança)
insert into venda_pagamentos (venda_id, forma_pagamento, parcelas, valor)
select v.id, v.forma_pagamento, v.parcelas, v.total
from vendas v
where not exists (select 1 from venda_pagamentos vp where vp.venda_id = v.id);
