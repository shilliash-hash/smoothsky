-- Optional bootstrap for environments importing the stage-one schema.
-- SQL helpers use these same defaults when a setting has not been seeded.
-- Never overwrite settings already tuned by an administrator.
INSERT INTO public.economy_config(key,value,description) VALUES
 ('landing_fee_per_ton_mtow','2.5','Landing fee in SC per tonne of aircraft MTOW, before destination-size and existing FBO/cargo discounts.'),
 ('passenger_weight_kg','80','Mass allocated to each passenger for the shared takeoff weight budget, in kg.'),
 ('fuel_billing_floor_pct','0.80','Minimum verified ACARS fuel bill as a fraction of estimated trip consumption; excludes unused safety reserve.')
ON CONFLICT(key) DO NOTHING;