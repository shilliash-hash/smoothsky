# Roadmap

## Single-flight rentals and acquisition confirmations
- [x] Add atomic tier-checked rentals at 37% of weekly rate, no deposit/weekly billing, retirement after settlement or cancellation.
- [x] Add shared Lease/Rent/Buy confirmation, rental fleet labels and accurate rental operating expenses.
- [x] Verify 20 tests, signed-in rental acquisition, missing-licence rejection, cancellation at origin and completion at destination, retained logbook/ledger, desktop/mobile confirmation; deployment variables unchanged. Real ACARS PIREP and isolated production not exercised.

## Fuel guidance and global radar activity
- [x] Explain pay-as-you-burn and live configured reserve in Dispatch without changing settlement; refresh quote when reserve changes.
- [x] Include all globally active airports in bounded catalogue batches; keep other companies' flight details private.
- [x] Verify 11 tests, signed-in route quote and mobile note (no overflow), and EPBY global count (6 operations including another company); build OK, deployment variables unchanged. Isolated production database not accessible for verification.

## Recruitment commission settings
- [x] Add admin-editable roster/freelance default rates and ranges, shared with recruitment validation; preserve dispatched-flight commission snapshots.
- [x] Verify signed-in admin save/readback and recruitment range updates; 16 tests passed, admin-only economy INSERT/UPDATE policies checked, original values restored.

## Worldwide aircraft registration
- [x] Fill country catalogue without overwriting existing rules; add VP- fallback in acquisition and market UI. Schema migration plus separate replayable data backfill for isolated databases.
- [x] Verify catalogue coverage (280 rules, no uncovered airports in accessible database), requested mappings, fallback tests and signed-in market controls; C172 lease enabled without purchasing.

## PILOT_ONLY account handling
- [x] Verify optional company reads, career-aware home/sign-in routing and admin navigation without an airline (signed-in PILOT_ONLY admin; 68 tests passed).

## Flight Logbook
- [x] Add completed-flight page and navigation with aircraft filtering, including retired aircraft, without database changes.
- [x] Verify settled results, flight-hour conversion, signed-in filtering and mobile layout.

- [x] Translate all Phase 1 screens and notifications into English.
- [x] Apply bottle-green, mint/sage and amber theme through shared tokens.
- [x] Verify public and signed-in screens at desktop and mobile sizes.

## Phase 2 — Economy, Dispatch & Radar
- [x] Smooth Coins currency and editable economy/aircraft configuration.
- [x] Import European airports and runways with provenance and unknown-data handling.
- [x] Passenger pools, pure economy rules and transactional dispatch/settlement.
- [x] Dispatch screen and isolated web simulation with ACARS-ready contracts.
- [x] Interactive radar, airport/flight popouts and selected-aircraft range filter.
- [x] Verify signed-in flight-to-ledger flow, security, tests and mobile layouts.

## Admin & operational radar
- [x] Protected admin economy, aircraft catalogue and player/company directory.
- [x] Configurable airport fuel capacity, development scaling and 10% hourly refill, reserved at dispatch.
- [x] Military paved-runway airport import, operational popups, PAX rings, activity pulses, legend and layer controls.
- [x] Verify admin/non-admin permissions, edits, fuel rules and responsive radar.

## Phase 3 — Fleet, profitability & fuel
- [x] Fuel quantities in US gal, lb and kg with fuel-specific density.
- [x] Fixed-term leases, weekly billing, return and 5% renewal discount.
- [x] Aircraft financial detail with daily lease allocation and operating costs.
- [x] Decimal admin steps and larger, distinctly colored radar PAX gauges.
- [x] Verify signed-in flows, economic rules and radar readability.

## Fleet purchase & test operations
- [x] Independent radar category and Size/Tier filters with multi-selection.
- [x] Country-aware unique registrations, owned aircraft purchase and editable catalogue prices.
- [x] Daily company operating results chart replacing the fleet tile.
- [x] Enabled accelerated web simulation with start and automatic test settlement.
- [x] Verify purchases, uniqueness, filters and complete test-flight settlement.

