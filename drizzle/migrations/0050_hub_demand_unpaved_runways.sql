ALTER TABLE public.aircraft_types ADD COLUMN IF NOT EXISTS unpaved_capable boolean NOT NULL DEFAULT false;
UPDATE public.aircraft_types SET unpaved_capable=true WHERE id IN ('C172','BE58','C208B','PC12NGX','DHC6');
COMMENT ON COLUMN public.aircraft_types.unpaved_capable IS 'Bush/STOL aircraft that may land on unpaved runways.';
INSERT INTO public.economy_config(key,value,description) VALUES
 ('demand_factor_by_size','[0.65,0.85,0.85,1,1,1,1]','Passenger demand multiplier by destination airport size 1–7 (hub-and-spoke).'),
 ('hub_fare_bonus_by_size','[0,0,0,0.05,0.15,0.25,0.35]','Ticket revenue bonus by destination airport size 1–7 (0.25 = +25%).')
ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.runway_is_unpaved(p_surface text, p_size integer, p_runway_ft integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $f$
  SELECT coalesce(p_size,1)<3 AND coalesce(p_runway_ft,0)<3500
    AND coalesce(p_surface,'') ~* '(gras|grs|turf|grav|^gre$|^g$|dirt|earth|ground|sand|coral|ice|snow|water|clay|soil|unpaved)'
$f$;
GRANT EXECUTE ON FUNCTION public.runway_is_unpaved(text,integer,integer) TO authenticated, service_role;
DO $migration$
DECLARE d text; old text;
BEGIN
  d := pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure);
  old := 'rules jsonb; BEGIN';
  IF position(old IN d)=0 THEN RAISE EXCEPTION 'declare anchor'; END IF;
  d := replace(d,old,'rules jsonb; raw_pax integer; dfac numeric; hub numeric; unpaved boolean := false; BEGIN');
  old := $o$RAISE EXCEPTION 'Origin runway is too short'; END IF;$o$;
  IF position(old IN d)=0 THEN RAISE EXCEPTION 'runway anchor'; END IF;
  d := replace(d,old,old||$n$ IF public.runway_is_unpaved(b.runway_surface,b.size,b.longest_runway_ft) AND NOT t.unpaved_capable THEN IF EXISTS(SELECT 1 FROM public.airports x WHERE x.icao<>b.icao AND x.lat BETWEEN b.lat-1.7 AND b.lat+1.7 AND x.lon BETWEEN b.lon-5 AND b.lon+5 AND NOT public.runway_is_unpaved(x.runway_surface,x.size,x.longest_runway_ft) AND (x.longest_runway_ft IS NULL OR x.longest_runway_ft>=t.minimum_runway_ft)) THEN RAISE EXCEPTION 'Unpaved runway — aircraft is not bush-capable'; END IF; unpaved:=true; END IF;$n$);
  old := $o$gross:=round(pax*(nm*economy_number('fare_per_nm')+(rules->'short_hop_charter'->>'rate')::numeric),2);$o$;
  IF position(old IN d)=0 THEN RAISE EXCEPTION 'gross anchor'; END IF;
  d := replace(d,old,$n$raw_pax:=pax; dfac:=least(1,greatest(0,coalesce((rules->'demand_factor_by_size'->>(b.size-1))::numeric,1))); hub:=greatest(0,coalesce((rules->'hub_fare_bonus_by_size'->>(b.size-1))::numeric,0)); pax:=round(raw_pax*dfac)::int; IF t.tier<=2 AND raw_pax>=1 THEN pax:=greatest(1,pax); END IF; gross:=round(pax*(nm*economy_number('fare_per_nm')+(rules->'short_hop_charter'->>'rate')::numeric)*(1+hub),2);$n$);
  old := $o$RETURN jsonb_build_object('short_hop_charter',$o$;
  IF position(old IN d)=0 THEN RAISE EXCEPTION 'return anchor'; END IF;
  d := replace(d,old,$n$RETURN jsonb_build_object('demand',jsonb_build_object('raw_passengers',raw_pax,'factor',dfac,'hub_bonus',hub,'destination_size',b.size),'runway_unpaved',unpaved,'short_hop_charter',$n$);
  EXECUTE d;
END $migration$;