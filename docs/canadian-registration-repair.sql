-- Apply to each isolated database that contains the global airport catalogue.
-- Supports both ISO-coded imports and country-name imports without rewriting airports.
-- C-Fxxx is a valid Canadian civil-aircraft registration series.
INSERT INTO public.registration_rules
  (country, prefix, suffix_pattern, suffix_length, alphabet, source)
VALUES
  ('CA', 'C-F', '[A-Z]{3}', 3, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'https://tc.canada.ca/en/aviation/civil-aviation/canadian-aircraft-register'),
  ('Canada', 'C-F', '[A-Z]{3}', 3, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'https://tc.canada.ca/en/aviation/civil-aviation/canadian-aircraft-register')
ON CONFLICT (country) DO NOTHING;