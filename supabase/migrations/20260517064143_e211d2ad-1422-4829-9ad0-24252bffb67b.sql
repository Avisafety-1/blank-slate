create extension if not exists postgis;

create table if not exists public.eurostat_population_1km (
  grd_id text primary key,
  pop_2021 integer not null,
  geom geometry(Polygon, 4326) not null
);

create index if not exists eurostat_pop_geom_idx
  on public.eurostat_population_1km using gist (geom);

alter table public.eurostat_population_1km enable row level security;

drop policy if exists "Public read eurostat population" on public.eurostat_population_1km;
create policy "Public read eurostat population"
  on public.eurostat_population_1km
  for select
  to anon, authenticated
  using (true);

create or replace function public.eurostat_pop_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  grd_id text,
  pop_2021 integer,
  centroid_lng double precision,
  centroid_lat double precision,
  geom_json text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.grd_id,
    e.pop_2021,
    st_x(st_centroid(e.geom)) as centroid_lng,
    st_y(st_centroid(e.geom)) as centroid_lat,
    st_asgeojson(e.geom) as geom_json
  from public.eurostat_population_1km e
  where e.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    and e.pop_2021 > 0
  limit 100000;
$$;

grant execute on function public.eurostat_pop_in_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;