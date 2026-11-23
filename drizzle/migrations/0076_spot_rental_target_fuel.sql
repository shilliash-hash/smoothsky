-- Spot rentals choose real fuel loads; billing remains pay-as-you-burn after landing.
CREATE OR REPLACE FUNCTION public.set_target_fuel(p_aircraft uuid, p_target numeric) RETURNS TABLE(cur numeric, persistent boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f fleet_aircraft%ROWTYPE;
BEGIN
 SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN (SELECT id FROM companies WHERE user_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 IF p_target IS NOT NULL AND (p_target<0 OR p_target::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Invalid target fuel'; END IF;
 persistent:=f.ownership<>'RENTAL'; cur:=f.current_fuel_gal;
 IF persistent THEN PERFORM set_config('smoothsky.target_fuel',greatest(coalesce(p_target,0),f.current_fuel_gal)::text,true);
 ELSE PERFORM set_config('smoothsky.target_fuel',coalesce(p_target,0)::text,true); END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.set_target_fuel(uuid,numeric) FROM PUBLIC, anon, authenticated;

DO $patch$
DECLARE d text; n text;
BEGIN
 d:=pg_get_functiondef('public.reserve_dispatch_fuel()'::regprocedure);
 n:=replace(d,$a$ELSE needed:=(NEW.estimate->>'fuel_gal')::numeric; END IF;$a$,$a$ELSE needed:=coalesce((NEW.estimate->'weight_budget'->>'planned_fuel_gal')::numeric,(NEW.estimate->>'fuel_gal')::numeric); END IF;$a$);
 IF n=d THEN RAISE EXCEPTION 'Rental fuel reservation anchor missing'; END IF;
 EXECUTE n;

 d:=pg_get_functiondef('public.divert_leg_quote(public.flights,text,numeric,boolean)'::regprocedure);
 n:=replace(d,$a$fuel_target:=CASE WHEN a.ownership='RENTAL' THEN 0 ELSE$a$,$a$fuel_target:=CASE WHEN a.ownership='RENTAL' THEN coalesce(target,0) ELSE$a$);
 IF n=d THEN RAISE EXCEPTION 'Rental continuation target anchor missing'; END IF; d:=n;
 n:=replace(d,$a$CASE WHEN a.ownership='RENTAL' THEN trip ELSE (q->'tank'->>'added_fuel_gal')::numeric END$a$,$a$CASE WHEN a.ownership='RENTAL' THEN (q->'tank'->>'target_fuel_gal')::numeric ELSE (q->'tank'->>'added_fuel_gal')::numeric END$a$);
 IF n=d THEN RAISE EXCEPTION 'Rental continuation stock anchor missing'; END IF;
 EXECUTE n;

 d:=pg_get_functiondef('public.divert_action(uuid,text,numeric)'::regprocedure);
 n:=replace(d,$a$needed:=CASE WHEN a.ownership='RENTAL' THEN (q->>'fuel_gal')::numeric ELSE$a$,$a$needed:=CASE WHEN a.ownership='RENTAL' THEN round(coalesce((q->'tank'->>'target_fuel_gal')::numeric,(q->>'fuel_gal')::numeric),4) ELSE$a$);
 IF n=d THEN RAISE EXCEPTION 'Rental continuation reservation anchor missing'; END IF;
 EXECUTE n;

 d:=pg_get_functiondef('public.ramp_fuel_adjust(uuid,jsonb)'::regprocedure);
 n:=replace(d,'fuel text; n int;','fuel text; n int; rental boolean;');
 IF n=d THEN RAISE EXCEPTION 'Ramp declaration anchor missing'; END IF; d:=n;
 n:=replace(d,$a$IF NOT (e ? 'fuel_uplift_gal') OR wb IS NULL THEN RETURN NULL; END IF;
 sim:=(p->>'fuel_gal')::numeric; tgt:=(e->>'target_fuel_gal')::numeric;$a$,
 $a$rental:=NOT (e ? 'fuel_uplift_gal');
 -- Spot rentals keep pay-as-you-burn billing; ramp sync only aligns their planned load and stock.
 IF wb IS NULL OR (rental AND (wb->>'min_safe_fuel_gal') IS NULL) THEN RETURN NULL; END IF;
 sim:=(p->>'fuel_gal')::numeric; tgt:=coalesce((e->>'target_fuel_gal')::numeric,CASE WHEN rental THEN (wb->>'planned_fuel_gal')::numeric END);$a$);
 IF n=d THEN RAISE EXCEPTION 'Ramp rental gate anchor missing'; END IF; d:=n;
 n:=replace(d,'cost:=round(add*price,2);','cost:=CASE WHEN rental THEN 0 ELSE round(add*price,2) END;');
 IF n=d THEN RAISE EXCEPTION 'Ramp cost anchor missing'; END IF; d:=n;
 n:=replace(d,'IF add<=0 OR company_balance(f.company_id)<cost THEN','IF add<=0 OR (cost>0 AND company_balance(f.company_id)<cost) THEN');
 IF n=d THEN RAISE EXCEPTION 'Ramp funds anchor missing'; END IF; d:=n;
 n:=replace(d,' UPDATE flights SET estimate=e WHERE id=f.id;
 RETURN jsonb_build_object(',' IF rental THEN e:=e-''fuel_uplift_gal''-''fuel_uplift_cost''; END IF;
 UPDATE flights SET estimate=e WHERE id=f.id;
 RETURN jsonb_build_object(');
 IF n=d THEN RAISE EXCEPTION 'Ramp rental key anchor missing'; END IF;
 EXECUTE n;
END $patch$;
REVOKE ALL ON FUNCTION public.ramp_fuel_adjust(uuid,jsonb) FROM PUBLIC,anon,authenticated;