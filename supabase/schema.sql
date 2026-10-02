-- =====================================================================================================
--  POTAGER DE POCHE — la base en ligne (Supabase). À coller UNE FOIS dans le NOUVEAU projet :
--  SQL Editor > New query > coller tout > Run.  (Ne touche à aucun autre projet.)
--
--  Ce qu'on stocke, et rien d'autre :
--    profils  : une ligne par joueur (invité ou compte) : pseudo de connexion (comptes seulement), nom affiché,
--               4 compteurs pour le classement, dates. Le mot de passe n'est PAS ici : Supabase Auth le garde haché.
--    parties  : au plus 3 par joueur (une par personnage : Léa, Marcel, Jimy), la partie en JSON compact, 32 Ko maximum.
-- =====================================================================================================

-- ---------- les joueurs
create table if not exists public.profils (
  id              uuid primary key references auth.users(id) on delete cascade,
  pseudo          text unique check (pseudo is null or pseudo ~ '^[a-z0-9_.-]{3,20}$'),   -- connexion (minuscules), vide pour un invité
  nom             text not null default 'Jardinier' check (char_length(nom) between 1 and 24), -- nom affiché dans le jeu
  trocs           integer not null default 0 check (trocs between 0 and 100000),
  recoltes        integer not null default 0 check (recoltes between 0 and 100000),
  plats_offerts   integer not null default 0 check (plats_offerts between 0 and 100000),
  plats_recus     integer not null default 0 check (plats_recus between 0 and 100000),
  cree_le         timestamptz not null default now(),
  vu_le           timestamptz not null default now()
);

-- ---------- les parties : 3 au plus par joueur (la clé « joueur + personnage » l'impose)
create table if not exists public.parties (
  joueur  uuid not null references public.profils(id) on delete cascade,
  perso   text not null check (perso in ('lea', 'marcel', 'jimy')),
  data    jsonb not null check (pg_column_size(data) < 32768),      -- 32 Ko au plus : un robot ne peut pas gonfler la base
  maj     timestamptz not null default now(),
  primary key (joueur, perso)
);

-- ---------- sécurité : chacun ne voit et ne modifie QUE ses propres lignes
alter table public.profils enable row level security;
alter table public.parties enable row level security;

drop policy if exists "mon profil (lire)" on public.profils;
drop policy if exists "mon profil (modifier)" on public.profils;
create policy "mon profil (lire)" on public.profils for select using (auth.uid() = id);

drop policy if exists "mes parties" on public.parties;
create policy "mes parties" on public.parties for all using (auth.uid() = joueur) with check (auth.uid() = joueur);

-- le profil ne s'écrit QUE par les fonctions ci-dessous (creer_profil, maj_compteurs) : pas d'écriture directe
revoke insert, update, delete on public.profils from anon, authenticated;
revoke all on public.parties from anon;
grant select, insert, update, delete on public.parties to authenticated;

-- ---------- créer (ou compléter) mon profil : appelé juste après la connexion
create or replace function public.creer_profil(p_pseudo text default null, p_nom text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  insert into profils (id, pseudo, nom) values (auth.uid(), lower(p_pseudo), coalesce(nullif(trim(p_nom), ''), 'Jardinier'))
  on conflict (id) do update set
    pseudo = coalesce(profils.pseudo, excluded.pseudo),               -- un pseudo donné une fois ne change plus
    nom = coalesce(nullif(trim(p_nom), ''), profils.nom),
    vu_le = now();
end $$;

-- ---------- ce pseudo est-il libre ? (sans dévoiler la liste des joueurs)
create or replace function public.pseudo_disponible(p text)
returns boolean language sql security definer set search_path = public stable as $$
  select lower(p) ~ '^[a-z0-9_.-]{3,20}$' and not exists (select 1 from profils where pseudo = lower(p));
$$;

-- ---------- les compteurs du classement (ils ne peuvent que monter, et pas de plus de 500 d'un coup)
create or replace function public.maj_compteurs(p_trocs int, p_recoltes int, p_offerts int, p_recus int, p_nom text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profils set
    trocs         = least(trocs + 500,         greatest(trocs,         coalesce(p_trocs, 0))),
    recoltes      = least(recoltes + 500,      greatest(recoltes,      coalesce(p_recoltes, 0))),
    plats_offerts = least(plats_offerts + 500, greatest(plats_offerts, coalesce(p_offerts, 0))),
    plats_recus   = least(plats_recus + 500,   greatest(plats_recus,   coalesce(p_recus, 0))),
    nom = coalesce(nullif(trim(p_nom), ''), nom),
    vu_le = now()
  where id = auth.uid();
end $$;

-- ---------- le classement : les 20 premiers d'une catégorie (seulement ceux qui ont vraiment joué)
create or replace function public.classement(p_type text, p_n int default 20)
returns table (rang bigint, nom text, score int, moi boolean)
language sql security definer set search_path = public stable as $$
  with s as (
    select id, nom,
      case p_type when 'trocs' then trocs when 'recoltes' then recoltes when 'recus' then plats_recus else plats_offerts end as score
    from profils where plats_offerts > 0
  )
  select rank() over (order by score desc), nom, score, id = auth.uid() from s order by score desc limit least(p_n, 50);
$$;

-- ---------- pour que la base ne se mette jamais en pause : un appel par jour suffit
create or replace function public.ping() returns text language sql stable as $$ select 'ok' $$;

grant execute on function public.creer_profil(text, text), public.pseudo_disponible(text), public.maj_compteurs(int, int, int, int, text),
  public.classement(text, int), public.ping() to anon, authenticated;

-- ---------- le ménage, chaque nuit : invités jamais joués après 7 jours, comptes jamais joués après 30 jours
create or replace function public.menage() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users u using profils p
   where p.id = u.id and p.plats_offerts = 0 and p.recoltes = 0
     and ((u.is_anonymous and p.vu_le < now() - interval '7 days') or (not u.is_anonymous and p.vu_le < now() - interval '30 days'));
  delete from auth.users u where u.is_anonymous and u.created_at < now() - interval '7 days'
     and not exists (select 1 from profils p where p.id = u.id);
end $$;
revoke execute on function public.menage() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule('potager-menage') where exists (select 1 from cron.job where jobname = 'potager-menage');
select cron.schedule('potager-menage', '30 3 * * *', 'select public.menage()');
