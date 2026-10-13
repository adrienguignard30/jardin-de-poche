-- =====================================================================================================
--  POTAGER DE POCHE — tableau de bord + bugs (8 octobre 2026)
--  À coller UNE FOIS dans Supabase : SQL Editor > New query > coller tout > Run.
--  N'efface et ne modifie AUCUNE donnée existante : ajoute une table (bugs) et deux fonctions.
--
--  bugs             : les erreurs du jeu, envoyées toutes seules par le navigateur des joueurs.
--                     Personne ne peut les lire (ni joueur, ni visiteur) : seulement le tableau de bord.
--  signaler_bug     : le jeu l'appelle quand une erreur arrive. Limité : 300 nouveaux bugs par heure pour tout le jeu,
--                     20 par joueur, textes coupés ; la même erreur répétée est comptée (×2, ×3…) au lieu d'être recopiée.
--  tableau_de_bord  : les chiffres de la page /tableau/. Réservée au serveur (clé secrète) : un navigateur ne peut pas l'appeler.
-- =====================================================================================================

-- ---------- les bugs
create table if not exists public.bugs (
  id        bigserial primary key,
  cree_le   timestamptz not null default now(),
  vu_le     timestamptz not null default now(),
  fois      integer not null default 1,
  joueur    uuid references auth.users(id) on delete set null,
  perso     text,
  message   text not null,
  pile      text,
  appareil  text,
  page      text
);
create index if not exists bugs_cree_le on public.bugs (cree_le desc);
create index if not exists bugs_vu_le on public.bugs (vu_le desc);
alter table public.bugs enable row level security;          -- aucune règle de lecture : fermé à tous les navigateurs
revoke all on public.bugs from anon, authenticated;
revoke all on sequence public.bugs_id_seq from anon, authenticated;

-- ---------- le jeu signale une erreur
create or replace function public.signaler_bug(p_message text, p_pile text default null, p_appareil text default null,
                                               p_page text default null, p_perso text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m text := left(coalesce(nullif(trim(p_message), ''), '?'), 500);
  n int;
begin
  if (select count(*) from bugs where cree_le > now() - interval '1 hour') >= 300 then return; end if;
  if auth.uid() is not null
     and (select count(*) from bugs where joueur = auth.uid() and cree_le > now() - interval '1 hour') >= 20 then return; end if;
  -- la même erreur, du même joueur, dans la dernière demi-heure : on la compte au lieu de l'ajouter
  update bugs set fois = least(fois + 1, 100000), vu_le = now()
   where id = (select id from bugs where message = m and joueur is not distinct from auth.uid()
                and vu_le > now() - interval '30 minutes' order by vu_le desc limit 1);
  get diagnostics n = row_count;
  if n = 0 then
    insert into bugs (joueur, perso, message, pile, appareil, page)
    values (auth.uid(), left(p_perso, 12), m, left(p_pile, 1500), left(p_appareil, 200), left(p_page, 200));
  end if;
  delete from bugs where vu_le < now() - interval '30 days';  -- on garde 30 jours
end $$;
revoke execute on function public.signaler_bug(text, text, text, text, text) from public;
grant execute on function public.signaler_bug(text, text, text, text, text) to anon, authenticated;

-- ---------- les chiffres du tableau de bord (heure de Paris)
create or replace function public.tableau_de_bord()
returns jsonb language sql security definer set search_path = public stable as $$
  with j as (select date_trunc('day', now(), 'Europe/Paris') as minuit)
  select jsonb_build_object(
    'maintenant', now(),
    'joueurs', (select jsonb_build_object(
        'total',         count(*),
        'comptes',       count(*) filter (where p.pseudo is not null),
        'invites',       count(*) filter (where p.pseudo is null),
        'en_ce_moment',  count(*) filter (where p.vu_le > now() - interval '5 minutes'),
        'aujourdhui',    count(*) filter (where p.vu_le >= j.minuit),
        'sept_jours',    count(*) filter (where p.vu_le > now() - interval '7 days'),
        'nouveaux_jour', count(*) filter (where p.cree_le >= j.minuit),
        'ont_offert',    count(*) filter (where p.plats_offerts > 0))
      from profils p, j),
    'nouveaux_par_jour', (select coalesce(jsonb_agg(jsonb_build_object('jour', d.jour, 'n', d.n) order by d.jour), '[]'::jsonb)
      from (select g::date as jour,
                   (select count(*) from profils p where (p.cree_le at time zone 'Europe/Paris')::date = g::date) as n
            from generate_series((now() at time zone 'Europe/Paris')::date - 13, (now() at time zone 'Europe/Paris')::date, interval '1 day') g) d),
    'persos', (select jsonb_build_object(
        'lea',    count(*) filter (where perso = 'lea'),
        'marcel', count(*) filter (where perso = 'marcel'),
        'jimy',   count(*) filter (where perso = 'jimy'))
      from parties),
    'recents', (select coalesce(jsonb_agg(to_jsonb(r) order by r.vu_le desc), '[]'::jsonb)
      from (select p.nom, p.pseudo, p.vu_le, p.cree_le, p.plats_offerts, p.recoltes, p.trocs,
                   (select coalesce(jsonb_agg(pa.perso order by pa.maj desc), '[]'::jsonb) from parties pa where pa.joueur = p.id) as persos
            from profils p order by p.vu_le desc limit 30) r),
    'bugs_24h', (select count(*) from bugs where vu_le > now() - interval '24 hours'),
    'bugs', (select coalesce(jsonb_agg(to_jsonb(b) order by b.vu_le desc), '[]'::jsonb)
      from (select b.cree_le, b.vu_le, b.fois, b.perso, b.message, b.pile, b.appareil, b.page,
                   p.nom as joueur_nom, p.pseudo as joueur_pseudo
            from bugs b left join profils p on p.id = b.joueur order by b.vu_le desc limit 40) b)
  ) from j;
$$;
revoke execute on function public.tableau_de_bord() from public, anon, authenticated;
grant execute on function public.tableau_de_bord() to service_role;
