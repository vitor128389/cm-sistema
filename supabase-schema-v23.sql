-- v23: nota fiscal (NFC-e) via Focus NFe.
-- Dados fiscais por produto (a contadora confere NCM/CFOP/CSOSN).
alter table produtos add column if not exists ncm text;
alter table produtos add column if not exists cfop text not null default '5102';
alter table produtos add column if not exists csosn text not null default '103';
alter table produtos add column if not exists unidade text not null default 'UN';

-- Dados fiscais por loja. fiscal_chave é o sufixo da variável de ambiente do
-- token (ex.: LAGARTO -> FOCUS_TOKEN_LAGARTO_HOMOLOG / FOCUS_TOKEN_LAGARTO_PROD).
-- Loja só emite nota quando fiscal_ativo = true.
alter table lojas add column if not exists fiscal_ativo boolean not null default false;
alter table lojas add column if not exists fiscal_chave text;
alter table lojas add column if not exists fiscal_ambiente text not null default 'homologacao';

create table if not exists notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  loja_id uuid references lojas(id),
  tipo text not null default 'nfce',
  ambiente text not null default 'homologacao',
  referencia text not null unique,
  status text not null default 'processando',
  numero text,
  serie text,
  chave text,
  protocolo text,
  mensagem text,
  url_danfe text,
  url_xml text,
  usuario_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists notas_fiscais_venda_idx on notas_fiscais(venda_id);
alter table notas_fiscais enable row level security;
create policy notas_fiscais_select on notas_fiscais for select to authenticated using (true);
-- escrita só pelo servidor (service role), que ignora RLS.

-- Lagarto começa em homologação (teste).
update lojas set fiscal_ativo = true, fiscal_chave = 'LAGARTO', fiscal_ambiente = 'homologacao'
 where id = '8782ade7-b074-4c92-a46d-62e80787c129';
