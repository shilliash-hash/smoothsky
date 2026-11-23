ALTER TABLE public.economy_config ADD CONSTRAINT fuel_price_volatility_bounds CHECK (key <> 'fuel_price_volatility_pct' OR (jsonb_typeof(value) = 'number' AND (value #>> '{}')::numeric BETWEEN 0 AND 0.50 AND mod((value #>> '{}')::numeric,0.01)=0));
CREATE OR REPLACE FUNCTION public.airport_fuel_market_multiplier(p_icao text, p_day date DEFAULT (now() AT TIME ZONE 'UTC')::date) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT 1 + ((abs(hashtext(upper(trim(p_icao)) || p_day::text)::bigint) % 2000001 - 1000000)::numeric / 1000000) * least(0.50,greatest(0,economy_number_or('fuel_price_volatility_pct',0.15)))
$$;
REVOKE ALL ON FUNCTION public.airport_fuel_market_multiplier(text,date) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.airport_fuel_market_price(p_icao text,p_fuel text) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT economy_number(CASE WHEN p_fuel='100LL' THEN 'fuel_price_100ll' ELSE 'fuel_price_jeta' END)*airport_fuel_market_multiplier(p_icao)
$$;
REVOKE ALL ON FUNCTION public.airport_fuel_market_price(text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.flight_fuel_market(p_company uuid,p_origin text,p_destination text,p_fuel text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE op numeric; dp numeric; om numeric; dm numeric; od numeric:=0; dd numeric:=0; stock numeric;
BEGIN
 om:=airport_fuel_market_multiplier(p_origin); dm:=airport_fuel_market_multiplier(p_destination);
 IF EXISTS(SELECT 1 FROM company_fobs WHERE company_id=p_company AND airport_icao=p_origin AND closed_at IS NULL AND has_fuel_contract) THEN od:=economy_number_or('fob_fuel_discount',0.2); END IF;
 IF EXISTS(SELECT 1 FROM company_fobs WHERE company_id=p_company AND airport_icao=p_destination AND closed_at IS NULL AND has_fuel_contract) THEN dd:=economy_number_or('fob_fuel_discount',0.2); END IF;
 op:=airport_fuel_market_price(p_origin,p_fuel)*(1-od); dp:=airport_fuel_market_price(p_destination,p_fuel)*(1-dd); stock:=coalesce(airport_fuel_stock(p_destination,p_fuel),0);
 RETURN jsonb_build_object('utc_date',(now() AT TIME ZONE 'UTC')::date,'fuel_type',p_fuel,'departure_icao',p_origin,'destination_icao',p_destination,'departure_price',op,'destination_price',dp,'departure_deviation_pct',(om-1)*100,'destination_deviation_pct',(dm-1)*100,'departure_fbo_discount',od,'destination_fbo_discount',dd,'destination_fuel_available',stock>0,'destination_stock_gal',stock,'tankering_savings_per_gal',greatest(0,dp-op));
END $$;
REVOKE ALL ON FUNCTION public.flight_fuel_market(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE d text; n text; old text; BEGIN
 SELECT pg_get_functiondef('public.flight_quote_without_fobs(uuid,text)'::regprocedure) INTO d;
 old:=$s$price:=economy_number(CASE WHEN t.fuel_type='100LL' THEN 'fuel_price_100ll' ELSE 'fuel_price_jeta' END);$s$;
 n:=replace(d,old,'price:=public.airport_fuel_market_price(a.icao,t.fuel_type);');
 IF n=d THEN RAISE EXCEPTION 'Quote price anchor missing'; END IF; EXECUTE n;
 SELECT pg_get_functiondef('public.flight_quote(uuid,text)'::regprocedure) INTO d;
 n:=replace(d,'RETURN q||jsonb_build_object(', $s$RETURN q||jsonb_build_object('fuel_market',public.flight_fuel_market(cid,origin,p_destination,(SELECT fuel_type FROM aircraft_types WHERE id=(SELECT aircraft_type_id FROM fleet_aircraft WHERE id=p_aircraft))),$s$);
 IF n=d THEN RAISE EXCEPTION 'FBO quote anchor missing'; END IF; EXECUTE n;
 SELECT pg_get_functiondef('public.divert_leg_quote(public.flights,text,numeric,boolean)'::regprocedure) INTO d;
 n:=replace(d,old,'price:=public.airport_fuel_market_price(o.icao,t.fuel_type);');
 IF n=d THEN RAISE EXCEPTION 'Continuation price anchor missing'; END IF;
 n:=replace(n,'IF NOT landing_only THEN
  q:=finalize_flight_weight(q);', 'IF NOT landing_only THEN
  q:=q||jsonb_build_object(''fuel_market'',public.flight_fuel_market(f.company_id,o.icao,b.icao,t.fuel_type));
  q:=finalize_flight_weight(q);');
 IF position('''fuel_market''' in n)=0 THEN RAISE EXCEPTION 'Continuation market anchor missing'; END IF; EXECUTE n;
END $$;