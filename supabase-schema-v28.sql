-- v28: função que lista os clientes que fazem aniversário hoje (hora de Brasília) — alimenta o sino do topo.
create or replace function public.aniversariantes_hoje()
returns table (id uuid, nome text, telefone text, data_nascimento date, idade int, loja_id uuid, loja_nome text)
language sql stable security invoker as $$
  select c.id, c.nome, c.telefone, c.data_nascimento,
         (extract(year from (now() at time zone 'America/Bahia'))::int - extract(year from c.data_nascimento)::int) as idade,
         c.loja_id, l.nome as loja_nome
  from public.clientes c left join public.lojas l on l.id = c.loja_id
  where c.data_nascimento is not null
    and to_char(c.data_nascimento, 'MMDD') = to_char(now() at time zone 'America/Bahia', 'MMDD')
  order by l.nome nulls last, c.nome;
$$;
grant execute on function public.aniversariantes_hoje() to authenticated;
