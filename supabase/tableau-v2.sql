-- =====================================================================================================
--  POTAGER DE POCHE — tableau de bord v2 : visiteurs, sessions, temps de jeu, bugs (13 octobre 2026)
--  À coller UNE FOIS dans Supabase : SQL Editor > New query > coller tout > Run.
--  N'efface AUCUNE donnée. Ajoute 2 tables (visiteurs, sessions), 2 colonnes à bugs, et remplace 3 fonctions.
--  À coller APRÈS tableau-de-bord.sql (la table bugs doit déjà exister).
--
--  visiteurs : une ligne par appareil/personne (empreinte = hachage de l'adresse + navigateur, jamais l'adresse brute),
--              avec ville, pays, appareil, temps de jeu total, nombre de sessions, et le compte s'il y en a un.
--  sessions  : une ligne par ouverture du jeu, avec le temps réellement joué (signal toutes les 30 s depuis le jeu),
--              le personnage, la langue, le temps de chargement et les images par seconde.
--  Personne ne peut lire ces tables depuis un navigateur : seul le serveur (clé secrète) écrit et lit.
-- =====================================================================================================

create table if not exists public.visiteurs (
  empreinte  text primary key,
  premiere   timestamptz not null default now(),
  derniere   timestamptz not null default now(),
  sessions   integer not null default 0,
  secondes   integer not null default 0,
  jours      integer not null default 1,          -- nombre de jours différents où il est venu
  dernier_jour date not null default (now() at time zone 'Europe/Paris')::date,
  pays       text, ville   text, region text,
  appareil   text, langue  text,
  joueur     uuid references auth.users(id) on delete set null
);
create index if not exists visiteurs_derniere on public.visiteurs (derniere desc);

create table if not exists public.sessions (
  id         uuid primary key,
  empreinte  text not null references public.visiteurs(empreinte) on delete cascade,
  joueur     uuid references auth.users(id) on delete set null,
  debut      timestamptz not null default now(),
  derniere   timestamptz not null default now(),
  secondes   integer not null default 0,
  perso      text, langue text, appareil text, page text,
  pays       text, ville text,
  boot_ms    integer, fps integer,
  battements integer not null default 0
);
create index if not exists sessions_debut on public.sessions (debut desc);
create index if not exists sessions_derniere on public.sessions (derniere desc);
create index if not exists sessions_empreinte on public.sessions (empreinte);

alter table public.bugs add column if not exists session uuid;
alter table public.bugs add column if not exists empreinte text;
create index if not exists bugs_session on public.bugs (session);

alter table public.visiteurs enable row level security;
alter table public.sessions enable row level security;
revoke all on public.visiteurs, public.sessions from anon, authenticated;
grant select, insert, update on public.visiteurs, public.sessions to service_role;

