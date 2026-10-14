-- =====================================================================================================
--  POTAGER DE POCHE — l'Atelier (objets de déco générés avec Tripo) — 14 octobre 2026
--  À coller UNE FOIS dans Supabase : SQL Editor > New query > coller tout > Run. N'efface aucune donnée.
--
--  codes_atelier : les codes à usage unique. Sans code valide, rien n'est jamais généré (donc aucun crédit dépensé).
--  creations     : une ligne par objet demandé : le texte du joueur, la tâche Tripo, puis le modèle et l'image copiés
--                  dans Supabase Storage (bucket « creations », lecture publique) car les liens Tripo expirent.
--  Personne ne peut lire ni écrire ces tables depuis un navigateur : seul le serveur (api/atelier.js, clé secrète).
-- =====================================================================================================

create table if not exists public.codes_atelier (
  code        text primary key check (code ~ '^[A-Z0-9-]{6,24}$'),
  cree_le     timestamptz not null default now(),
  note        text,
  utilise_le  timestamptz,
  creation    uuid
);

create table if not exists public.creations (
  id          uuid primary key,
  code        text references public.codes_atelier(code),
  joueur      uuid references auth.users(id) on delete set null,
  empreinte   text,
  langue      text,
  prompt      text not null,
  prompt_tripo text,
  task_id     text,
  statut      text not null default 'en_cours' check (statut in ('en_cours', 'pret', 'echec')),
  progres     integer not null default 0,
  url_modele  text,
  url_image   text,
  erreur      text,
  cree_le     timestamptz not null default now(),
  maj         timestamptz not null default now()
);
create index if not exists creations_cree_le on public.creations (cree_le desc);

alter table public.codes_atelier enable row level security;
alter table public.creations enable row level security;
revoke all on public.codes_atelier, public.creations from anon, authenticated;
grant select, insert, update on public.codes_atelier, public.creations to service_role;

-- ---------- consommer un code : tout ou rien (le code est brûlé et la création enregistrée dans la même transaction)
create or replace function public.utiliser_code(p_code text, p_creation uuid, p_prompt text, p_prompt_tripo text,
                                                 p_langue text default null, p_joueur uuid default null, p_empreinte text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from codes_atelier where code = upper(trim(p_code)) for update;
  if c.code is null then return jsonb_build_object('ok', false, 'raison', 'inconnu'); end if;
  if c.utilise_le is not null then return jsonb_build_object('ok', false, 'raison', 'deja_utilise'); end if;
  if p_joueur is not null and not exists (select 1 from auth.users where id = p_joueur) then p_joueur := null; end if;
  insert into creations (id, code, joueur, empreinte, langue, prompt, prompt_tripo)
  values (p_creation, c.code, p_joueur, left(p_empreinte, 64), left(p_langue, 5), left(p_prompt, 200), left(p_prompt_tripo, 600));
  update codes_atelier set utilise_le = now(), creation = p_creation where code = c.code;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.utiliser_code(text, uuid, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.utiliser_code(text, uuid, text, text, text, uuid, text) to service_role;

-- ---------- si Tripo refuse la demande tout de suite, le code est rendu au joueur
create or replace function public.rendre_code(p_creation uuid, p_erreur text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update codes_atelier set utilise_le = null, creation = null where creation = p_creation;
  update creations set statut = 'echec', erreur = left(p_erreur, 300), maj = now() where id = p_creation;
end $$;
revoke execute on function public.rendre_code(uuid, text) from public, anon, authenticated;
grant execute on function public.rendre_code(uuid, text) to service_role;

-- ---------- fabriquer des codes : à lancer toi-même dans le SQL Editor, par exemple  select * from creer_codes(30, 'POTAGER');
create or replace function public.creer_codes(p_n int default 30, p_prefixe text default 'POTAGER', p_note text default null)
returns table (code text) language plpgsql security definer set search_path = public as $$
declare
  i int := 0; c text; lettres text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- pas de O/0 ni I/1, pour éviter les confusions
begin
  while i < least(greatest(p_n, 1), 500) loop
    c := upper(p_prefixe) || '-' || substr(lettres, 1 + floor(random() * 32)::int, 1) || substr(lettres, 1 + floor(random() * 32)::int, 1)
         || substr(lettres, 1 + floor(random() * 32)::int, 1) || substr(lettres, 1 + floor(random() * 32)::int, 1);
    begin
      insert into codes_atelier (code, note) values (c, p_note);
      i := i + 1; code := c; return next;
    exception when unique_violation then null;   -- on retire
    end;
  end loop;
end $$;
revoke execute on function public.creer_codes(int, text, text) from public, anon, authenticated;

-- ---------- où en sont mes codes (pour toi, dans le SQL Editor) :  select * from codes_atelier order by cree_le;

-- ---------- le dossier public où les modèles sont copiés (lecture publique, écriture serveur seulement)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creations', 'creations', true, 52428800, array['model/gltf-binary', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['model/gltf-binary', 'image/png', 'image/jpeg', 'image/webp'];
