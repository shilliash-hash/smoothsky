CREATE OR REPLACE FUNCTION public.ramp_fuel_adjust(p_flight uuid, p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f flights; e jsonb; wb jsonb; sim numeric; tgt numeric; mx numeric; add numeric; price numeric; cost numeric; stock numeric; fuel text; n int;
BEGIN
 IF upper(coalesce(p->>'phase','')) NOT IN ('PREFLIGHT','TAXI','TAXI_OUT','TAKEOFF') THEN RETURN NULL; END IF;
 IF jsonb_typeof(p->'fuel_gal')<>'number' THEN RETURN NULL; END IF;
 SELECT * INTO f FROM flights WHERE id=p_flight FOR UPDATE;
 IF NOT FOUND OR f.status NOT IN ('DISPATCHED','EN_ROUTE') THEN RETURN NULL; END IF;
 e:=f.estimate; wb:=e->'weight_budget';
 IF NOT (e ? 'fuel_uplift_gal') OR wb IS NULL THEN RETURN NULL; END IF;
 sim:=(p->>'fuel_gal')::numeric; tgt:=(e->>'target_fuel_gal')::numeric;
 IF sim IS NULL OR tgt IS NULL OR sim<=tgt+1 THEN RETURN NULL; END IF;
 mx:=least((wb->>'fuel_capacity_gal')::numeric,((wb->>'mtow_kg')::numeric-(wb->>'empty_weight_kg')::numeric-coalesce((wb->>'payload_kg')::numeric,0))/(wb->>'fuel_kg_per_gal')::numeric);
 add:=round(least(sim,mx)-tgt,4);
 IF add IS NULL OR add<=0 THEN RETURN NULL; END IF;
 fuel:=e->>'fuel_type';
 price:=coalesce((e->>'fuel_uplift_price_per_gal')::numeric,(e->>'fuel_price_per_gal')::numeric*(1-coalesce((e->'fob_discounts'->>'fuel')::numeric,0)));
 INSERT INTO airport_fuel_pools(airport_icao,fuel_type,stock_gal) VALUES(f.origin_icao,fuel,airport_fuel_stock(f.origin_icao,fuel)) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM airport_fuel_pools WHERE airport_icao=f.origin_icao AND fuel_type=fuel FOR UPDATE;
 stock:=airport_fuel_stock(f.origin_icao,fuel);
 add:=least(add,greatest(0,stock));
 cost:=round(add*price,2);
 IF add<=0 OR company_balance(f.company_id)<cost THEN
  UPDATE flights SET estimate=e||jsonb_build_object('ramp_fuel_mismatch',jsonb_build_object('sim_fuel_gal',sim,'target_fuel_gal',tgt,'reason',CASE WHEN add<=0 THEN 'airport_stock' ELSE 'funds' END)) WHERE id=f.id;
  RETURN NULL;
 END IF;
 UPDATE airport_fuel_pools SET stock_gal=stock-add,updated_at=now() WHERE airport_icao=f.origin_icao AND fuel_type=fuel;
 n:=coalesce(jsonb_array_length(e->'ramp_adjustments'),0)+1;
 IF cost>0 THEN PERFORM company_post(f.company_id,'FUEL_EXPENSE','FUEL_EXPENSE','COMPANY_CASH',-cost,'Ramp fuel adjustment – '||round(add,1)||' gal · '||coalesce(f.flight_number,'flight')||' · '||f.origin_icao,f.id::text,'flight:'||f.id||':RAMP_FUEL:'||n); END IF;
 e:=e||jsonb_build_object('target_fuel_gal',tgt+add,'fuel_uplift_gal',(e->>'fuel_uplift_gal')::numeric+add,'fuel_uplift_cost',coalesce((e->>'fuel_uplift_cost')::numeric,0)+cost,'fuel_reserved_gal',coalesce((e->>'fuel_reserved_gal')::numeric,0)+add,
  'ramp_adjustments',coalesce(e->'ramp_adjustments','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'sim_fuel_gal',sim,'added_gal',add,'cost',cost,'phase',p->>'phase')),
  'weight_budget',wb||jsonb_build_object('planned_fuel_gal',tgt+add,'planned_fuel_kg',(tgt+add)*(wb->>'fuel_kg_per_gal')::numeric,'takeoff_weight_kg',coalesce((wb->>'takeoff_weight_kg')::numeric,0)+add*(wb->>'fuel_kg_per_gal')::numeric))-'ramp_fuel_mismatch';
 UPDATE flights SET estimate=e WHERE id=f.id;
 RETURN jsonb_build_object('added_gal',add,'cost',cost);
END $$;
REVOKE ALL ON FUNCTION public.ramp_fuel_adjust(uuid,jsonb) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.acars_position(text,jsonb)'::regprocedure);
 n:=replace(d,$a$'role','authenticated')::text,true); prev := f.telemetry->'live';$a$,$a$'role','authenticated')::text,true); PERFORM public.ramp_fuel_adjust(f.id,p); SELECT * INTO f FROM flights WHERE id=f.id; prev := f.telemetry->'live';$a$);
 IF n=d THEN RAISE EXCEPTION 'acars_position ramp patch failed'; END IF;
 EXECUTE n;
END $$;