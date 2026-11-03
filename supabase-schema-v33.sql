-- Pagamento "Na entrega": o cliente paga uma parte agora e o restante quando receber o produto.
-- Libera a forma "Na entrega" nas tabelas de pagamento (as travas antigas só aceitavam Dinheiro/Pix/Débito/Crédito/Link).
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.venda_pagamentos'::regclass, 'public.vendas'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%forma_pagamento%'
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;

alter table public.venda_pagamentos
  add constraint venda_pagamentos_forma_pagamento_check
  check (forma_pagamento in ('Dinheiro','Pix','Débito','Crédito','Link','Na entrega'));

alter table public.vendas
  add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('Dinheiro','Pix','Débito','Crédito','Link','Dividido'));
