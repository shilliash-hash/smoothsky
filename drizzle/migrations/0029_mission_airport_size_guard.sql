CREATE OR REPLACE FUNCTION public.refresh_special_missions() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE open_count int; a airports%ROWTYPE; b airports%ROWTYPE; nm numeric; cat text; tries int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('smoothsky.special_missions'));
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