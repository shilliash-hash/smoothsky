-- CR-10: Special mission rebalance (manual deployment).
-- 30 live open missions; payouts derived from live economy rates × urgency multipliers (AOG 2.5 default).
-- Existing missions keep their frozen payouts.

INSERT INTO public.economy_config(key, value, description) VALUES
  ('special_mission_open_target', '30', 'Number of OPEN special missions maintained on the board'),
  ('special_mission_aog_multiplier', '2.5', 'AOG payout multiplier over live cargo rate'),
  ('special_mission_medevac_multiplier', '1.7', 'MEDEVAC payout multiplier over live cargo rate'),
  ('special_mission_aog_base_fee', '6000', 'AOG fixed mobilization fee (SC)'),
  ('special_mission_medevac_base_fee', '1800', 'MEDEVAC fixed mobilization fee (SC)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.special_mission_payout(p_category text, p_nm numeric, p_cargo_kg numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT round(
    coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key = CASE WHEN p_category='AOG' THEN 'special_mission_aog_base_fee' ELSE 'special_mission_medevac_base_fee' END), CASE WHEN p_category='AOG' THEN 6000 ELSE 1800 END)
    + coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key='fare_per_nm'), 0.18)
      * greatest(p_nm, 0)
      * coalesce((SELECT cargo_pax_rate_ratio FROM operating_rules WHERE singleton), 1)
      * greatest(p_cargo_kg, 0) / 100
      * coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key = CASE WHEN p_category='AOG' THEN 'special_mission_aog_multiplier' ELSE 'special_mission_medevac_multiplier' END), CASE WHEN p_category='AOG' THEN 2.5 ELSE 1.7 END)
  );
$$;
REVOKE ALL ON FUNCTION public.special_mission_payout(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.special_mission_payout(text, numeric, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_special_missions()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE open_count int; target int; a airports%ROWTYPE; b airports%ROWTYPE; nm numeric; cat text; kg int; tries int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('smoothsky.special_missions'));
  PERFORM release_stale_special_missions();
  UPDATE special_missions SET status='EXPIRED' WHERE status='OPEN' AND expires_at < now();
  SELECT least(100, greatest(0, coalesce((SELECT (value#>>'{}')::int FROM economy_config WHERE key='special_mission_open_target'), 30))) INTO target;
  SELECT count(*) INTO open_count FROM special_missions WHERE status='OPEN';
  WHILE open_count < target AND tries < target * 5 LOOP
    tries := tries + 1;
    cat := CASE WHEN random() < 0.5 THEN 'MEDEVAC' ELSE 'AOG' END;
    SELECT * INTO a FROM airports
      WHERE size >= CASE WHEN cat='AOG' THEN 3 ELSE 2 END
        AND coalesce(longest_runway_ft, 4000) >= CASE WHEN cat='AOG' THEN 3000 ELSE 1500 END
        AND airport_type NOT IN ('closed','heliport')
      ORDER BY random() LIMIT 1;
    IF NOT FOUND THEN EXIT; END IF;
    SELECT x.* INTO b FROM airports x
      WHERE x.icao <> a.icao AND x.size >= CASE WHEN cat='AOG' THEN 3 ELSE 2 END
        AND x.airport_type NOT IN ('closed','heliport')
        AND coalesce(x.longest_runway_ft, 4000) >= CASE WHEN cat='AOG' THEN 3000 ELSE 1500 END
        AND x.lat BETWEEN a.lat-6 AND a.lat+6 AND x.lon BETWEEN a.lon-10 AND a.lon+10
        AND 3440.065*2*asin(sqrt(least(1,power(sin(radians(x.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(x.lat))*power(sin(radians(x.lon-a.lon)/2),2)))) BETWEEN 80 AND CASE WHEN cat='AOG' THEN 600 ELSE 350 END
      ORDER BY random() LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    nm := 3440.065*2*asin(sqrt(least(1,power(sin(radians(b.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lon-a.lon)/2),2))));
    kg := CASE WHEN cat='MEDEVAC' THEN 150 + floor(random()*151)::int ELSE 1500 + floor(random()*1501)::int END;
    INSERT INTO special_missions(category,origin_icao,destination_icao,distance_nm,cargo_kg,payout,deadline_hours)
    VALUES (cat, a.icao, b.icao, round(nm,1), kg,
      special_mission_payout(cat, nm, kg) * (0.9 + random()*0.2),
      CASE WHEN cat='MEDEVAC' THEN 2 + floor(random()*3)/2 ELSE 4 END);
    open_count := open_count + 1;
  END LOOP;
END $function$;
