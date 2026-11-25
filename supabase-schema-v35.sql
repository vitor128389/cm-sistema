-- Vale crédito: criado pelo administrador (Administração > Vale crédito), vale em todas as lojas.
create table if not exists public.vales_credito (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  cliente_nome text not null,
  observacao text not null default '',
  valor numeric(12,2) not null check (valor > 0),
  saldo numeric(12,2) not null check (saldo >= 0),
  status text not null default 'ativo' check (status in ('ativo','usado','cancelado')),
  loja_emissao_id uuid references public.lojas(id),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.vales_credito enable row level security;
drop policy if exists vales_credito_ler on public.vales_credito;
create policy vales_credito_ler on public.vales_credito for select to authenticated using (true);
drop policy if exists vales_credito_admin on public.vales_credito;
create policy vales_credito_admin on public.vales_credito for all to authenticated
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.funcao = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.funcao = 'admin'));

-- Qualquer usuário logado pode gravar a "última data do corte de tecido" (Encomendas) — só essa chave.
drop policy if exists configuracoes_ultimo_corte_ins on public.configuracoes;
create policy configuracoes_ultimo_corte_ins on public.configuracoes for insert to authenticated with check (chave = 'encomendas_ultimo_corte');
drop policy if exists configuracoes_ultimo_corte_upd on public.configuracoes;
create policy configuracoes_ultimo_corte_upd on public.configuracoes for update to authenticated using (chave = 'encomendas_ultimo_corte') with check (chave = 'encomendas_ultimo_corte');
