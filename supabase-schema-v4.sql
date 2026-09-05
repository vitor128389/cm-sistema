-- =============================================
-- v4: número de pedido sequencial/imutável, prazo de entrega,
-- status de entrega por item (pra encomendas).
-- =============================================

-- ---------- NÚMERO DE PEDIDO ----------
create sequence if not exists pedido_numero_seq start 1;

alter table vendas add column if not exists numero_pedido bigint;
alter table vendas add column if not exists prazo_entrega_maximo date;

update vendas set numero_pedido = nextval('pedido_numero_seq') where numero_pedido is null;

alter table vendas alter column numero_pedido set default nextval('pedido_numero_seq');
alter table vendas alter column numero_pedido set not null;

create unique index if not exists idx_vendas_numero_pedido on vendas(numero_pedido);

-- trava o número de pedido contra alteração após criado
create or replace function bloquear_alteracao_numero_pedido()
returns trigger as $$
begin
  if new.numero_pedido <> old.numero_pedido then
    raise exception 'numero_pedido não pode ser alterado depois de criado';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bloquear_numero_pedido on vendas;
create trigger trg_bloquear_numero_pedido
  before update on vendas
  for each row execute function bloquear_alteracao_numero_pedido();

-- ---------- STATUS DE ENTREGA POR ITEM (pra encomendas) ----------
alter table venda_itens add column if not exists status_entrega text
  check (status_entrega in ('encomenda','entregue'));
alter table venda_itens add column if not exists data_entregue timestamptz;

update venda_itens set status_entrega = 'encomenda'
  where tipo_entrega = 'encomenda' and status_entrega is null;

create index if not exists idx_venda_itens_status_entrega on venda_itens(status_entrega);
create index if not exists idx_vendas_numero_pedido_busca on vendas(numero_pedido);
