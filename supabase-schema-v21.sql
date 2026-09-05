-- =============================================
-- v21: corrige a exclusão de usuário — o histórico de sangrias
-- ficava travando a exclusão porque apontava pro usuário sem
-- permitir "solto". Agora, ao excluir um usuário, as sangrias que
-- ele fez continuam no histórico (com o valor, motivo e data
-- intactos), só perdem o vínculo com o usuário específico.
-- =============================================

alter table sangrias drop constraint if exists sangrias_usuario_id_fkey;
alter table sangrias add constraint sangrias_usuario_id_fkey
  foreign key (usuario_id) references usuarios(id) on delete set null;
