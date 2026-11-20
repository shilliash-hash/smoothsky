ALTER TABLE public.operating_rules
 ADD COLUMN butter_landing_max_fpm numeric NOT NULL DEFAULT 100 CHECK (butter_landing_max_fpm >= 0),
 ADD COLUMN smooth_landing_min_fpm numeric NOT NULL DEFAULT 101 CHECK (smooth_landing_min_fpm >= 0),
 ADD COLUMN smooth_landing_max_fpm numeric NOT NULL DEFAULT 180 CHECK (smooth_landing_max_fpm >= smooth_landing_min_fpm),
 ADD COLUMN butter_tip_rate numeric NOT NULL DEFAULT 0.10 CHECK (butter_tip_rate BETWEEN 0 AND 1),
 ADD COLUMN smooth_tip_rate numeric NOT NULL DEFAULT 0.05 CHECK (smooth_tip_rate BETWEEN 0 AND 1);

ALTER TABLE public.company_ledger DROP CONSTRAINT company_ledger_entry_type_check;
ALTER TABLE public.company_ledger ADD CONSTRAINT company_ledger_entry_type_check CHECK (entry_type IN ('INITIAL_GRANT','LEASE_DEPOSIT','LEASE_PAYMENT','LEASE_DEPOSIT_REFUND','AIRCRAFT_PURCHASE','TICKET_REVENUE','FUEL_EXPENSE','AIRPORT_FEES','HANDLING_FEES','MAINTENANCE_RESERVE','FOB_SETUP','FOB_MODULE','FOB_UPKEEP','RESTRUCTURE_ASSETS','RESTRUCTURE_GRANT','PILOT_COMMISSION','PILOT_FUNDING','PILOT_FUNDING_REFUND','PERSONAL_PAYOUT','STAKE_SALE','STAKE_BUYBACK','DIVIDEND','USED_AIRCRAFT_SALE','SPOT_RENTAL','LEASE_TERMINATION_FEE','PASSENGER_TIP'));

-- Pure calculation; no caller-supplied financial values ever bypass settle_flight.
CREATE OR REPLACE FUNCTION public.passenger_landing_tip(p_source text,p_pax integer,p_telemetry jsonb,p_tickets numeric,p_rules jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE raw jsonb; fpm numeric; rate numeric:=0; rating text; amount numeric:=0;
BEGIN
 IF p_source <> 'ACARS_AGENT' THEN RETURN '{}'::jsonb; END IF;
 raw:=coalesce(nullif(p_telemetry->'landing_rate_fpm','null'::jsonb),p_telemetry->'pirep'->'landing_rate_fpm');
 IF jsonb_typeof(raw) IS DISTINCT FROM 'number' THEN RETURN '{}'::jsonb; END IF;
 fpm:=(raw #>> '{}')::numeric;
 IF abs(fpm)<=coalesce((p_rules->>'butter_landing_max_fpm')::numeric,100) THEN
  rating:='Butter Landing'; rate:=coalesce((p_rules->>'butter_tip_rate')::numeric,0.10);
 ELSIF abs(fpm) BETWEEN coalesce((p_rules->>'smooth_landing_min_fpm')::numeric,101) AND coalesce((p_rules->>'smooth_landing_max_fpm')::numeric,180) THEN
  rating:='Smooth Landing'; rate:=coalesce((p_rules->>'smooth_tip_rate')::numeric,0.05);
 ELSE rating:='Standard Landing'; END IF;
 IF coalesce(p_pax,0)<=0 THEN rate:=0; END IF;
 amount:=round(greatest(coalesce(p_tickets,0),0)*rate,2);
 RETURN jsonb_build_object('landing_rate_fpm',fpm,'landing_rating',rating,'passenger_tip',amount,'passenger_tip_pct',rate*100);
END $$;
REVOKE ALL ON FUNCTION public.passenger_landing_tip(text,integer,jsonb,numeric,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.passenger_landing_tip(text,integer,jsonb,numeric,jsonb) TO authenticated,service_role;

-- Preserve the existing quote and settlement contracts, changing only the tip integration points.
DO $$
DECLARE definition text; updated text;
BEGIN
 definition:=pg_get_functiondef('public.flight_quote_cargo(uuid,text)'::regprocedure);
 updated:=replace(definition,'q := flight_quote(p_aircraft, p_destination);',
 'q := flight_quote(p_aircraft, p_destination);
  q := q || jsonb_build_object(''rules'',coalesce(q->''rules'',''{}''::jsonb) || (SELECT jsonb_build_object(''butter_landing_max_fpm'',butter_landing_max_fpm,''smooth_landing_min_fpm'',smooth_landing_min_fpm,''smooth_landing_max_fpm'',smooth_landing_max_fpm,''butter_tip_rate'',butter_tip_rate,''smooth_tip_rate'',smooth_tip_rate) FROM public.operating_rules WHERE singleton));');
 IF updated=definition THEN RAISE EXCEPTION 'Missing flight quote snapshot integration point'; END IF;
 EXECUTE updated;
 definition:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure);
 updated:=replace(definition,'cut numeric:=0;', 'cut numeric:=0; tip jsonb; tip_amount numeric:=0;');
 updated:=replace(updated,'bal:=company_balance(c.id); FOR item',
 'tip:=public.passenger_landing_tip(f.execution_source,f.passengers,p_telemetry,coalesce((q->>''ticket_revenue'')::numeric,greatest(0,(q->>''revenue'')::numeric-coalesce((q->>''cargo_revenue'')::numeric,0))),q->''rules'');
 tip_amount:=coalesce((tip->>''passenger_tip'')::numeric,0);
 q:=q||tip||jsonb_build_object(''net'',(q->>''net'')::numeric+tip_amount);
 bal:=company_balance(c.id); FOR item');
 updated:=replace(updated,'END LOOP; PERFORM 1 FROM airport_passenger_pools',
 'END LOOP;
 IF tip_amount>0 THEN
  bal:=public.company_post(c.id,''PASSENGER_TIP'',''COMPANY_CASH'',''PASSENGER_REVENUE'',tip_amount,''Passenger tip – ''||f.flight_number||'' · ''||(SELECT registration FROM public.fleet_aircraft WHERE id=f.aircraft_id AND company_id=c.id)||'' · ''||f.origin_icao||'' → ''||f.destination_icao,f.id::text,''flight:''||f.id||'':PASSENGER_TIP'');
 END IF;
 PERFORM 1 FROM airport_passenger_pools');
 IF updated=definition OR position('tip:=public.passenger_landing_tip' IN updated)=0 OR position('IF tip_amount>0' IN updated)=0 THEN RAISE EXCEPTION 'Missing settlement integration point'; END IF;
 EXECUTE updated;
 definition:=pg_get_functiondef('public.aircraft_finance(uuid)'::regprocedure);
 updated:=replace(definition,'entry_type=''TICKET_REVENUE''','entry_type IN (''TICKET_REVENUE'',''PASSENGER_TIP'')');
 IF updated=definition THEN RAISE EXCEPTION 'Missing aircraft revenue integration point'; END IF;
 EXECUTE updated;
 definition:=pg_get_functiondef('public.company_daily_results()'::regprocedure);
 updated:=replace(definition,'entry_type=''TICKET_REVENUE''','entry_type IN (''TICKET_REVENUE'',''PASSENGER_TIP'')');
 IF updated=definition THEN RAISE EXCEPTION 'Missing daily revenue integration point'; END IF;
 EXECUTE updated;
END $$;