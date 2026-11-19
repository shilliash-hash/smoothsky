# Flight execution contract — version 1

## Current scope
Web test flights reserve passengers, take off, advance along a Great Circle at a configured time scale, and settle only after arrival. `web_simulation_enabled` controls all test transitions. These flights are simulated, not simulator-validated.

## Shared durable contract
- A flight is owned by `company_id`; owner identity is checked using `auth.uid()`.
- States: DISPATCHED → EN_ROUTE → COMPLETED; only DISPATCHED may be cancelled.
- Dispatch stores economic rules and a server-generated estimate. Later balancing edits never change the quoted flight.
- A transaction locks the company and flight before posting ledger entries; retries return the original settlement.
- `execution_source` distinguishes WEB_MANUAL from ACARS_AGENT. Browser RPCs cannot create or settle ACARS flights.
- Telemetry version 1: source, flight ID, sequence, UTC captured time, latitude, longitude, altitude_ft, ground_speed_kts, heading_deg, on_ground, engine_running, fuel_used_gal, landing_rate_fpm. SI/aviation units must be documented per adapter.

## Future ACARS implementation (not shipped)
Fuel display includes US gal, lb and kg using editable fuel-specific kg/L densities. Planned loading includes the configured reserve, separately from expected burn. An ACARS adapter must report tank quantity before departure and actual consumption, normalize units, and verify loading against the frozen dispatch requirement with adapter-specific tolerances. Display conversions alone are not simulator evidence.
An external Windows client can read SimConnect for MSFS; X-Plane needs a separate adapter. OAuth/device pairing, scoped revocable tokens, sequence/replay validation and endpoint rate limits are prerequisites. A TanStack public server route must verify the token, company, assigned aircraft, flight state and plausibility before recording telemetry or permitting SQL settlement. Never accept caller-supplied revenue/costs or an `execution_source` override.
Actual telemetry drives the radar; Great Circle remains a labelled estimate, not proof of a real flight. Only validated landing/engine-off evidence can complete a real flight. Missing/reordered events must not double-post the ledger. Desktop packaging and simulator testing are separate milestones.

## Configuration and data
Economy and aircraft configuration are edited on `/admin`; a protected `user_roles` row grants access, while ordinary players retain read-only access. Aircraft lease prices affect new leases; existing lease rates remain contractual snapshots. Active models appear in the market automatically. Units: US gallons, NM, knots, feet, Smooth Coins.
European airports are imported from OurAirports public-domain CSVs; closed airports and heliports excluded. Paved military airfields are retained with provisional lower-tier classification. Local identifiers use ICAO, GPS code, then source identifier. Size is provisional and distinct from development and airport type.
Simulated airport fuel is independent of nullable real-world fuel availability. `airport_fuel_rules` defines capacity by Size, development scaling and refill fraction per hour (initially 0.10 for both fuels). No passenger burnout applies. Missing fuel-pool rows represent full tanks. Quotes verify supply; dispatch locks and reserves the quoted consumption, and pending cancellation returns it once. Settlement charges the frozen fuel quote without consuming fuel again. Radar exposes only aggregated airport activity and stock, not other companies' flights.
