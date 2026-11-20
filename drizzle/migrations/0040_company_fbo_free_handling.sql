CREATE OR REPLACE FUNCTION public.flight_quote(p_aircraft uuid,p_destination text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; cid uuid; origin text; o company_fobs%ROWTYPE; d company_fobs%ROWTYPE; fd numeric:=0; hd_o numeric:=0; hd_d numeric:=0; ld numeric:=0; md numeric:=0; fuel numeric; landing numeric; handling numeric; maintenance numeric; savings numeric;
BEGIN
 q:=flight_quote_without_fobs(p_aircraft,p_destination);
 SELECT company_id,location_icao INTO cid,origin FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN(SELECT id FROM companies WHERE user_id=auth.uid());
 SELECT * INTO o FROM company_fobs WHERE company_id=cid AND airport_icao=origin AND closed_at IS NULL;
 SELECT * INTO d FROM company_fobs WHERE company_id=cid AND airport_icao=p_destination AND closed_at IS NULL;
 IF coalesce(o.has_fuel_contract,false) THEN fd:=economy_number('fob_fuel_discount'); END IF;
 IF o.id IS NOT NULL THEN hd_o:=1; END IF;
 IF d.id IS NOT NULL THEN hd_d:=1; END IF;
 IF coalesce(d.has_handling_desk,false) THEN ld:=economy_number('fob_handling_discount'); END IF;
 IF coalesce(o.has_maintenance_bay,false) OR coalesce(d.has_maintenance_bay,false) THEN md:=economy_number('fob_maintenance_discount'); END IF;
 fuel:=round((q->>'fuel_cost')::numeric*(1-fd),2);
 landing:=round((q->>'landing_fee')::numeric*(1-ld),2);
 handling:=round((q->>'handling_fee')::numeric*(1-(hd_o+hd_d)/2),2);
 maintenance:=round((q->>'maintenance')::numeric*(1-md),2);
 savings:=(q->>'fuel_cost')::numeric+(q->>'landing_fee')::numeric+(q->>'handling_fee')::numeric+(q->>'maintenance')::numeric-fuel-landing-handling-maintenance;
 RETURN q||jsonb_build_object('fuel_cost',fuel,'landing_fee',landing,'handling_fee',handling,'maintenance',maintenance,'net',(q->>'revenue')::numeric-fuel-landing-handling-maintenance,'fob_discounts',jsonb_build_object('fuel',fd,'landing',ld,'handling_origin',hd_o,'handling_destination',hd_d,'handling_discount',(hd_o+hd_d)/2,'handling_savings',(q->>'handling_fee')::numeric-handling,'maintenance',md,'savings',savings));
END $$;
-- Keep the private baseline quote and all existing settlement validation/tip/pilot integration.
DO $$ DECLARE definition text; updated text; BEGIN
 definition:=pg_get_functiondef('public.settle_flight(uuid,jsonb)'::regprocedure);
 updated:=replace(definition,'LOOP delta:=item.change;', 'LOOP IF item.change=0 THEN CONTINUE; END IF; delta:=item.change;');
 IF updated=definition THEN RAISE EXCEPTION 'Missing settlement zero-value integration point'; END IF;
 EXECUTE updated;
END $$;