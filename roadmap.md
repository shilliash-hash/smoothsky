# Roadmap

## Explicit Dispatch flight modes
- [x] Replace the cargo switch with Commercial / All-Cargo / Ferry, preserving existing SQL payloads. All-Cargo starts at 10 kg, Ferry clears cargo and permits an empty dispatch; mode-aware ranges and Ferry recovery block commercial routes beyond the live payload limit.
- [x] 65 tests passed; signed-in King Air modes showed 1350/1800 NM, All-Cargo minimum 10 kg, Ferry quote 0 PAX/0 cargo with enabled dispatch. EPGD → LPPT (1458 NM) offered Ferry recovery and returned a zero-revenue quote. Desktop, 860 px and mobile checked without overflow/runtime errors; build OK. Radar, settlement, database and deployment variables unchanged. No flight dispatched on the player's account.

## Dispatch range discovery — stage one
- [x] Limit nearby/Best Deals/Nearest, exact-code search and alternatives in owner-scoped SQL to the live economy range fraction (default 0.75); preserve 60/40/6 bounds and shared quote/dispatch/settlement/radar behaviour.
- [x] Add Admin Economy input with 0.05 steps, validation and missing-row fallback/upsert; show whole-NM and whole-percent range in Dispatch. Default row added separately from DDL; replayed migrations retain the SQL fallback in unseeded environments.
- [x] 54 tests passed, build OK; signed-in 1800-NM King Air displayed a 1350-NM destination limit, 60 results and working Nearest/selection. Admin saved/read back 0.70 then restored 0.75; mobile has no overflow or runtime errors. Deployment variables unchanged. Ferry, dispatch enforcement and ACARS changes intentionally excluded; this buffer is not a fuel/MTOW guarantee.

## Accessible pilot progression
- [x] Grant baseline T1–T3 to new and existing pilots without removing paid ratings; applied backfill has zero missing baseline profiles. Leasing prices/eligibility and single-flight rental settlement unchanged; no independent freelancer rental system added.
- [x] Allow owners to buy higher ratings directly from their own company, with company-before-profile locks, synchronized obligations, idempotent ledger charges, expenses/dividend accounting and profile payment readouts. Freelancers retain wallet-funded higher training.
- [x] 72 SQL/regression tests passed. Signed-in test owner purchased T4: company 30,000 → 15,000 SC, pilot wallet stayed 0; licence and expense read back through Profile/Dashboard. PC-12 and King Air spot-rental buttons enabled; desktop/mobile checked without overflow or runtime errors, build OK. Deployment variables unchanged. Test company has no in-app deletion path, so its rows were not deleted through SQL; no player funds spent.

## Configurable spot rental rate
- [x] Replace the fixed rental multiplier with live economy configuration, default 0.20; admin editing (0.01–1.00), shared market/confirmation/affordability prices and missing-setting fallback/upsert. Existing single-flight settlement, historical charges and deployment variables unchanged.
- [x] 26 tests passed for default/configured SQL pricing, rounding, admin bounds and acquisition guards. Signed-in Admin saved/read back 0.25; C172 market and confirmation both showed 238 SC; restored 0.20 and verified 190 SC. Desktop/mobile screenshots checked, no overflow or runtime errors, build OK. No rental purchased or flight settled on the player's account.

## Short-hop charter reduction
- [x] Apply database-backed 80 NM / 50% charter rule to the shared quote and cargo fare, freezing exact-distance eligibility/rate in the quote; FBOs, settlement and deployment variables unchanged. Applied definitions and owner-only permissions verified.
- [x] Show the frozen reduced charter amount and short-hop note in Dispatch. 110 tests passed: 50/79.999/80/80.001/120 NM, all seven tiers, frozen settings, cargo, FBOs, nearby/search/alternative previews and existing tip/settlement regressions. Signed-in 11 NM quote showed 32.5 SC/pax and -50% note; 122 NM quote showed full 65 SC/pax, with tile margins matching both quotes. Desktop/mobile screenshots checked, no overflow or runtime errors, build OK. No new live flight dispatched or ACARS hardware tested.

## Dispatch destination profitability
- [x] Add owner-scoped bounded destination estimates using flight_quote_full, plus up to six alternatives within 150 NM; existing search RPCs, settlement, radar and deployment variables unchanged. Alternatives select six nearest eligible ports before quoting/ranking, rather than quoting every airport within the radius.
- [x] Add Best Deals/Nearest sorting, top-three positive deals, revenue/margin readouts and one-click alternatives with current cargo settings; unavailable estimates show their reason rather than a fabricated zero.
- [x] 88 SQL/regression tests passed, including a 49,501-airport fixture, 60/40/6 limits, owner denial, radius/range/runway/tiers/date line, cargo forwarding, FBO savings and sort rules. Signed-in desktop/mobile: 60 results, local sort, PL-0152 estimate exactly matched the full 188.13 SC quote; selecting PL-0018 updated the route; EPBY search returned one result. Alternatives were not requested before selection. No runtime errors or horizontal overflow; build OK.
- [x] Timing measured and limitation reported: first result in development 2.85–2.96 s, 60-result request 524–580 ms, alternatives 125–254 ms. The requested full-page 0.3 s threshold is not achieved; isolated production timing remains unverified.

