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
   WHERE c.user_id = auth.uid() AND NOT c.is_personal AND fa.returned_at IS NULL;
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
    ELSIF fstatus = 'DIVERTED' THEN
      RAISE EXCEPTION 'Resolve the divert in Dispatch: continue the leg, or abandon the flight to release the mission';
    END IF;
    RAISE EXCEPTION 'The mission flight is already under way and cannot be abandoned';
  END IF;
  UPDATE special_missions
     SET status='OPEN', accepted_by=NULL, accepted_at=NULL, deadline_at=NULL, expires_at=now() + interval '4 hours'
   WHERE id=m.id;
END $$;

REVOKE ALL ON FUNCTION public.accept_special_mission(uuid), public.cancel_special_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_special_mission(uuid), public.cancel_special_mission(uuid) TO authenticated, service_role;