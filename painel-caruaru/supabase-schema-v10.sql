-- =============================================
-- v10: CORREÇÃO CRÍTICA — a política de segurança (RLS) que a v7 criou
-- na tabela `usuarios` ("admin_gerencia_usuarios", FOR ALL) consulta a
-- própria tabela `usuarios` pra saber se quem está logado é admin. Como
-- essa política vale também pra leitura (SELECT), e a consulta interna
-- dela dispara a MESMA política de novo, isso causa recursão infinita
-- no Postgres — e qualquer consulta que dependa de checar a loja/função
-- do usuário (Painel, estoque, vendas, etc.) passa a falhar com erro 500.
--
-- A correção: a política de admin deixa de valer para SELECT (que já
-- está livre e coberto pela política "equipe_le_usuarios", sem
-- recursão) e passa a valer só para INSERT/UPDATE/DELETE, separadamente.
-- =============================================

do $$ begin
  execute (
    select coalesce(string_agg(format('drop policy if exists %I on usuarios;', policyname), ' '), '')
    from pg_policies where tablename = 'usuarios'
  );
end $$;

create policy "equipe_le_usuarios" on usuarios for select using (auth.role() = 'authenticated');

create policy "admin_insere_usuarios" on usuarios for insert with check (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
create policy "admin_atualiza_usuarios" on usuarios for update using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
create policy "admin_exclui_usuarios" on usuarios for delete using (
  exists (select 1 from usuarios u where u.id = auth.uid() and u.funcao = 'admin')
);
