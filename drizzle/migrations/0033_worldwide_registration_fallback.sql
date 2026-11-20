CREATE OR REPLACE FUNCTION public.world_registration_defaults()
RETURNS TABLE(country text, prefix text, suffix_pattern text, suffix_length integer, alphabet text, source text)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH known(code, mark, len) AS (VALUES
('US','N-',4),('BR','PR-',3),('AU','VH-',3),('MX','XA-',3),('AR','LV-',3),('CL','CC-',3),('CO','HK-',3),('JP','JA-',4),('CN','B-',4),('IN','VT-',3),('ZA','ZS-',3),('NZ','ZK-',3),('AE','A6-',3),('SA','HZ-',3),('KR','HL-',4),('TR','TC-',3),('ID','PK-',3),('TH','HS-',3),('CA','C-F',3),('Canada','C-F',3),
('AF','YA-',3),('BD','S2-',3),('BT','A5-',3),('BN','V8-',3),('KH','XU-',3),('LA','RDPL-',3),('MY','9M-',3),('MV','8Q-',3),('MM','XY-',3),('NP','9N-',3),('PK','AP-',3),('PH','RP-',3),('SG','9V-',3),('LK','4R-',3),('VN','VN-',3),('TW','B-',4),('HK','B-',4),('MO','B-M',3),('MN','JU-',3),('KP','P-',4),('TL','4W-',3),
('AM','EK-',3),('AZ','4K-',3),('GE','4L-',3),('KZ','UP-',3),('KG','EX-',3),('TJ','EY-',3),('TM','EZ-',3),('UZ','UK-',3),('RU','RA-',3),('BY','EW-',3),('MD','ER-',3),
('BH','A9C-',3),('IQ','YI-',3),('IR','EP-',3),('IL','4X-',3),('JO','JY-',3),('KW','9K-',3),('LB','OD-',3),('OM','A4O-',3),('QA','A7-',3),('SY','YK-',3),('YE','7O-',3),('PS','E4-',3),
('DZ','7T-',3),('AO','D2-',3),('BJ','TY-',3),('BW','A2-',3),('BF','XT-',3),('BI','9U-',3),('CV','D4-',3),('CM','TJ-',3),('CF','TL-',3),('TD','TT-',3),('KM','D6-',3),('CG','TN-',3),('CD','9Q-',3),('CI','TU-',3),('DJ','J2-',3),('EG','SU-',3),('GQ','3C-',3),('ER','E3-',3),('SZ','3DC-',3),('ET','ET-',3),('GA','TR-',3),('GM','C5-',3),('GH','9G-',3),('GN','3X-',3),('GW','J5-',3),('KE','5Y-',3),('LS','7P-',3),('LR','A8-',3),('LY','5A-',3),('MG','5R-',3),('MW','7Q-',3),('ML','TZ-',3),('MR','5T-',3),('MU','3B-',3),('MA','CN-',3),('MZ','C9-',3),('NA','V5-',3),('NE','5U-',3),('NG','5N-',3),('RW','9XR-',3),('ST','S9-',3),('SN','6V-',3),('SC','S7-',3),('SL','9L-',3),('SO','6O-',3),('SS','Z8-',3),('SD','ST-',3),('TZ','5H-',3),('TG','5V-',3),('TN','TS-',3),('UG','5X-',3),('ZM','9J-',3),('ZW','Z-',3),
('AG','V2-',3),('BS','C6-',3),('BB','8P-',3),('BZ','V3-',3),('BO','CP-',3),('CR','TI-',3),('CU','CU-',3),('DM','J7-',3),('DO','HI-',3),('EC','HC-',3),('SV','YS-',3),('GD','J3-',3),('GT','TG-',3),('GY','8R-',3),('HT','HH-',3),('HN','HR-',3),('JM','6Y-',3),('NI','YN-',3),('PA','HP-',3),('PY','ZP-',3),('PE','OB-',3),('KN','V4-',3),('LC','J6-',3),('VC','J8-',3),('SR','PZ-',3),('TT','9Y-',3),('UY','CX-',3),('VE','YV-',3),
('FJ','DQ-',3),('KI','T3-',3),('MH','V7-',3),('FM','V6-',3),('NR','C2-',3),('PW','T8-',3),('PG','P2-',3),('WS','5W-',3),('SB','H4-',3),('TO','A3-',3),('TV','T2-',3),('VU','YJ-',3),('CK','E5-',3),('NU','ZK-',3),('NC','F-',4),('PF','F-',4),
('BM','VP-B',3),('KY','VP-C',3),('VG','VP-L',3),('AI','VP-A',3),('MS','VP-M',3),('TC','VQ-T',3),('FK','VP-F',3),('GI','VP-G',3),('AW','P4-',3),('CW','PJ-',3),('SX','PJ-',3),('BQ','PJ-',3),('PR','N-',4),('VI','N-',4),('GU','N-',4),('AS','N-',4),('MP','N-',4),('GL','OY-',3),('FO','OY-',3),('RE','F-',4),('YT','F-',4),('GP','F-',4),('MQ','F-',4),('GF','F-',4),('PM','F-',4),('BL','F-',4),('MF','F-',4),('WF','F-',4),
('PL','SP-',3),('DE','D-',4),('GB','G-',4),('FR','F-',4),('IT','I-',4),('ES','EC-',3),('AT','OE-',3),('CH','HB-',3),('CZ','OK-',3),('SK','OM-',3),('BE','OO-',3),('NL','PH-',3),('DK','OY-',3),('NO','LN-',3),('SE','SE-',3),('FI','OH-',3),('IE','EI-',3),('IS','TF-',3),('PT','CS-',3),('GR','SX-',3),('HU','HA-',3),('RO','YR-',3),('BG','LZ-',3),('EE','ES-',3),('LV','YL-',3),('LT','LY-',3),('LU','LX-',3),('MT','9H-',3),('CY','5B-',3),('HR','9A-',3),('SI','S5-',3),('RS','YU-',3),('ME','4O-',3),('BA','E7-',3),('MK','Z3-',3),('AL','ZA-',3),('UA','UR-',5),('SM','T7-',3),('IM','M-',4),('GG','2-',4),('JE','ZJ-',3)
), candidates AS (
SELECT code AS country, mark AS prefix, len FROM known
UNION ALL
SELECT DISTINCT a.country, upper(a.country)||'-', 3 FROM public.airports a
WHERE NOT EXISTS (SELECT 1 FROM known k WHERE k.code=a.country)
)
SELECT c.country, c.prefix, '[A-Z]{'||c.len||'}', c.len, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'::text,
CASE WHEN EXISTS(SELECT 1 FROM known k WHERE k.code=c.country) THEN 'SmoothSky letter-only game format; https://www.avcodes.co.uk/regprefixcur.asp' ELSE 'SmoothSky country-code default (not a civil registration standard)' END
FROM candidates c;
$$;
REVOKE ALL ON FUNCTION public.world_registration_defaults() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.world_registration_defaults() TO service_role;

