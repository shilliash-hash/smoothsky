ALTER TABLE public.operating_rules ADD COLUMN lease_termination_penalty_rate numeric NOT NULL DEFAULT 0.25 CHECK (lease_termination_penalty_rate BETWEEN 0 AND 1);
ALTER TABLE public.lease_contracts ADD COLUMN ended_at timestamptz;
ALTER TABLE public.lease_contracts ADD COLUMN termination_status text;
COMMENT ON COLUMN public.lease_contracts.ended_at IS 'Actual early termination time; original starts_at/ends_at remain immutable snapshots.';
ALTER TABLE public.company_ledger DROP CONSTRAINT company_ledger_entry_type_check;
ALTER TABLE public.company_ledger ADD CONSTRAINT company_ledger_entry_type_check CHECK (entry_type IN ('INITIAL_GRANT','LEASE_DEPOSIT','LEASE_PAYMENT','LEASE_DEPOSIT_REFUND','AIRCRAFT_PURCHASE','TICKET_REVENUE','FUEL_EXPENSE','AIRPORT_FEES','HANDLING_FEES','MAINTENANCE_RESERVE','FOB_SETUP','FOB_MODULE','FOB_UPKEEP','RESTRUCTURE_ASSETS','RESTRUCTURE_GRANT','PILOT_COMMISSION','PILOT_FUNDING','PILOT_FUNDING_REFUND','PERSONAL_PAYOUT','STAKE_SALE','STAKE_BUYBACK','DIVIDEND','USED_AIRCRAFT_SALE','SPOT_RENTAL','LEASE_TERMINATION_FEE'));
CREATE OR REPLACE FUNCTION public.lease_termination_quote(p_aircraft_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c companies%ROWTYPE; f fleet_aircraft%ROWTYPE; k lease_contracts%ROWTYPE; rate numeric; fee numeric; bal numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO c FROM companies WHERE user_id=auth.uid() AND NOT is_personal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company required'; END IF;
 PERFORM process_due_obligations();
 SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft_id AND company_id=c.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 IF f.ownership <> 'LEASED' THEN RAISE EXCEPTION 'Only leased aircraft can be terminated'; END IF;
 IF f.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Aircraft already returned'; END IF;
 IF f.status <> 'AVAILABLE' OR EXISTS(SELECT 1 FROM flights WHERE aircraft_id=f.id AND status IN ('DISPATCHED','EN_ROUTE')) THEN RAISE EXCEPTION 'Complete or cancel active flights before terminating lease'; END IF;
 IF f.reserved_by IS NOT NULL AND f.reserved_until > now() THEN RAISE EXCEPTION 'Aircraft is currently reserved by a crew pilot'; END IF;
 SELECT * INTO k FROM lease_contracts WHERE aircraft_id=f.id AND company_id=c.id ORDER BY starts_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease contract not found'; END IF;
 IF k.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Lease already terminated'; END IF;
 IF now() >= k.ends_at THEN RAISE EXCEPTION 'Contract expired: use the standard return for a full deposit refund'; END IF;
 SELECT lease_termination_penalty_rate INTO rate FROM operating_rules WHERE singleton;
 IF rate IS NULL THEN RAISE EXCEPTION 'Termination rules unavailable'; END IF;
 fee := round(f.lease_deposit * rate);
 bal := company_balance(c.id);
 RETURN jsonb_build_object('aircraft_id',f.id,'contract_id',k.id,'registration',f.registration,'deposit',f.lease_deposit,'penalty_rate',rate,'penalty',fee,'refund',f.lease_deposit-fee,'balance_before',bal,'balance_after',bal+f.lease_deposit-fee);
END $$;
REVOKE ALL ON FUNCTION public.lease_termination_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lease_termination_quote(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.terminate_lease_early(p_aircraft_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; c uuid; f fleet_aircraft%ROWTYPE; fee numeric;
BEGIN
 -- The quote synchronizes billing and holds the company, aircraft and contract locks until commit.
 q := public.lease_termination_quote(p_aircraft_id);
 SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft_id;
 c := f.company_id; fee := (q->>'penalty')::numeric;
 PERFORM company_post(c,'LEASE_DEPOSIT_REFUND','COMPANY_CASH','LESSOR_DEPOSITS',f.lease_deposit,'Early termination deposit refund – '||f.registration,f.registration,'lease_refund:'||f.id);
 PERFORM company_post(c,'LEASE_TERMINATION_FEE','LESSOR_REVENUE','COMPANY_CASH',-fee,'Early lease termination fee – '||f.registration,f.registration,'lease_termination:'||f.id);
 UPDATE lease_contracts SET ended_at=now(),termination_status='TERMINATED' WHERE id=(q->>'contract_id')::uuid;
 UPDATE fleet_aircraft SET status='RETURNED',returned_at=now(),reserved_by=NULL,reserved_until=NULL WHERE id=f.id;
 RETURN q || jsonb_build_object('balance_after',company_balance(c));
END $$;
REVOKE ALL ON FUNCTION public.terminate_lease_early(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminate_lease_early(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.aircraft_finance(p_aircraft uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE f fleet_aircraft%ROWTYPE; k lease_contracts%ROWTYPE; result jsonb; accrued numeric;
BEGIN
 SELECT * INTO f FROM fleet_aircraft WHERE id=p_aircraft AND company_id IN(SELECT id FROM companies WHERE user_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Aircraft not found'; END IF;
 SELECT * INTO k FROM lease_contracts WHERE aircraft_id=f.id ORDER BY starts_at DESC LIMIT 1;
 SELECT coalesce(sum(weekly_rate/7*greatest(0,extract(epoch FROM least(now(),ends_at,coalesce(ended_at,ends_at),coalesce(f.returned_at,ends_at))-starts_at)/86400)),0) INTO accrued FROM lease_contracts WHERE aircraft_id=f.id;
 SELECT jsonb_build_object('ownership',f.ownership,'asset_value',f.purchase_price,'revenue',coalesce(sum(amount) FILTER(WHERE entry_type='TICKET_REVENUE'),0),'fuel',coalesce(sum(amount) FILTER(WHERE entry_type='FUEL_EXPENSE'),0),'airport',coalesce(sum(amount) FILTER(WHERE entry_type='AIRPORT_FEES'),0),'handling',coalesce(sum(amount) FILTER(WHERE entry_type='HANDLING_FEES'),0),'maintenance',coalesce(sum(amount) FILTER(WHERE entry_type='MAINTENANCE_RESERVE'),0),'rental_paid',coalesce(sum(amount) FILTER(WHERE entry_type='SPOT_RENTAL'),0),'termination_fee',coalesce(sum(amount) FILTER(WHERE entry_type='LEASE_TERMINATION_FEE'),0),'lease_paid',coalesce(sum(amount) FILTER(WHERE entry_type='LEASE_PAYMENT'),0),'deposit',f.lease_deposit,'lease_accrued',round(accrued,2),'daily_lease',coalesce(round(k.weekly_rate/7,2),0),'ends_at',k.ends_at,'ended_at',k.ended_at,'term_weeks',k.term_weeks,'weekly_rate',k.weekly_rate,'returned_at',f.returned_at,'flights',(SELECT count(*) FROM flights WHERE aircraft_id=f.id AND status='COMPLETED')) INTO result FROM company_ledger l WHERE l.company_id=f.company_id AND (l.reference=f.registration OR l.reference IN(SELECT id::text FROM flights WHERE aircraft_id=f.id));
 RETURN result;
END $$;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.company_daily_results()'::regprocedure) INTO definition;
 IF position('''FOB_UPKEEP'',''SPOT_RENTAL''' in definition)=0 THEN RAISE EXCEPTION 'Unexpected daily results definition'; END IF;
 EXECUTE replace(definition,'''FOB_UPKEEP'',''SPOT_RENTAL''','''FOB_UPKEEP'',''SPOT_RENTAL'',''LEASE_TERMINATION_FEE''');
END $$;