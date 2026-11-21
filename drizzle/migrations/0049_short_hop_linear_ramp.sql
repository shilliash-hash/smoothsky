INSERT INTO public.economy_config(key,value,description) VALUES
 ('short_hop_threshold_nm','80','Routes shorter than this (NM) pay a reduced charter surcharge that ramps linearly up to 100% at the threshold.'),
 ('short_hop_min_multiplier','0.2','Charter surcharge fraction at 0 NM (0.20 = 20%); rises linearly to 100% at the short-hop threshold.')
ON CONFLICT (key) DO UPDATE SET description=excluded.description;
UPDATE public.economy_config SET description='DEPRECATED: replaced by short_hop_min_multiplier linear ramp.' WHERE key='short_hop_charter_multiplier';
DO $migration$
DECLARE definition text; old text; ramp text;
BEGIN
  definition := pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure);
  old := $o$'short_hop_charter_multiplier',coalesce((rules->>'short_hop_charter_multiplier')::numeric,0.5));$o$;
  IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Unexpected short-hop rules definition'; END IF;
  definition := replace(definition,old,$n$'short_hop_charter_multiplier',coalesce((rules->>'short_hop_charter_multiplier')::numeric,0.5),'short_hop_min_multiplier',least(1,greatest(0,coalesce((rules->>'short_hop_min_multiplier')::numeric,0.2))));$n$);
  old := $o$CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN (rules->>'short_hop_charter_multiplier')::numeric ELSE 1 END$o$;
  IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Unexpected short-hop multiplier definition'; END IF;
  ramp := $r$CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN round((rules->>'short_hop_min_multiplier')::numeric+(1-(rules->>'short_hop_min_multiplier')::numeric)*nm/(rules->>'short_hop_threshold_nm')::numeric,4) ELSE 1 END$r$;
  definition := replace(definition,old,ramp);
  EXECUTE definition;
END $migration$;