## Charter surcharge tuning
- [x] Configure 65/50/35/20/0 SC per passenger for aircraft Tiers 1–7 and expose grouped ADMIN inputs.
- [x] Show distance fare and charter surcharge beside Dispatch ticket revenue; verify rules and signed-in views.

## Transaction history readability
- [x] Add registration, route and short flight ID to new settlements and resolve historical flight references without editing the ledger.
- [x] Add aircraft filtering including returned aircraft, applied before the transaction limit.
- [x] Verify signed-in history, filtering, mobile overflow and settlement description definition; identity tests passed.

## Flight numbers
- [x] Add company-sequenced flight numbers, backfill previous flights and accept a player override at dispatch.
- [x] Show flight number, registration and route in operations, radar and transaction history.
- [x] Verify numbering, dispatch overrides, settlement history and signed-in views.

## FOBs & financial obligations
- [x] Align Dispatch destination and flight-number fields.
- [x] Main and up to two satellite FOBs, paid modules and frozen operational discounts.
- [x] Weekly obligations, financial health, acquisition restrictions and controlled restructuring.
- [x] Bases page, dashboard status and radar base markers.
- [x] Editable FOB/health settings and confirmed admin airport stock reset; non-admin denial and active-flight guard verified without resetting the shared world.
- [x] Verify signed-in investment, discounted flight settlement, billing idempotency, insolvency recovery, permissions and mobile views.

## Rules & company leaderboard
- [x] Add English rules modal and discreet donation control.
- [ ] Activate donation link — waiting for the user's payment/support destination.
- [x] Add safe aggregate company leaderboard, net-worth valuation and previous-week rank movement (first-read UTC weekly snapshots).
- [x] Add administrator-only supporter switch and public supporter badges.
- [x] Verify ranking calculations against owner records, private-field exclusion, non-admin denial, supporter toggle/restore and desktop/mobile flows.
- [x] /profile (ACARS key, SimBrief, career, type ratings, roster/recruitment); Dashboard ACARS card removed, status dot in top bar
- [x] Career choice (Airline owner / Pilot only at 0 SC); Airlines/Pilots leaderboard tabs
- [x] ACARS hardening: 3 s rate limit, position/fuel plausibility, duplicate PIREP rejection
- [ ] Roster/freelance flying of airline aircraft with commission split in settlement + aircraft reservation per pilot
- [ ] Freelance job board
- [ ] Airline stakes (≤30%, 7-day lock) and weekly dividends
- [ ] Personal hangar (one T1–3 aircraft, private charters)

- [x] Pilot roster/freelance flights with reservation and commission split
- [x] Freelance job board (Crew ops)
- [x] Airline stakes with 7-day lock and weekly dividends
- [x] Personal hangar (one Tier 1–3 aircraft)
- [x] Cargo (belly + All-Cargo), airport cargo pools, admin cargo rules
- [x] Special Missions board (MEDEVAC / AOG) with deadlines and 50% late penalty
- [x] Homepage guide with live world telemetry
- [x] ACARS live mode in Dispatch, emergency Cancel flight, /acars/active resume endpoint
- [x] Hide disabled simulation controls from non-admin players; use real GPS on radar.
- [x] Add 30-minute ACARS reconnect window and persistent Crew onboarding hint; unit tests and signed-in pages checked, real simulator reconnect not available in sandbox.
- [x] Verify catalogue leasing changes against affordability, existing contracts and acquisition guards; C172 available in signed-in market, BE58 requires 11,600 SC. Exact reported-player error requested.
- [x] Expose every non-financial acquisition blocker; signed-in term validation and enabled C172 verified.
- [x] Identify Canadian registration coverage gap for CYYR; support both CA and Canada imports without altering lease prices.
- [ ] Verify and apply repair in the user's isolated 49,000-airport database — current development and production query tools both return the 7,529-airport database without CYYR.