CREATE OR REPLACE FUNCTION public.aircraft_registration(p_type text, p_requested text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r registration_rules%ROWTYPE; t aircraft_types%ROWTYPE; c text; candidate text; pattern text; head text:=''; i integer; j integer;
BEGIN
SELECT a.country INTO c FROM companies co JOIN airports a ON a.icao=co.home_base_icao WHERE co.user_id=auth.uid();
IF c IS NULL THEN RAISE EXCEPTION 'No company'; END IF;
SELECT * INTO r FROM registration_rules WHERE country=c;
IF NOT FOUND THEN
  r.country:=c; r.prefix:='VP-'; r.suffix_pattern:='[A-Z]{3}'; r.suffix_length:=3; r.alphabet:='ABCDEFGHIJKLMNOPQRSTUVWXYZ'; r.source:='SmoothSky emergency fallback';
END IF;
SELECT * INTO t FROM aircraft_types WHERE id=p_type;
IF NOT FOUND THEN RAISE EXCEPTION 'Unknown aircraft'; END IF;
pattern:=r.suffix_pattern;
IF c='DE' THEN head:=CASE WHEN t.fuel_type='Jet-A' THEN 'I' WHEN t.tier=1 THEN 'E' ELSE 'G' END; pattern:=head||'[A-Z]{3}';
ELSIF c='FR' THEN head:='G'; END IF;
IF p_requested IS NOT NULL AND trim(p_requested)<>'' THEN
  candidate:=upper(trim(p_requested));
  IF candidate !~ ('^'||r.prefix||'('||pattern||')$') THEN RAISE EXCEPTION 'Registration must match % %',r.prefix,pattern; END IF;
  IF EXISTS(SELECT 1 FROM fleet_aircraft WHERE upper(trim(registration))=candidate) THEN RAISE EXCEPTION 'Registration already assigned'; END IF;
  RETURN candidate;
END IF;
FOR i IN 1..200 LOOP
  candidate:=r.prefix||head;
  FOR j IN 1..(r.suffix_length-length(head)) LOOP candidate:=candidate||substr(r.alphabet,1+floor(random()*length(r.alphabet))::int,1); END LOOP;
  IF NOT EXISTS(SELECT 1 FROM fleet_aircraft WHERE upper(trim(registration))=candidate) THEN RETURN candidate; END IF;
END LOOP;
RAISE EXCEPTION 'No registration available';
END $$;
REVOKE ALL ON FUNCTION public.aircraft_registration(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aircraft_registration(text,text) TO authenticated;