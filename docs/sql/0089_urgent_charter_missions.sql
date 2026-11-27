-- CR-11: Urgent Charter Missions (VIP & Group) on the special missions board (manual deployment, after 0088).
-- Charter = exclusive cabin: mission PAX + their baggage only, no scheduled PAX, no freight.
-- Payout = mobilization fee + multiplier × (PAX × NM × fare_per_nm); frozen at generation, exempt from corridor saturation.

ALTER TABLE public.special_missions ADD COLUMN IF NOT EXISTS passengers integer NOT NULL DEFAULT 0 CHECK (passengers >= 0);
ALTER TABLE public.special_missions DROP CONSTRAINT IF EXISTS special_missions_category_check;
ALTER TABLE public.special_missions ADD CONSTRAINT special_missions_category_check CHECK (category IN ('MEDEVAC','AOG','CHARTER'));

INSERT INTO public.economy_config(key, value, description) VALUES
  ('charter_payout_multiplier', '1.35', 'Charter payout multiplier over standard passenger fare (1.1–2.0)'),
  ('charter_vip_base_fee', '2500', 'VIP charter fixed mobilization fee (SC)'),
  ('charter_group_base_fee', '8000', 'Group charter fixed mobilization fee (SC)'),
  ('charter_mission_share', '0.34', 'Share of newly generated special missions that are charters (0–1)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.charter_mission_payout(p_pax integer, p_nm numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT round(
    coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key = CASE WHEN p_pax <= 20 THEN 'charter_vip_base_fee' ELSE 'charter_group_base_fee' END), CASE WHEN p_pax <= 20 THEN 2500 ELSE 8000 END)
    + coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key='fare_per_nm'), 0.18) * greatest(p_nm,0) * greatest(p_pax,0)
      * coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key='charter_payout_multiplier'), 1.35)
  );
