-- v25: NF-e (modelo 55) — guarda os dados do destinatário/entrega usados em cada nota.
alter table notas_fiscais add column if not exists dados jsonb;
