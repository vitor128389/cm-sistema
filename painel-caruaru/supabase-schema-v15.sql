-- =============================================
-- v15: observação por item da venda (aparece em negrito nos
-- detalhes e na impressão).
-- =============================================

alter table venda_itens add column if not exists observacao text;
