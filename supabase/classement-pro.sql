-- Potager de Poche — classement « pro » (4 octobre 2026)
-- À coller dans Supabase > SQL Editor > New query > Run. Ne supprime aucune donnée.
-- 1. Le classement : seulement les comptes avec un pseudo (pas les invités), affichés sous leur pseudo.
create or replace function public.classement(p_type text, p_n int default 20)
returns table (rang bigint, nom text, score int, moi boolean)
language sql security definer set search_path = public stable as $$
  with s as (
    select id, pseudo as nom,
      case p_type when 'trocs' then trocs when 'recoltes' then recoltes when 'recus' then plats_recus else plats_offerts end as score
    from profils where pseudo is not null and plats_offerts > 0
  )
  select rank() over (order by score desc), nom, score, id = auth.uid() from s order by score desc limit least(p_n, 50);
$$;
-- 2. Ta place, même hors du top 20.
create or replace function public.mon_rang(p_type text)
returns table (rang bigint, total bigint, score int)
language sql security definer set search_path = public stable as $$
  with s as (
    select id, case p_type when 'trocs' then trocs when 'recoltes' then recoltes when 'recus' then plats_recus else plats_offerts end as score
    from profils where pseudo is not null and plats_offerts > 0
  ), r as (select id, score, rank() over (order by score desc) as rang, count(*) over () as total from s)
  select rang, total, score from r where id = auth.uid();
$$;
grant execute on function public.classement(text, int), public.mon_rang(text) to anon, authenticated;
