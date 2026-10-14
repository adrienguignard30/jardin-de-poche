-- Tableau de bord : savoir quels codes ont déjà été donnés (QR montré ou carte remise), même pas encore utilisés.
alter table public.codes_atelier add column if not exists donne_le timestamptz;
