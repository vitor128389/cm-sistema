-- =============================================
-- v19: adiciona o campo Cidade no endereço do cliente
-- (a loja já tinha esse campo desde a v9 — agora o cliente também).
-- =============================================

alter table clientes add column if not exists cidade text;
