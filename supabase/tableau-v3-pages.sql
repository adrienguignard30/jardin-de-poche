-- =====================================================================================================
--  POTAGER DE POCHE — tableau de bord v3 : temps par page (19 octobre 2026)
--  À coller tel quel dans Supabase → SQL Editor → Run. Remplace seulement la fonction tableau_de_bord.
--  Nouveau : kpi.secondes = temps dans le JEU seulement ; kpi.secondes_tout = toutes pages ;
--            'pages' = temps par page sur la période ; chaque visiteur a 'pages' = {page: secondes}.
--  Retour arrière : recoller la fonction de tableau-v2.sql.
-- =====================================================================================================
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
        'secondes',      coalesce(sum(s.secondes) filter (where (s.page is null or (s.page not like '/tableau/%' and s.page not like '/carte%' and s.page not like '/ar/%' and s.page not like '/video%'))), 0),
        'moyenne',       coalesce(avg(s.secondes) filter (where s.secondes > 0 and (s.page is null or (s.page not like '/tableau/%' and s.page not like '/carte%' and s.page not like '/ar/%' and s.page not like '/video%'))), 0)::int,
        'secondes_tout', coalesce(sum(s.secondes), 0),
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
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('page', k, 'secondes', sec, 'visiteurs', v, 'sessions', n) order by sec desc), '[]'::jsonb)
      from (select coalesce(page, '/') k, sum(secondes) sec, count(distinct empreinte) v, count(*) n from sessions where debut >= depuis group by 1) a),
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
             (select coalesce(jsonb_object_agg(k, sec), '{}'::jsonb) from (select coalesce(s.page, '/') k, sum(s.secondes) sec from sessions s where s.empreinte = vi.empreinte group by 1) x) as pages,
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
