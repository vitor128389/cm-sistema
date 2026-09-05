-- =============================================
-- v18: nome do responsável pelo número de celular do cliente;
-- devoluções de troca passam a ter um indicador PRÓPRIO no caixa,
-- sem misturar com "Total vendido"; produto novo de uma troca
-- pode ser pronta entrega ou encomenda.
-- =============================================

alter table cliente_celulares add column if not exists nome_responsavel text;

alter table turnos_caixa add column if not exists total_devolvido numeric(10,2) not null default 0;

alter table trocas_novos add column if not exists tipo_entrega text
  check (tipo_entrega in ('pronta','encomenda')) not null default 'pronta';
