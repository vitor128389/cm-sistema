-- 2º número de contato do cliente (com o nome de quem é)
alter table public.clientes add column if not exists telefone2 text, add column if not exists telefone2_nome text;
