-- =============================================
-- v9: opção "cliente vai retirar" por item, endereço completo
-- da loja (pra aparecer na impressão).
-- =============================================

-- ---------- ITEM: cliente vai retirar (só relevante pra pronta entrega) ----------
alter table venda_itens add column if not exists retirada boolean not null default false;

-- ---------- LOJAS: endereço completo + telefone ----------
alter table lojas add column if not exists cep text;
alter table lojas add column if not exists rua text;
alter table lojas add column if not exists numero text;
alter table lojas add column if not exists complemento text;
alter table lojas add column if not exists bairro text;
alter table lojas add column if not exists cidade text;
alter table lojas add column if not exists estado text;
alter table lojas add column if not exists telefone text;

-- nada disso é obrigatório — lojas antigas continuam funcionando normalmente,
-- só não mostram endereço na impressão até alguém preencher.
