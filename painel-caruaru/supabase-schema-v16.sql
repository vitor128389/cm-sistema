-- =============================================
-- v16: forma de recebimento da venda inteira (retirada, entrega
-- ou misto), com controle por item de quanto foi retirado e
-- quanto vai ser entregue — inclusive dividindo a mesma linha
-- (ex: 2 de 4 unidades retiradas, 2 entregues).
-- =============================================

alter table vendas add column if not exists forma_recebimento text
  check (forma_recebimento in ('retirada','entrega','misto'));

-- por item: quantas unidades daquele item são retirada e quantas são entrega
-- (quantidade_retirada + quantidade_entrega deve = venda_itens.quantidade)
alter table venda_itens add column if not exists quantidade_retirada int not null default 0;
alter table venda_itens add column if not exists quantidade_entrega int not null default 0;

-- migra o que já existia: quem tinha "retirada = true" vira 100% retirada,
-- quem não tinha vira 100% entrega (comportamento anterior padrão)
update venda_itens set quantidade_retirada = quantidade, quantidade_entrega = 0
  where retirada = true and quantidade_retirada = 0 and quantidade_entrega = 0;
update venda_itens set quantidade_entrega = quantidade, quantidade_retirada = 0
  where retirada = false and quantidade_retirada = 0 and quantidade_entrega = 0;

update vendas set forma_recebimento = 'retirada'
  where forma_recebimento is null
  and id in (select venda_id from venda_itens group by venda_id having bool_and(quantidade_retirada = quantidade));
update vendas set forma_recebimento = 'entrega'
  where forma_recebimento is null
  and id in (select venda_id from venda_itens group by venda_id having bool_and(quantidade_entrega = quantidade));
update vendas set forma_recebimento = 'misto' where forma_recebimento is null;
