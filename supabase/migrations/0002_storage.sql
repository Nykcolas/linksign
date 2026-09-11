-- Bucket privado para os PDFs assinados baixados da ZapSign.
-- O app nunca lê o arquivo direto: pede uma signed URL de curta duração.

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

create policy "equipe lê contratos assinados"
  on storage.objects for select to authenticated
  using (bucket_id = 'contracts');
