ALTER TABLE public.battery_types ADD COLUMN IF NOT EXISTS pack_count integer;
COMMENT ON COLUMN public.battery_types.pack_count IS 'Antall batterier loggen rapporterer samlet kapasitet for (NULL = automatisk deteksjon).';
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS battery_pack_count integer;
COMMENT ON COLUMN public.equipment.battery_pack_count IS 'Overstyring: antall batterier i pakken for dette batteriet (NULL = arv/auto).';