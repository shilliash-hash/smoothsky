-- Manual deployment after 0068. No new tables or scheduler. Existing flights retain frozen prices.
BEGIN;
CREATE OR REPLACE FUNCTION public.airport_fuel_cycle_multiplier(p_icao text,p_at timestamptz DEFAULT now())
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH seed AS (SELECT abs(hashtext(upper(trim(p_icao)))::bigint) s),
 cfg AS (SELECT 5.0+(s%2001)/1000.0 period, (s%1000000)/1000000.0*2*pi() phase,
 least(0.5,greatest(0,economy_number_or('fuel_price_volatility_pct',0.15))) volatility FROM seed),
 wave AS (SELECT *, least(volatility,0.04*period/(2*pi()+0.04*period)) amplitude FROM cfg)
 SELECT (1+amplitude*sin(2*pi()*extract(epoch FROM p_at)/86400.0/period+phase))::numeric FROM wave
$$;
REVOKE ALL ON FUNCTION public.airport_fuel_cycle_multiplier(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.airport_fuel_cycle_multiplier(text,timestamptz) TO service_role;
-- Keep the date signature for callers explicitly requesting historical UTC dates.
CREATE OR REPLACE FUNCTION public.airport_fuel_market_multiplier(p_icao text,p_day date DEFAULT (now() AT TIME ZONE 'UTC')::date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT airport_fuel_cycle_multiplier(p_icao,p_day::timestamp AT TIME ZONE 'UTC')
$$;
CREATE OR REPLACE FUNCTION public.airport_fuel_market_price(p_icao text,p_fuel text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT economy_number(CASE WHEN p_fuel='100LL' THEN 'fuel_price_100ll' ELSE 'fuel_price_jeta' END)*airport_fuel_cycle_multiplier(p_icao)
$$;
CREATE OR REPLACE FUNCTION public.airport_fuel_trend(p_icao text,p_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH prices AS (SELECT airport_fuel_cycle_multiplier(p_icao,p_at) current,
 airport_fuel_cycle_multiplier(p_icao,p_at+interval '24 hours') next24,
 airport_fuel_cycle_multiplier(p_icao,p_at+interval '48 hours') next48),
 deltas AS (SELECT (next24/current-1)*100 d24,(next48/current-1)*100 d48 FROM prices)
 SELECT jsonb_build_object('fuel_trend',CASE WHEN d24>1.5 THEN 'up' WHEN d24 < -1.5 THEN 'down' ELSE 'flat' END,
 'delta_pct_24h',d24,'delta_pct_48h',d48) FROM deltas
$$;
REVOKE ALL ON FUNCTION public.airport_fuel_trend(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.airport_fuel_trend(text,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.flight_fuel_market(p_company uuid,p_origin text,p_destination text,p_fuel text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE op numeric; dp numeric; om numeric; dm numeric; od numeric:=0; dd numeric:=0; stock numeric;
BEGIN
 om:=airport_fuel_cycle_multiplier(p_origin); dm:=airport_fuel_cycle_multiplier(p_destination);
 IF EXISTS(SELECT 1 FROM company_fobs WHERE company_id=p_company AND airport_icao=p_origin AND closed_at IS NULL AND has_fuel_contract) THEN od:=economy_number_or('fob_fuel_discount',0.2); END IF;
 IF EXISTS(SELECT 1 FROM company_fobs WHERE company_id=p_company AND airport_icao=p_destination AND closed_at IS NULL AND has_fuel_contract) THEN dd:=economy_number_or('fob_fuel_discount',0.2); END IF;
 op:=airport_fuel_market_price(p_origin,p_fuel)*(1-od); dp:=airport_fuel_market_price(p_destination,p_fuel)*(1-dd); stock:=coalesce(airport_fuel_stock(p_destination,p_fuel),0);
 RETURN jsonb_build_object('utc_date',(now() AT TIME ZONE 'UTC')::date,'priced_at',now(),'pricing_model','smooth_cycle',
 'departure_trend',airport_fuel_trend(p_origin),'destination_trend',airport_fuel_trend(p_destination),
 'fuel_type',p_fuel,'departure_icao',p_origin,'destination_icao',p_destination,'departure_price',op,'destination_price',dp,
 'departure_deviation_pct',(om-1)*100,'destination_deviation_pct',(dm-1)*100,'departure_fbo_discount',od,'destination_fbo_discount',dd,
 'destination_fuel_available',stock>0,'destination_stock_gal',stock,'tankering_savings_per_gal',greatest(0,dp-op));
END $$;
REVOKE ALL ON FUNCTION public.airport_fuel_market_multiplier(text,date),public.airport_fuel_market_price(text,text),public.flight_fuel_market(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.airport_fuel_market_multiplier(text,date),public.airport_fuel_market_price(text,text),public.flight_fuel_market(uuid,text,text,text) TO service_role;
COMMIT;
