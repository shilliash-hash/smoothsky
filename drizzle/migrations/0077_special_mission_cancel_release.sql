CREATE OR REPLACE FUNCTION public.release_stale_special_missions() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE special_missions
     SET status='OPEN', accepted_by=NULL, accepted_at=NULL, deadline_at=NULL, expires_at=now() + interval '4 hours'
   WHERE status='ACCEPTED' AND flight_id IS NULL AND deadline_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_special_missions() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE open_count int; a airports%ROWTYPE; b airports%ROWTYPE; nm numeric; cat text; tries int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('smoothsky.special_missions'));
  PERFORM release_stale_special_missions();
  UPDATE special_missions SET status='EXPIRED' WHERE status='OPEN' AND expires_at < now();
  SELECT count(*) INTO open_count FROM special_missions WHERE status='OPEN';
  WHILE open_count < 12 AND tries < 60 LOOP
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
    INSERT INTO special_missions(category,origin_icao,destination_icao,distance_nm,cargo_kg,payout,deadline_hours)
    VALUES (cat, a.icao, b.icao, round(nm,1),
      CASE WHEN cat='MEDEVAC' THEN 150 + floor(random()*151)::int ELSE 1500 + floor(random()*1501)::int END,
      CASE WHEN cat='MEDEVAC' THEN round(1800 + nm*9 + random()*800) ELSE round(6000 + nm*28 + random()*3000) END,
      CASE WHEN cat='MEDEVAC' THEN 2 + floor(random()*3)/2 ELSE 4 END);
    open_count := open_count + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.accept_special_mission(p_mission uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m special_missions%ROWTYPE; bonus numeric; best numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
  PERFORM release_stale_special_missions();
  IF EXISTS (SELECT 1 FROM special_missions WHERE accepted_by=auth.uid() AND status='ACCEPTED') THEN
    RAISE EXCEPTION 'Complete or abandon your current special mission first';
  END IF;
  SELECT * INTO m FROM special_missions WHERE id=p_mission FOR UPDATE;
  IF NOT FOUND OR m.status <> 'OPEN' OR m.expires_at < now() THEN RAISE EXCEPTION 'Mission is no longer available'; END IF;
  bonus := coalesce((SELECT all_cargo_capacity_bonus FROM operating_rules LIMIT 1), 0.5);
  SELECT max(t.cargo_kg * (1 + bonus)) INTO best
    FROM fleet_aircraft fa
    JOIN companies c ON c.id = fa.company_id
    JOIN aircraft_types t ON t.id = fa.aircraft_type_id
   WHERE c.user_id = auth.uid() AND fa.returned_at IS NULL;
  IF coalesce(best, 0) < m.cargo_kg THEN
    RAISE EXCEPTION 'Requires an aircraft carrying at least % kg (fleet max: % kg)', m.cargo_kg, floor(coalesce(best, 0));
  END IF;
  UPDATE special_missions SET status='ACCEPTED', accepted_by=auth.uid(), accepted_at=now(),
    deadline_at = now() + make_interval(secs => (m.deadline_hours*3600)::double precision)
  WHERE id=m.id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_special_mission(p_mission uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m special_missions%ROWTYPE; fstatus text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
  SELECT * INTO m FROM special_missions WHERE id=p_mission AND accepted_by=auth.uid() FOR UPDATE;
  IF NOT FOUND OR m.status <> 'ACCEPTED' THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF m.flight_id IS NOT NULL THEN
    SELECT status INTO fstatus FROM flights WHERE id=m.flight_id;
    IF fstatus = 'DISPATCHED' THEN
      RAISE EXCEPTION 'Cancel the dispatched mission flight in Dispatch first, then abandon the mission';
    END IF;
    RAISE EXCEPTION 'The mission flight is already under way and cannot be abandoned';
  END IF;
  UPDATE special_missions
     SET status='OPEN', accepted_by=NULL, accepted_at=NULL, deadline_at=NULL, expires_at=now() + interval '4 hours'
   WHERE id=m.id;
END $$;

REVOKE ALL ON FUNCTION public.release_stale_special_missions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_special_missions() TO service_role;
REVOKE ALL ON FUNCTION public.cancel_special_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_special_mission(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_special_mission(uuid), public.refresh_special_missions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_special_mission(uuid), public.refresh_special_missions() TO authenticated, service_role;