$$;
REVOKE ALL ON FUNCTION public.charter_mission_payout(integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charter_mission_payout(integer, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_special_missions()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE open_count int; target int; a airports%ROWTYPE; b airports%ROWTYPE; nm numeric; cat text; kg int; pax int; tries int := 0;
  vip boolean; min_size int; min_rwy int; min_nm numeric; max_nm numeric; box_lat numeric; box_lon numeric; share numeric; pay numeric; dl numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('smoothsky.special_missions'));
  PERFORM release_stale_special_missions();
  UPDATE special_missions SET status='EXPIRED' WHERE status='OPEN' AND expires_at < now();
  SELECT least(100, greatest(0, coalesce((SELECT (value#>>'{}')::int FROM economy_config WHERE key='special_mission_open_target'), 30))) INTO target;
  share := least(1, greatest(0, coalesce((SELECT (value#>>'{}')::numeric FROM economy_config WHERE key='charter_mission_share'), 0.34)));
  SELECT count(*) INTO open_count FROM special_missions WHERE status='OPEN';
  WHILE open_count < target AND tries < target * 5 LOOP
    tries := tries + 1;
    cat := CASE WHEN random() < share THEN 'CHARTER' WHEN random() < 0.5 THEN 'MEDEVAC' ELSE 'AOG' END;
    vip := random() < 0.6;
    IF cat = 'CHARTER' THEN
      min_size := CASE WHEN vip THEN 3 ELSE 4 END; min_rwy := CASE WHEN vip THEN 3500 ELSE 5500 END;
      min_nm := CASE WHEN vip THEN 150 ELSE 250 END; max_nm := CASE WHEN vip THEN 900 ELSE 1400 END;
      box_lat := 25; box_lon := 35;
    ELSE
      min_size := CASE WHEN cat='AOG' THEN 3 ELSE 2 END; min_rwy := CASE WHEN cat='AOG' THEN 3000 ELSE 1500 END;
      min_nm := 80; max_nm := CASE WHEN cat='AOG' THEN 600 ELSE 350 END;
      box_lat := 6; box_lon := 10;
    END IF;
    SELECT * INTO a FROM airports
      WHERE size >= min_size AND coalesce(longest_runway_ft, 4000) >= min_rwy AND airport_type NOT IN ('closed','heliport')
      ORDER BY random() LIMIT 1;
    IF NOT FOUND THEN EXIT; END IF;
    SELECT x.* INTO b FROM airports x
      WHERE x.icao <> a.icao AND x.size >= min_size AND x.airport_type NOT IN ('closed','heliport')
        AND coalesce(x.longest_runway_ft, 4000) >= min_rwy
        AND x.lat BETWEEN a.lat-box_lat AND a.lat+box_lat AND x.lon BETWEEN a.lon-box_lon AND a.lon+box_lon
        AND 3440.065*2*asin(sqrt(least(1,power(sin(radians(x.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(x.lat))*power(sin(radians(x.lon-a.lon)/2),2)))) BETWEEN min_nm AND max_nm
      ORDER BY random() LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    nm := 3440.065*2*asin(sqrt(least(1,power(sin(radians(b.lat-a.lat)/2),2)+cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lon-a.lon)/2),2))));
    IF cat = 'CHARTER' THEN
      pax := CASE WHEN vip THEN 6 + floor(random()*9)::int ELSE 45 + floor(random()*106)::int END;
      kg := pax * CASE WHEN vip THEN 25 ELSE 18 END;
      pay := charter_mission_payout(pax, nm);
      dl := round((CASE WHEN vip THEN 2 ELSE 3 END + nm / CASE WHEN vip THEN 250 ELSE 350 END) * 2) / 2;
    ELSE
      pax := 0;
      kg := CASE WHEN cat='MEDEVAC' THEN 150 + floor(random()*151)::int ELSE 1500 + floor(random()*1501)::int END;
      pay := special_mission_payout(cat, nm, kg);
      dl := CASE WHEN cat='MEDEVAC' THEN 2 + floor(random()*3)/2 ELSE 4 END;
    END IF;
    INSERT INTO special_missions(category,origin_icao,destination_icao,distance_nm,cargo_kg,passengers,payout,deadline_hours)
    VALUES (cat, a.icao, b.icao, round(nm,1), kg, pax, pay * (0.9 + random()*0.2), dl);
    open_count := open_count + 1;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.accept_special_mission(p_mission uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m special_missions%ROWTYPE; bonus numeric; best numeric; ready boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
  PERFORM release_stale_special_missions();
  IF EXISTS (SELECT 1 FROM special_missions WHERE accepted_by=auth.uid() AND status='ACCEPTED') THEN
    RAISE EXCEPTION 'Complete or abandon your current special mission first';
  END IF;
  SELECT * INTO m FROM special_missions WHERE id=p_mission FOR UPDATE;
  IF NOT FOUND OR m.status <> 'OPEN' OR m.expires_at < now() THEN RAISE EXCEPTION 'Mission is no longer available'; END IF;
  IF m.category = 'CHARTER' THEN
    SELECT max(t.pax),
           coalesce(bool_or(fa.location_icao = m.origin_icao AND fa.status = 'AVAILABLE' AND t.pax >= m.passengers AND t.cargo_kg >= m.cargo_kg), false)
      INTO best, ready
      FROM fleet_aircraft fa JOIN companies c ON c.id = fa.company_id JOIN aircraft_types t ON t.id = fa.aircraft_type_id
     WHERE c.user_id = auth.uid() AND NOT c.is_personal AND fa.returned_at IS NULL;
    IF coalesce(best, 0) < m.passengers THEN
      RAISE EXCEPTION 'Requires an aircraft seating at least % passengers (fleet max: %)', m.passengers, coalesce(best, 0);
    END IF;
    IF NOT coalesce(ready, false) THEN
      RAISE EXCEPTION 'Requires an available aircraft at % seating % passengers with % kg baggage — reposition one there first', m.origin_icao, m.passengers, m.cargo_kg;
    END IF;
  ELSE
    bonus := coalesce((SELECT all_cargo_capacity_bonus FROM operating_rules LIMIT 1), 0.5);
    SELECT max(t.cargo_kg * (1 + bonus)),
           coalesce(bool_or(fa.location_icao = m.origin_icao AND fa.status = 'AVAILABLE' AND t.cargo_kg * (1 + bonus) >= m.cargo_kg), false)
      INTO best, ready
      FROM fleet_aircraft fa JOIN companies c ON c.id = fa.company_id JOIN aircraft_types t ON t.id = fa.aircraft_type_id
     WHERE c.user_id = auth.uid() AND NOT c.is_personal AND fa.returned_at IS NULL;
    IF coalesce(best, 0) < m.cargo_kg THEN
      RAISE EXCEPTION 'Requires an aircraft carrying at least % kg (fleet max: % kg)', m.cargo_kg, floor(coalesce(best, 0));
    END IF;
    IF NOT coalesce(ready, false) THEN
      RAISE EXCEPTION 'Requires an available aircraft at % carrying at least % kg — reposition one there first', m.origin_icao, m.cargo_kg;
    END IF;
  END IF;
  UPDATE special_missions SET status='ACCEPTED', accepted_by=auth.uid(), accepted_at=now(),
    deadline_at = now() + make_interval(secs => (m.deadline_hours*3600)::double precision)
  WHERE id=m.id;
END $function$;

-- Quote: charter branch carries mission PAX + baggage only (exclusive cabin), full landing fee, no cargo discount.
CREATE OR REPLACE FUNCTION public.flight_quote_cargo(p_aircraft uuid, p_destination text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q jsonb; opt jsonb := nullif(current_setting('smoothsky.cargo', true),'')::jsonb; r operating_rules%ROWTYPE;
  f fleet_aircraft%ROWTYPE; t aircraft_types%ROWTYPE; m special_missions%ROWTYPE; all_cargo boolean; want numeric; cap numeric; kg numeric := 0;
  pax int; fare numeric; cargo_rev numeric := 0; revenue numeric; landing numeric; handling numeric; hd numeric; mission uuid;
BEGIN
  q := flight_quote(p_aircraft, p_destination);
  q := q || jsonb_build_object('rules',coalesce(q->'rules','{}'::jsonb) || (SELECT jsonb_build_object('butter_landing_max_fpm',butter_landing_max_fpm,'smooth_landing_min_fpm',smooth_landing_min_fpm,'smooth_landing_max_fpm',smooth_landing_max_fpm,'butter_tip_rate',butter_tip_rate,'smooth_tip_rate',smooth_tip_rate) FROM public.operating_rules WHERE singleton));
  IF opt IS NULL THEN RETURN public.finalize_flight_weight(q || jsonb_build_object('cargo_kg',0,'cargo_revenue',0,'ticket_revenue',q->'revenue','all_cargo',false)); END IF;
  SELECT * INTO r FROM operating_rules WHERE singleton;
  SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft;
  SELECT * INTO t FROM aircraft_types WHERE id=f.aircraft_type_id;
  mission := nullif(opt->>'mission','')::uuid;
  hd := ((coalesce((q->'fob_discounts'->>'handling_origin')::numeric,0)+coalesce((q->'fob_discounts'->>'handling_destination')::numeric,0))/2);
  IF mission IS NOT NULL THEN
    SELECT * INTO m FROM special_missions WHERE id=mission AND accepted_by=auth.uid();
    IF NOT FOUND OR m.status <> 'ACCEPTED' THEN RAISE EXCEPTION 'Mission not accepted by you'; END IF;
    IF m.origin_icao <> f.location_icao OR m.destination_icao <> p_destination THEN RAISE EXCEPTION 'Aircraft must fly % → % for this mission', m.origin_icao, m.destination_icao; END IF;
    IF m.category = 'CHARTER' THEN
      IF t.pax < m.passengers THEN RAISE EXCEPTION 'Aircraft seats too few passengers for this charter (% needed)', m.passengers; END IF;
      IF t.cargo_kg < m.cargo_kg THEN RAISE EXCEPTION 'Aircraft hold is too small for charter baggage (% kg needed)', m.cargo_kg; END IF;
      IF m.passengers*(q->'weight_budget'->>'passenger_weight_kg')::numeric + m.cargo_kg > (q->'weight_budget'->>'available_payload_kg')::numeric THEN
        RAISE EXCEPTION 'Charter payload exceeds MTOW with trip fuel and reserve';
      END IF;
      landing := (q->>'landing_fee')::numeric;
      handling := round(m.payout*economy_number('handling_rate')*2*(1-hd),2);
      RETURN public.finalize_flight_weight(q || jsonb_build_object('passengers',m.passengers,'cargo_kg',m.cargo_kg,'cargo_revenue',0,'ticket_revenue',m.payout,'revenue',m.payout,'all_cargo',false,
        'mission_id',m.id,'mission_category',m.category,'charter_exclusive',true,'landing_fee',landing,'handling_fee',handling,
        'net',m.payout-(q->>'fuel_cost')::numeric-landing-handling-(q->>'maintenance')::numeric));
    END IF;
    IF m.cargo_kg>(q->'weight_budget'->>'available_payload_kg')::numeric THEN RAISE EXCEPTION 'Mission payload exceeds MTOW with trip fuel and reserve'; END IF; IF t.cargo_kg*(1+r.all_cargo_capacity_bonus) < m.cargo_kg THEN RAISE EXCEPTION 'Aircraft cargo capacity is too small for this mission (% kg needed)', m.cargo_kg; END IF;
    landing := CASE WHEN m.category='MEDEVAC' THEN 0 ELSE round((q->>'landing_fee')::numeric*(1-r.cargo_airport_fee_discount),2) END;
    handling := CASE WHEN m.category='MEDEVAC' THEN 0 ELSE round(m.payout*economy_number('handling_rate')*2*(1-hd)*(1-r.cargo_airport_fee_discount),2) END;
    RETURN public.finalize_flight_weight(q || jsonb_build_object('passengers',0,'cargo_kg',m.cargo_kg,'cargo_revenue',m.payout,'ticket_revenue',0,'revenue',m.payout,'all_cargo',true,
      'mission_id',m.id,'mission_category',m.category,'landing_fee',landing,'handling_fee',handling,
      'net',m.payout-(q->>'fuel_cost')::numeric-landing-handling-(q->>'maintenance')::numeric));
  END IF;
  all_cargo := coalesce((opt->>'all_cargo')::boolean,false);
  want := greatest(0, coalesce((opt->>'cargo_kg')::numeric,0));
  cap := t.cargo_kg * CASE WHEN all_cargo THEN 1+r.all_cargo_capacity_bonus ELSE 1 END;
  kg := floor(least(want, least(cap,cargo_stock(f.location_icao))*(q->'saturation'->'cargo'->>'factor')::numeric,greatest(0,(q->'weight_budget'->>'available_payload_kg')::numeric-CASE WHEN all_cargo THEN 0 ELSE (q->>'passengers')::int*(q->'weight_budget'->>'passenger_weight_kg')::numeric END)));
  fare := (q->>'distance_nm')::numeric*(q->'rules'->>'fare_per_nm')::numeric + (q->'short_hop_charter'->>'rate')::numeric;
  cargo_rev := round(kg/100*r.cargo_pax_rate_ratio*fare,2);
  pax := CASE WHEN all_cargo THEN 0 ELSE (q->>'passengers')::int END;
  revenue := CASE WHEN all_cargo THEN cargo_rev ELSE (q->>'revenue')::numeric + cargo_rev END;
  IF all_cargo THEN
    landing := round((q->>'landing_fee')::numeric*(1-r.cargo_airport_fee_discount),2);
    handling := round(revenue*economy_number('handling_rate')*2*(1-hd)*(1-r.cargo_airport_fee_discount),2);
  ELSE
    landing := (q->>'landing_fee')::numeric;
    handling := round(revenue*economy_number('handling_rate')*2*(1-hd),2);
  END IF;
  RETURN public.finalize_flight_weight(q || jsonb_build_object('passengers',pax,'cargo_kg',kg,'cargo_capacity_kg',cap,'cargo_revenue',cargo_rev,
    'ticket_revenue',CASE WHEN all_cargo THEN 0 ELSE (q->>'revenue')::numeric END,'revenue',revenue,'all_cargo',all_cargo,
    'landing_fee',landing,'handling_fee',handling,
    'net',revenue-(q->>'fuel_cost')::numeric-landing-handling-(q->>'maintenance')::numeric));
END $function$;
