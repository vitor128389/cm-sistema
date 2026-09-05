-- Rode isso depois do schema-v2 — faltou uma coluna na tabela clientes.
alter table clientes add column if not exists endereco text;
