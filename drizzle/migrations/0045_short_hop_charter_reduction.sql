DO $migration$
DECLARE definition text; old text; replacement text;
BEGIN
  definition := pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure);
  old := 'gross:=round(pax*(nm*economy_number(''fare_per_nm'')+coalesce((rules->''charter_by_tier''->>(t.tier-1))::numeric,0)),2);';
  replacement := $patch$rules := rules || jsonb_build_object('short_hop_threshold_nm',coalesce((rules->>'short_hop_threshold_nm')::numeric,80),'short_hop_charter_multiplier',coalesce((rules->>'short_hop_charter_multiplier')::numeric,0.5));
  rules := rules || jsonb_build_object('short_hop_charter',jsonb_build_object(
    'base_rate',coalesce((rules->'charter_by_tier'->>(t.tier-1))::numeric,0),
    'rate',coalesce((rules->'charter_by_tier'->>(t.tier-1))::numeric,0)*CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN (rules->>'short_hop_charter_multiplier')::numeric ELSE 1 END,
    'multiplier',CASE WHEN nm<(rules->>'short_hop_threshold_nm')::numeric THEN (rules->>'short_hop_charter_multiplier')::numeric ELSE 1 END,
    'threshold_nm',(rules->>'short_hop_threshold_nm')::numeric,
    'reduced',nm<(rules->>'short_hop_threshold_nm')::numeric));
  gross:=round(pax*(nm*economy_number('fare_per_nm')+(rules->'short_hop_charter'->>'rate')::numeric),2);$patch$;
  IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Unexpected base quote revenue definition'; END IF;
  definition := replace(definition,old,replacement);
  old := 'jsonb_build_object(''distance_nm'',round(nm,2)';
  IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Unexpected base quote return definition'; END IF;
  definition := replace(definition,old,'jsonb_build_object(''short_hop_charter'',rules->''short_hop_charter'',''distance_nm'',round(nm,2)');
  EXECUTE definition;

  definition := pg_get_functiondef('public.flight_quote_cargo(uuid,text)'::regprocedure);
  old := 'fare := (q->>''distance_nm'')::numeric*(q->''rules''->>''fare_per_nm'')::numeric + coalesce((q->''rules''->''charter_by_tier''->>(t.tier-1))::numeric,0);';
  IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cargo fare definition'; END IF;
  definition := replace(definition,old,'fare := (q->>''distance_nm'')::numeric*(q->''rules''->>''fare_per_nm'')::numeric + (q->''short_hop_charter''->>''rate'')::numeric;');
  EXECUTE definition;
END $migration$;