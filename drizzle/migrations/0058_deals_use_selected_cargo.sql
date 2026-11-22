CREATE OR REPLACE FUNCTION public.dispatch_destination_estimate(p_aircraft_id uuid,p_destination text,p_cargo_kg integer DEFAULT 0,p_all_cargo boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; ferry boolean:=coalesce(p_all_cargo,false) AND coalesce(p_cargo_kg,0)=0;
BEGIN
 q:=public.flight_quote_full(p_aircraft_id,p_destination,greatest(coalesce(p_cargo_kg,0),0),p_all_cargo);
 IF NOT ferry AND coalesce((q->'weight_budget'->>'payload_kg')::numeric,0)<=0 THEN
  RETURN jsonb_build_object('estimated_revenue',NULL,'estimated_margin',NULL,'estimate_error','Ferry only: no payload capacity after fuel and reserve','available_payload_kg',q->'weight_budget'->'available_payload_kg');
 END IF;
 RETURN jsonb_build_object('estimated_revenue',q->'revenue','estimated_margin',q->'net','estimate_error',NULL,'passengers',q->'passengers','cargo_kg',q->'cargo_kg','available_payload_kg',q->'weight_budget'->'available_payload_kg');
EXCEPTION WHEN raise_exception THEN
 RETURN jsonb_build_object('estimated_revenue',NULL,'estimated_margin',NULL,'estimate_error',SQLERRM);
END $$;
COMMENT ON FUNCTION public.dispatch_destination_estimate(uuid,text,integer,boolean) IS 'Preview uses exactly the dispatcher-selected cargo and mode, matching the selected-flight quote.';