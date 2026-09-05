-- =============================================
-- PAINEL CARUARU MÓVEIS — Schema do banco (Supabase/Postgres)
-- Rode esse arquivo inteiro no SQL Editor do seu projeto Supabase
-- =============================================

create extension if not exists "pgcrypto";

-- ---------- PRODUTOS ----------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null, -- sofá, namoradeira, cadeira, cama, etc.
  foto_url text,
  custo numeric(10,2) not null default 0,
  preco_venda numeric(10,2) not null default 0,
  tipo_estoque text not null default 'pronta_entrega'
    check (tipo_estoque in ('pronta_entrega', 'sob_encomenda')),
  quantidade_estoque int default 0,
  variacoes jsonb default '[]'::jsonb, -- ex: [{"tipo":"tecido","opcoes":["Suede","Linho"]}]
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- coluna calculada: lucro em R$
alter table produtos add column if not exists lucro_valor numeric(10,2)
  generated always as (preco_venda - custo) stored;

-- coluna calculada: lucro em %
alter table produtos add column if not exists lucro_percentual numeric(6,2)
  generated always as (
    case when custo > 0 then round(((preco_venda - custo) / custo) * 100, 2)
    else 0 end
  ) stored;

-- ---------- CLIENTES ----------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  criado_em timestamptz not null default now()
);

-- ---------- ENCOMENDAS ----------
create table if not exists encomendas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete restrict,
  produto_id uuid references produtos(id) on delete restrict,
  variacao_escolhida text,
  valor_total numeric(10,2) not null default 0,
  valor_sinal numeric(10,2) not null default 0,
  status text not null default 'aguardando_producao'
    check (status in ('aguardando_producao','produzindo','pronto','entregue')),
  prazo_entrega date,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table encomendas add column if not exists valor_restante numeric(10,2)
  generated always as (valor_total - valor_sinal) stored;

-- ---------- NOTAS ----------
create table if not exists notas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('venda','encomenda')),
  encomenda_id uuid references encomendas(id) on delete set null,
  cliente_nome text not null,
  itens jsonb not null default '[]'::jsonb, -- [{"produto":"Sofá X","qtd":1,"valor":1200}]
  valor_total numeric(10,2) not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------- USUÁRIOS DA EQUIPE ----------
-- vincula com o auth.users nativo do Supabase
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  funcao text not null default 'vendedor' check (funcao in ('admin','vendedor','producao')),
  criado_em timestamptz not null default now()
);

-- ---------- ÍNDICES ÚTEIS ----------
create index if not exists idx_encomendas_status on encomendas(status);
create index if not exists idx_produtos_tipo_estoque on produtos(tipo_estoque);
create index if not exists idx_notas_tipo on notas(tipo);

-- ---------- TRIGGER: atualizar "atualizado_em" ----------
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_produtos_atualizado on produtos;
create trigger trg_produtos_atualizado before update on produtos
  for each row execute function set_atualizado_em();

drop trigger if exists trg_encomendas_atualizado on encomendas;
create trigger trg_encomendas_atualizado before update on encomendas
  for each row execute function set_atualizado_em();

-- ---------- RLS (Row Level Security) ----------
-- Habilita e libera acesso só para usuários autenticados (equipe logada)
alter table produtos enable row level security;
alter table clientes enable row level security;
alter table encomendas enable row level security;
alter table notas enable row level security;
alter table usuarios enable row level security;

create policy "equipe_le_produtos" on produtos for select using (auth.role() = 'authenticated');
create policy "equipe_escreve_produtos" on produtos for all using (auth.role() = 'authenticated');

create policy "equipe_le_clientes" on clientes for select using (auth.role() = 'authenticated');
create policy "equipe_escreve_clientes" on clientes for all using (auth.role() = 'authenticated');

create policy "equipe_le_encomendas" on encomendas for select using (auth.role() = 'authenticated');
create policy "equipe_escreve_encomendas" on encomendas for all using (auth.role() = 'authenticated');

create policy "equipe_le_notas" on notas for select using (auth.role() = 'authenticated');
create policy "equipe_escreve_notas" on notas for all using (auth.role() = 'authenticated');

create policy "equipe_le_usuarios" on usuarios for select using (auth.role() = 'authenticated');
