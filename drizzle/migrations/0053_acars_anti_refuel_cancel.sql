DO $migration$
DECLARE d text; old_line text := 'IF (p->>''phase'') NOT IN (''PREFLIGHT'',''TAXI'',''PARKED'') AND (p->>''fuel_gal'')::numeric > (prev->>''fuel_gal'')::numeric + greatest(2,cap*0.01) THEN RAISE EXCEPTION ''Implausible fuel increase in flight'' USING ERRCODE=''P0422''; END IF;';
new_line text := 'IF upper(coalesce(p->>''phase'',''''))<>ALL(ARRAY[''PREFLIGHT'',''PARKED'']) AND (p->>''fuel_gal'')::numeric > (prev->>''fuel_gal'')::numeric + greatest(2,cap*0.01) THEN
    UPDATE airport_passenger_pools SET stock=passenger_stock(airport_icao)+f.passengers,updated_at=now() WHERE airport_icao=f.origin_icao;
    IF coalesce((f.estimate->>''cargo_kg'')::numeric,0)>0 AND NOT EXISTS(SELECT 1 FROM special_missions WHERE flight_id=f.id) THEN
      INSERT INTO airport_cargo_pools(airport_icao,cargo_pool_kg) VALUES(f.origin_icao,cargo_stock(f.origin_icao)) ON CONFLICT DO NOTHING;
      UPDATE airport_cargo_pools SET cargo_pool_kg=cargo_stock(airport_icao)+(f.estimate->>''cargo_kg'')::numeric,updated_at=now() WHERE airport_icao=f.origin_icao;
    END IF;
    UPDATE flights SET status=''CANCELLED'',telemetry=coalesce(telemetry,''{}''::jsonb)||jsonb_build_object(''cancellation_reason'',''ILLEGAL_REFUEL_IN_FLIGHT'',''cancelled_at'',now(),''refuel_evidence'',jsonb_build_object(''phase'',p->>''phase'',''previous_fuel_gal'',(prev->>''fuel_gal'')::numeric,''reported_fuel_gal'',(p->>''fuel_gal'')::numeric,''tolerance_gal'',greatest(2,cap*0.01))) WHERE id=f.id;
    UPDATE fleet_aircraft SET status=CASE WHEN ownership=''RENTAL'' THEN ''RETURNED'' ELSE ''AVAILABLE'' END,returned_at=CASE WHEN ownership=''RENTAL'' THEN now() ELSE returned_at END,reserved_by=NULL,reserved_until=NULL,location_icao=f.origin_icao WHERE id=f.aircraft_id;
    RETURN jsonb_build_object(''ok'',false,''status'',''CANCELLED'',''reason'',''ILLEGAL_REFUEL_IN_FLIGHT'',''flight_id'',f.id,''flight_number'',f.flight_number);
  END IF;';
BEGIN
  SELECT pg_get_functiondef('public.acars_position(text,jsonb)'::regprocedure) INTO d;
  IF position(old_line IN d)=0 THEN RAISE EXCEPTION 'acars_position fuel guard not found'; END IF;
  EXECUTE replace(d, old_line, new_line);
END $migration$;