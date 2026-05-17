create or replace function public.eurostat_bulk_insert(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.eurostat_population_1km (grd_id, pop_2021, geom)
  select
    (elem->>'grd_id')::text,
    (elem->>'pop_2021')::integer,
    st_geomfromtext(elem->>'geom_wkt', 4326)
  from jsonb_array_elements(payload) as elem
  on conflict (grd_id) do update
    set pop_2021 = excluded.pop_2021,
        geom = excluded.geom;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.eurostat_bulk_insert(jsonb) from public, anon, authenticated;
grant execute on function public.eurostat_bulk_insert(jsonb) to service_role;