-- ---------- un battement : le jeu est ouvert et actif (appelé par le serveur api/presence.js, jamais par un navigateur)
create or replace function public.enregistrer_battement(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_session uuid := (p->>'session')::uuid;
  v_emp     text := left(p->>'empreinte', 64);
  v_delta   int  := least(greatest(coalesce((p->>'delta')::int, 0), 0), 120);   -- 2 minutes max par battement
  v_jour    date := (now() at time zone 'Europe/Paris')::date;
  v_joueur  uuid := nullif(p->>'joueur', '')::uuid;
  s record;
begin
  if v_session is null or v_emp is null or v_emp = '' then return jsonb_build_object('ok', false); end if;
  if v_joueur is not null and not exists (select 1 from auth.users where id = v_joueur) then v_joueur := null; end if;

  insert into visiteurs (empreinte, pays, ville, region, appareil, langue, joueur)
  values (v_emp, left(p->>'pays', 4), left(p->>'ville', 60), left(p->>'region', 60), left(p->>'appareil', 80), left(p->>'langue', 5), v_joueur)
  on conflict (empreinte) do update set
    derniere = now(),
    pays = coalesce(excluded.pays, visiteurs.pays), ville = coalesce(excluded.ville, visiteurs.ville), region = coalesce(excluded.region, visiteurs.region),
    appareil = coalesce(excluded.appareil, visiteurs.appareil), langue = coalesce(excluded.langue, visiteurs.langue),
    joueur = coalesce(excluded.joueur, visiteurs.joueur),
    jours = visiteurs.jours + case when visiteurs.dernier_jour < v_jour then 1 else 0 end,
    dernier_jour = greatest(visiteurs.dernier_jour, v_jour);

  select * into s from sessions where id = v_session;
  if s.id is null then
    if (select count(*) from sessions where empreinte = v_emp and debut > now() - interval '1 hour') >= 30 then return jsonb_build_object('ok', false); end if;
    insert into sessions (id, empreinte, joueur, perso, langue, appareil, page, pays, ville, boot_ms, fps, secondes, battements)
    values (v_session, v_emp, v_joueur, left(p->>'perso', 12), left(p->>'langue', 5), left(p->>'appareil', 80), left(p->>'page', 80),
            left(p->>'pays', 4), left(p->>'ville', 60), (p->>'boot')::int, (p->>'fps')::int, v_delta, 1);
    update visiteurs set sessions = sessions + 1, secondes = secondes + v_delta where empreinte = v_emp;
  else
    if s.derniere > now() - interval '15 seconds' then return jsonb_build_object('ok', true, 'ignore', true); end if;   -- pas plus d'un battement par 15 s
    update sessions set derniere = now(), secondes = secondes + v_delta, battements = battements + 1,
      perso = coalesce(left(p->>'perso', 12), perso), langue = coalesce(left(p->>'langue', 5), langue),
      joueur = coalesce(v_joueur, joueur), boot_ms = coalesce(boot_ms, (p->>'boot')::int),
      fps = case when (p->>'fps') is null then fps when fps is null then (p->>'fps')::int else (fps * battements + (p->>'fps')::int) / (battements + 1) end
      where id = v_session;
    update visiteurs set secondes = secondes + v_delta where empreinte = v_emp;
  end if;
  delete from sessions where debut < now() - interval '90 days';
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.enregistrer_battement(jsonb) from public, anon, authenticated;
grant execute on function public.enregistrer_battement(jsonb) to service_role;

-- ---------- le jeu signale une erreur (version 2 : avec la session, pour retrouver le visiteur)
drop function if exists public.signaler_bug(text, text, text, text, text);   -- l'ancienne version, remplacée
create or replace function public.signaler_bug(p_message text, p_pile text default null, p_appareil text default null,
                                               p_page text default null, p_perso text default null, p_session uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m text := left(coalesce(nullif(trim(p_message), ''), '?'), 500);
  emp text := (select empreinte from sessions where id = p_session);
  n int;
begin
  if (select count(*) from bugs where cree_le > now() - interval '1 hour') >= 300 then return; end if;
  if auth.uid() is not null
     and (select count(*) from bugs where joueur = auth.uid() and cree_le > now() - interval '1 hour') >= 20 then return; end if;
  if emp is not null
     and (select count(*) from bugs where empreinte = emp and cree_le > now() - interval '1 hour') >= 20 then return; end if;
  update bugs set fois = least(fois + 1, 100000), vu_le = now(), session = coalesce(p_session, session), empreinte = coalesce(emp, empreinte)
   where id = (select id from bugs where message = m
                and (joueur is not distinct from auth.uid() or (emp is not null and empreinte = emp))
                and vu_le > now() - interval '30 minutes' order by vu_le desc limit 1);
  get diagnostics n = row_count;
  if n = 0 then
    insert into bugs (joueur, perso, message, pile, appareil, page, session, empreinte)
    values (auth.uid(), left(p_perso, 12), m, left(p_pile, 1500), left(p_appareil, 200), left(p_page, 200), p_session, emp);
  end if;
  delete from bugs where vu_le < now() - interval '30 days';
end $$;
revoke execute on function public.signaler_bug(text, text, text, text, text, uuid) from public;
grant execute on function public.signaler_bug(text, text, text, text, text, uuid) to anon, authenticated;

-- ---------- le tableau de bord (réservé au serveur) : p_periode = '24h' | '7j' | '30j'
create or replace function public.tableau_de_bord(p_periode text default '24h')
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  depuis timestamptz := case p_periode when '7j' then now() - interval '7 days' when '30j' then now() - interval '30 days' else now() - interval '24 hours' end;
  pas text := case when p_periode = '24h' then 'hour' else 'day' end;
  n_pas int := case p_periode when '7j' then 7 when '30j' then 30 else 24 end;
  r jsonb;
begin
  select jsonb_build_object(
    'maintenant', now(), 'periode', coalesce(p_periode, '24h'),
    'kpi', (select jsonb_build_object(
        'visiteurs',     count(distinct s.empreinte),
        'sessions',      count(*),
        'secondes',      coalesce(sum(s.secondes), 0),
        'moyenne',       coalesce(avg(s.secondes) filter (where s.secondes > 0), 0)::int,
        'nouveaux',      (select count(*) from visiteurs v where v.premiere >= depuis),
        'revenus',       (select count(*) from visiteurs v where v.derniere >= depuis and v.jours >= 2),
        'en_ce_moment',  (select count(distinct empreinte) from sessions where derniere > now() - interval '2 minutes'),
        'comptes',       (select count(*) from profils where pseudo is not null),
        'joueurs_total', (select count(*) from visiteurs),
        'bugs',          (select count(*) from bugs where vu_le >= depuis),
        'sessions_bug',  (select count(distinct session) from bugs where vu_le >= depuis and session is not null),
        'boot_ms',       coalesce(percentile_cont(0.5) within group (order by s.boot_ms) filter (where s.boot_ms is not null), 0)::int,
        'fps',           coalesce(avg(s.fps) filter (where s.fps is not null), 0)::int)
      from sessions s where s.debut >= depuis),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object('t', g.t, 'sessions', coalesce(x.n, 0), 'visiteurs', coalesce(x.v, 0), 'secondes', coalesce(x.sec, 0)) order by g.t), '[]'::jsonb)
      from (select date_trunc(pas, depuis + (i || ' ' || pas)::interval, 'Europe/Paris') as t from generate_series(0, n_pas) i) g
      left join (select date_trunc(pas, debut, 'Europe/Paris') as t, count(*) n, count(distinct empreinte) v, sum(secondes) sec
                 from sessions where debut >= depuis group by 1) x on x.t = g.t
      where g.t <= date_trunc(pas, now(), 'Europe/Paris')),
    'appareils', (select coalesce(jsonb_agg(jsonb_build_object('nom', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select split_part(coalesce(appareil, 'autre'), ' · ', 1) k, count(distinct empreinte) n from sessions where debut >= depuis group by 1) a),
    'navigateurs', (select coalesce(jsonb_agg(jsonb_build_object('nom', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select split_part(coalesce(appareil, 'autre'), ' · ', 2) k, count(distinct empreinte) n from sessions where debut >= depuis group by 1) a),
    'pays', (select coalesce(jsonb_agg(jsonb_build_object('nom', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(pays, '?') k, count(distinct empreinte) n from sessions where debut >= depuis group by 1 order by n desc limit 8) a),
    'langues', (select coalesce(jsonb_agg(jsonb_build_object('nom', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(langue, '?') k, count(distinct empreinte) n from sessions where debut >= depuis group by 1) a),
    'persos', (select coalesce(jsonb_agg(jsonb_build_object('nom', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(perso, 'aucun') k, count(*) n from sessions where debut >= depuis group by 1) a),
    'durees', (select jsonb_build_object(
        'moins1', count(*) filter (where secondes < 60), 'de1a5', count(*) filter (where secondes >= 60 and secondes < 300),
        'de5a15', count(*) filter (where secondes >= 300 and secondes < 900), 'plus15', count(*) filter (where secondes >= 900))
      from sessions where debut >= depuis),
    'visiteurs', (select coalesce(jsonb_agg(to_jsonb(v) order by v.derniere desc), '[]'::jsonb) from (
      select vi.empreinte, vi.premiere, vi.derniere, vi.sessions, vi.secondes, vi.jours, vi.pays, vi.ville, vi.region, vi.appareil, vi.langue,
             p.nom, p.pseudo, p.plats_offerts, p.recoltes, p.trocs,
             (select coalesce(jsonb_agg(distinct s.perso), '[]'::jsonb) from sessions s where s.empreinte = vi.empreinte and s.perso is not null) as persos,
             (select count(*) from bugs b where b.empreinte = vi.empreinte and b.vu_le > now() - interval '30 days') as bugs,
             vi.derniere > now() - interval '2 minutes' as en_ligne
      from visiteurs vi left join profils p on p.id = vi.joueur
      order by vi.derniere desc limit 60) v),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.debut desc), '[]'::jsonb) from (
      select se.id, se.empreinte, se.debut, se.derniere, se.secondes, se.perso, se.langue, se.appareil, se.pays, se.ville, se.boot_ms, se.fps, se.page,
             p.nom, p.pseudo, (select count(*) from bugs b where b.session = se.id) as bugs,
             se.derniere > now() - interval '2 minutes' as en_cours
      from sessions se left join profils p on p.id = se.joueur
      order by se.debut desc limit 40) s),
    'bugs', (select coalesce(jsonb_agg(to_jsonb(b) order by b.vu_le desc), '[]'::jsonb) from (
      select b.id, b.cree_le, b.vu_le, b.fois, b.perso, b.message, b.pile, b.appareil, b.page, b.session, b.empreinte,
             p.nom as joueur_nom, p.pseudo as joueur_pseudo, se.ville, se.pays
      from bugs b left join profils p on p.id = b.joueur left join sessions se on se.id = b.session
      order by b.vu_le desc limit 60) b),
    'comptes_recents', (select coalesce(jsonb_agg(to_jsonb(c) order by c.vu_le desc), '[]'::jsonb) from (
      select p.nom, p.pseudo, p.vu_le, p.cree_le, p.plats_offerts, p.recoltes, p.trocs,
             (select coalesce(jsonb_agg(pa.perso order by pa.maj desc), '[]'::jsonb) from parties pa where pa.joueur = p.id) as persos
      from profils p order by p.vu_le desc limit 30) c)
  ) into r;
  return r;
end $$;
revoke execute on function public.tableau_de_bord(text) from public, anon, authenticated;
grant execute on function public.tableau_de_bord(text) to service_role;
drop function if exists public.tableau_de_bord();
