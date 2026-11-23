DO $patch$
DECLARE src text; old text; name text;
BEGIN
 src:=pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure);
 old:='''distance_nm'',round(nm,2)';
 IF position(old IN src)=0 THEN RAISE EXCEPTION 'Ticket precision anchor missing'; END IF;
 src:=replace(src,old,'''ticket_unit_revenue'',(nm*economy_number(''fare_per_nm'')+(rules->''short_hop_charter''->>''rate'')::numeric)*(1+hub),'||old);
 EXECUTE src;
 src:=pg_get_functiondef('public.flight_quote_loaded(uuid,text,integer,boolean,uuid,numeric,integer)'::regprocedure);
 src:=replace(src,'''ticket_unit_revenue'',fare*(1+coalesce((q->''demand''->>''hub_bonus'')::numeric,0))','''ticket_unit_revenue'',(q->>''ticket_unit_revenue'')::numeric');
 EXECUTE src;
 src:=pg_get_functiondef('public.dispatch_destination_estimate(uuid,text,integer,boolean)'::regprocedure);
 old:='IF NOT ferry AND';
 IF position(old IN src)=0 THEN RAISE EXCEPTION 'Discovery payload anchor missing'; END IF;
 src:=replace(src,old,'IF current_setting(''smoothsky.loaded_discovery'',true)=''1'' AND ((q->>''cargo_kg'')::numeric<>greatest(coalesce(p_cargo_kg,0),0) OR (NOT p_all_cargo AND nullif(current_setting(''smoothsky.passengers'',true),'''') IS NOT NULL AND (q->>''passengers'')::int<>nullif(current_setting(''smoothsky.passengers'',true),'''')::int)) THEN RETURN jsonb_build_object(''estimated_revenue'',NULL,''estimated_margin'',NULL,''estimate_error'',''Selected payload unavailable: demand, stock or MTOW limit''); END IF; '||old);
 EXECUTE src;
 FOREACH name IN ARRAY ARRAY['public.get_dispatch_destination_deals_loaded(uuid,integer[],text,integer,boolean,integer,numeric)','public.get_destination_alternatives_loaded(uuid,text,numeric,integer[],integer,boolean,integer,numeric)'] LOOP
  src:=pg_get_functiondef(name::regprocedure);
  src:=replace(src,'PERFORM public.set_selected_passengers(p_passengers);','PERFORM public.set_selected_passengers(p_passengers); PERFORM set_config(''smoothsky.loaded_discovery'',''1'',true);');
  src:=replace(src,'PERFORM set_config(''smoothsky.passengers'','''',true);','PERFORM set_config(''smoothsky.passengers'','''',true); PERFORM set_config(''smoothsky.loaded_discovery'','''',true);');
  EXECUTE src;
 END LOOP;
END $patch$;