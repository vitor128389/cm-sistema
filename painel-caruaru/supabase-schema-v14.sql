-- =============================================
-- v14: o cadastro de usuário passa a centralizar loja e caixa
-- (criando ou vinculando, tudo na mesma tela). Adiciona CPF, e-mail
-- (cópia pra exibição), caixa vinculado e status (ativo/inativo)
-- na tabela usuarios. Adiciona o cargo "gerente".
-- =============================================

alter table usuarios add column if not exists cpf text;
alter table usuarios add column if not exists email text;
alter table usuarios add column if not exists caixa_id uuid references caixas(id);
alter table usuarios add column if not exists ativo boolean not null default true;

-- preenche o e-mail de quem já estava cadastrado antes dessa coluna existir
update usuarios u set email = a.email from auth.users a where u.id = a.id and u.email is null;

-- ---------- CARGO "GERENTE" ----------
alter table usuarios drop constraint if exists usuarios_funcao_check;
alter table usuarios add constraint usuarios_funcao_check
  check (funcao in ('admin','gerente','vendedor','producao','caixa'));

alter table permissoes drop constraint if exists permissoes_funcao_check;
alter table permissoes add constraint permissoes_funcao_check
  check (funcao in ('admin','gerente','vendedor','producao','caixa'));

insert into permissoes (funcao, tela, pode_acessar) values
  ('gerente','vender',true), ('gerente','produtos',true), ('gerente','clientes',true),
  ('gerente','encomendas',true), ('gerente','notas',true), ('gerente','trocas',true),
  ('gerente','caixa',true), ('gerente','movimento',true), ('gerente','administracao',false)
on conflict (funcao, tela) do nothing;

-- ---------- CAIXA: nome único por LOJA, não globalmente ----------
-- (sem isso, duas lojas não conseguiam ter, cada uma, um "Caixa 1")
alter table caixas drop constraint if exists caixas_nome_key;
create unique index if not exists caixas_nome_loja_idx on caixas(nome, loja_id);
