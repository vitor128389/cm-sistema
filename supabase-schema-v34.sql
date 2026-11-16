-- Foto do produto (sem fundo): coluna produtos.foto_url já existia; aqui só o bucket público.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos-fotos', 'produtos-fotos', true, 3145728, array['image/png','image/webp','image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/png','image/webp','image/jpeg'];
create policy "produtos_fotos_leitura" on storage.objects for select using (bucket_id = 'produtos-fotos');
create policy "produtos_fotos_envio" on storage.objects for insert to authenticated with check (bucket_id = 'produtos-fotos');
create policy "produtos_fotos_troca" on storage.objects for update to authenticated using (bucket_id = 'produtos-fotos') with check (bucket_id = 'produtos-fotos');
create policy "produtos_fotos_apagar" on storage.objects for delete to authenticated using (bucket_id = 'produtos-fotos');
