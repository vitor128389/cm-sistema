-- v26: Carta de Correção Eletrônica (CC-e) de NF-e.
create table if not exists cartas_correcao (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references notas_fiscais(id) on delete cascade,
  numero integer,
  texto text not null,
  status text not null default 'processando',
  mensagem text,
  url_pdf text,
  url_xml text,
  usuario_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists cartas_correcao_nota_idx on cartas_correcao(nota_id);
alter table cartas_correcao enable row level security;
create policy cartas_correcao_select on cartas_correcao for select to authenticated using (true);
-- escrita só pelo servidor (service role).