## World radar activity and tier catalogue
- [x] Add safe paginated worldwide ground/activity aggregates without changing private flight access; anonymous/authenticated grants verified.
- [x] Load up to 500 tier airports plus all priority ports, scoped supplies in batches of 200, and global ground/activity markers; Dispatch, Flight Deck styling and deployment variables unchanged.
- [x] 45 SQL/regression tests passed, including 49,501-airport fixture, 1,203 world ports and API pagination. Signed-in desktop/mobile filters, world ground counts, pulses, passenger gauges and airport details verified without console errors or overflow. Cached tier switch measured 189 ms; warm map navigation 546 ms; first map container 2,588 ms in development, so full-page loading below 0.3 s is not achieved. No active flights available during verification; live aircraft rendering and isolated production timing remain unverified.

## Bounded dispatch and radar airport loading
- [x] Add nearby-airport RPC (60 maximum, reachable own FBO priority) and indexed exact-code/distance search (40 maximum, 250 ms debounce); default T1 exclusion only for aircraft T3–7, explicit filters retained.
- [x] Remove worldwide catalogue/supply pagination and major-port preload; operations load owner-touched airports, radar adds active-flight endpoints in batches of 200 with scoped aggregate supplies.
- [x] 206 tests passed, including production SQL against 49,501 synthetic airports, ownership, runway/range/date-line filters, limits, FBO priority and scoped metrics. Signed-in nearby list returned 60, EPGD search returned 1, EPPW→EPGD quote read back, radar 5-second refresh observed, desktop/mobile checked without overflow or console errors; build OK and deployment variables unchanged. Accessible live database has 7,529 airports and no active flights during verification, so isolated-production timing and live active-flight endpoint rendering were not measured.

## Company FBO ground handling
- [x] Waive half of handling per active owner FBO endpoint, preserve landing/module discounts and frozen historical quotes, and skip zero-value settlement entries.
- [x] Show Company FBO handling savings in Dispatch and free handling on base cards. 58 tests passed, including production SQL for 100/50/0 SC, cargo, closed/foreign FBOs, zero-fee settlement, old quotes, landing-module discounts, passenger tips and leases. Signed-in existing-company quotes verified at origin (7.04 SC) and destination (5.94 SC); desktop/mobile screenshots checked, no overflow or console errors, build OK, deployment variables unchanged. No live flight dispatched or settled on the player's account; zero-fee settlement verified in isolated SQL tests.

## Passenger landing tips
- [x] Add ACARS-only passenger tips with balanced, idempotent ledger posting, frozen database-backed rules and profitability/commission reporting; preserve existing leases and historical settlements.
- [x] Add touchdown and tip breakdown in Dispatch/Logbook and ledger label; 77 tests passed. Signed-in ACARS HTTP report awarded 23.76 SC on 237.57 SC tickets at -61 fpm, duplicate report rejected (409), entry and debrief read back on desktop/mobile; no console errors, build OK, deployment variables unchanged. Real simulator hardware not connected.

## Early lease termination
- [x] Add owner-only atomic termination, rounded deposit penalty, reservation/flight guards and immutable ledger entries; preserve existing contract dates and deployment variables.
- [x] Add confirmation with synchronized balance and fee-aware financial reporting; 36 tests passed including 16 isolated SQL tests for due/future billing, rounding, repeat rejection, ownership, active flights, reservations and unchanged other leases. Signed-in C172 termination verified twice: 750 SC penalty, 2250 SC net refund, retained weekly payment/history, cleared fleet; desktop/mobile confirmation checked. Build OK; isolated 49,000-airport environment not available.

## Civil aviation terminology
- [x] Replace player-facing FOB text with FBO, including legacy descriptions and errors; preserve database identifiers and deployment variables.
- [x] Verify signed-in bases, dashboard, radar, leaderboard and admin plus public information; 19 existing tests passed, build OK. Player-authored company names remain unchanged.

## Global live flight radar
- [x] Add anonymous/authenticated safe active-flight RPC without changing private flights policies.
- [x] Refresh worldwide map/list every 5 seconds, distinguish own flights and show public airline/aircraft telemetry details; radar also permits pilot accounts without companies.
- [x] Verify 15 tests, anonymous RPC, real dispatched flight visible to another account, owner badge, automatic cancellation removal and desktop/mobile map. Live airborne GPS covered by unit tests; no real simulator connected. Deployment variables unchanged.

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
