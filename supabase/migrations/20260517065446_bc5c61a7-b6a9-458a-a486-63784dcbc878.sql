delete from public.eurostat_population_1km where grd_id = 'TEST_001';
drop function if exists public.eurostat_bulk_insert(jsonb);