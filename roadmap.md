# Roadmap

## CR-04 — Etap 4A / 4B
- [ ] 4A: przygotować SQL do ręcznego wdrożenia (globalne nasycenie PAX/Cargo, feeder credit, indeksy i sześć ustawień), bez zmian Reacta ani uruchamiania na bazie graczy; zapis w supabase/migrations zablokowany przez platformę, plik w docs/sql.
- [ ] 4A: sprawdzić matematykę, zamrożone wyceny, wspólną ścieżkę Best Deals i blokady odprawy w izolowanych testach SQL.
- [ ] Ręczne wdrożenie 4A — czeka na użytkownika.
- [x] 4B / Dispatch: kompaktowy badge nasycenia PAX/Cargo i angielski InfoHint z telemetrią okna 36 h, feeder credit oraz progami; kontrola TypeScript OK, bez Vitest i testów przeglądarki.
- [x] 4B / Admin: sześć pól z economy_config w osobnej sekcji, granice zgodne z SQL 4A i walidacja admin-rules.ts; bez Vitest/PGlite dla admina. Pola wymagają istniejących wpisów migracji 4A.

## CR-08 — Fuel Baseline & ACARS Target Fuel Clarity
- [x] Ręczna migracja docs/sql/0085_acars_target_fuel_clarity.sql zwraca pełny target_fuel_gal z fallbackami do weight_budget.planned_fuel_gal i legacy fuel_gal; zachowuje key-check oraz dawny planned_fuel_gal.
- [ ] Uruchomienie migracji 0085 w produkcji — czeka na ręczne wdrożenie użytkownika; nie zmieniano bazy graczy.
- [x] Debrief: próg Overburn = Trip Burn + Reserve, bez tankeringu; Saved / Within planned reserves / Overburn zależą od zużycia, prawdziwe różnice kosztów pozostają osobno.
- [x] 23 testy CR-08 przechodzą; bieżąca kompilacja OK, bez testów admina i przeglądarki. Rzeczywisty lot ACARS do potwierdzenia po ręcznym wdrożeniu SQL.

## Rzut 1 — CR-02 + CR-03
- [x] CR-02: Cargo w otwartym dymku radaru korzysta z cache TanStack Query, aktualizuje aktualny popup i zachowuje poprzednie dane podczas odświeżeń radaru.
- [x] CR-03: Powrót do karty odświeża sesję przed aktywnymi zapytaniami; błędy sieci są ponawiane bez fałszywego wylogowania, a funkcje serwerowe zachowują błędy RPC zamiast HTML.
- [x] 563 testy i kontrola typów przechodzą; najnowsza kompilacja podglądu OK. Bez automatycznych testów przeglądarki, zmian bazy danych i ustawień wdrożenia; rzeczywiste uśpienie karty pozostaje do potwierdzenia przez użytkownika.

## Rzut 2 — CR-01 Dispatch Timeout / Force Recall
- [x] Automatyczny Recall po 3 h wyłącznie dla nieuruchomionych DISPATCHED bez telemetrii ACARS od 30 min; EN_ROUTE, DIVERTED, departed_at i kontynuacje chronione. Progi edytowalne w /admin, uruchamiane przez istniejące odświeżanie operacji.
- [x] Ręczny Recall z potwierdzeniem w Dispatch i na Dashboardzie; wspólna, idempotentna ścieżka anulowania zwraca paliwo, dopłatę i Spot Rental bez podwójnych zwrotów.
- [x] Migracje 0081–0083 zastosowane; 576 testów i kontrola typów OK, w tym 13 nowych testów CR-01 oraz regresje ACARS, divert i admin cleanup. Bez testów przeglądarkowych i zmian wrangler.jsonc.

## Flight Briefing snapshot
- [x] Read-only modal of the plan approved at dispatch (route, PAX/cargo, W&B vs MTOW, tank/uplift/ramp fuel, estimated economics) in Dispatch rows, dashboard board (Plan), fleet cards (Flight plan) and accepted missions (Mission details); unit toggles shared.
- [x] 7 briefing tests + 33 related tests passed; signed-in desktop/mobile dashboard check with a simulated active flight (no data written), Dispatch/Missions load without errors. A real dispatched flight was not opened.

## Special missions require an aircraft on site
- [x] Accept only with an available airline aircraft parked at the origin that fits the cargo; board shows "reposition to X to accept" or "REG ready at X", Accept disabled otherwise.
- [x] 20 mission tests passed (on-site, elsewhere, busy, too small, personal aircraft); applied definition confirmed; signed-in board checked with 0 of 13 Accept buttons enabled (no aircraft at any origin), no runtime errors. Green "ready" state covered by tests only.

## Divert guidance and dashboard settlement refresh
- [x] Keep diverted flights visible with direct Dispatch actions on the board, fleet and dashboard banner; prioritize diverted aircraft and explain continuation refuelling before taxi, frozen fuel plans and cancellation vs abandonment.
- [x] Shared 15-second board polling refreshes fleet, authoritative balance, filtered history and aircraft details; observed arrivals show ARRIVED confirmation without a reload. 74 regression tests passed, including external-settlement cache/readback and one-time arrival notification. Existing signed-in Dashboard/Dispatch checked; supplemental browser-only rental divert → Continue → arrival verified on desktop/mobile with automatic rental removal and no overflow/runtime errors. No player flight/company created, deleted or modified; real ACARS/simulator flight remains for the user's test. Database, ACARS and deployment variables unchanged; build OK.

## Unified dispatch payload controls
- [x] Add optional selected passengers to shared quote/dispatch/discovery SQL, retaining auto-load defaults, missions, tank accounting and exact pool reservations.
- [x] Move PAX/Cargo controls into Weight & Balance with live MTOW/fuel limits, revenue/margin preview and Auto-load best mix (highest contribution margin across feasible passenger/cargo mixes).
- [x] 192 tests passed; signed-in rental, owned and disposable leased-aircraft quotes checked on desktop/mobile, Commercial/All-Cargo/Ferry and tankering checked with no overflow/runtime errors. Test dispatch recorded exactly 2 PAX + 72 kg cargo, 133 gal fuel and 2414.49/2495 kg MTOW; cancellation refunded uplift, then admin deletion removed only the test account/company/flight. Build OK, deployment vars and ACARS unchanged. Real simulator flight remains unverified.

## Wide-screen Flight Deck layout
- [x] Widen shared workspace/navigation to 1600px, retain responsive side spacing and reposition decorative Aurora logo outside the workspace from 1840px; no game, database, API or deployment changes.
- [x] Signed-in seven-page checks at 2560px and 390px plus Dashboard/Dispatch at 1366px and 5120px passed: shared width capped at 1600px, no horizontal overflow, Aurora stays outside content and is hidden below 1840px; screenshots checked, no runtime errors, build OK.

## Flight debrief cash clarity
- [x] Separate persistent-tank burn value from landing cash; retain rental burn charges, planned comparisons and contribution margin without database/API/deployment changes.
- [x] Fifteen calculation tests passed, including 1323.53 SC landing cash vs 451.47 SC margin, rental billing, missing values and prior divert costs. Signed-in real Logbook debriefs and supplemental persistent-tank browser fixture checked on desktop/mobile without overflow; build OK. This account has only pre-persistent completed flights, so a real persistent-tank debrief remains unavailable; no player records changed.

## ACARS aircraft plausibility
- [x] Add once-per-leg departure minimum (70% frozen safe fuel) after PREFLIGHT and a raw-burn minimum (35% catalogue burn for PIREP hours >=0.6), retaining reconnect evidence, refund-aware cancellation and continuation handling; ACARS, Flight Deck and vars unchanged. Fuel checks are heuristics, not aircraft identification.
- [x] 131 tests passed, including exact 70%/35%/0.6-hour boundaries, reconnect burn, short flights, forged counters, continuation departure/refund and connect → takeoff → tracked landing → settlement readback. Applied key-checked function definitions confirmed; build OK. Real simulator verification is unavailable here; no player flight modified.

## ACARS continuous GPS and real-time guards
- [x] Enforce 20-minute reconnect, per-leg continuous GPS coverage, divert-aware landing validation and aircraft-specific real-time speed limits; preserve refunds, Flight Deck and deployment vars. Speed windows cover frequent packets; already airborne flights skip retrospective coverage only.
- [x] Applied definitions, permissions and schema verified; isolated RPC flow covers connect → takeoff → tracked route → landing → settlement/readback and duplicate rejection, plus reconnect, phase spoofing, dynamic limits, fuel refunds and continuation. Real simulator/desktop ACARS verification remains unavailable in the sandbox.

## Public dossier hub cleanup
- [x] Merge main-hub FBO capabilities, display included Handling on all active FBOs and suppress duplicate base/map markers; preserve economics and deployment vars.
- [x] Eight tests passed; signed-in FJO dossier from Dashboard and Leaderboard shows EPGD once, Fuel + Handling and one main-hub map marker. Desktop/mobile screenshots verified without overflow or runtime errors; build OK. No database or deployment changes.

## Flight debrief comparisons
- [x] Show frozen planned vs final fuel, time and contribution margin in Logbook and Dispatch, including billing-floor indicators, original diverted contracts and legacy fallbacks.
- [x] Nine calculation tests passed; signed-in real FJO104 debrief opened in Logbook and Dispatch with matching 174.96 SC planned/final, 3.0 gal and 0.35 h. Desktop/mobile screenshots checked with no overflow or runtime errors; build OK. Accounting, ACARS and deployment vars unchanged. Live ACARS savings/floor examples are unavailable on this account and covered by calculation tests instead.

## ACARS reconnect fuel accounting
- [x] Persist observed fuel and cumulative burn per leg; exclude initial PREFLIGHT changes and latch tracking after taxi so reconnect cannot reset it.
- [x] Reconcile verified settlement against cumulative burn, departure/final balance, PIREP and frozen floor; retain refunds, rentals and diverted-leg accounting.
- [x] 156 regression tests passed, including key-checked connect→positions→reconnect→PIREP→tank/ledger readback in isolated SQL, 362→106.3 gal with a restarted 25.7 gal report, preflight menu edits, phase-spoofed refuelling, rentals, continuation and exact manual/guard refunds. Applied columns and function definitions confirmed; build OK, desktop ACARS and deployment vars unchanged. A real simulator crash/reconnect flight remains unverified; no player records repaired or test flights created in the shared database.

## Daily airport fuel markets
- [x] Add bounded daily UTC airport pricing and frozen quote integration, including continuation/FBO prices; preserve ACARS and deployment vars.
- [x] Add admin volatility control (default 0.15, 0–0.50 in 0.01 steps) and departure/destination tankering comparison; 0 restores fixed prices.
- [x] SQL regression tests and signed-in desktop/mobile checks passed: owned EPPW→EPWA shows 7.32 vs 8.38 SC/gal, saving 1.06 SC/gal; Tanker max requotes 28→31 gal, uplift 21.97 SC. Rental EPGD→EPWA shows daily/FBO prices without tankering controls. Admin saved/read back unchanged 0.15, no overflow/runtime errors; build OK. No player flight dispatched, no ACARS desktop flight performed; unchanged frozen-price billing verified by SQL tests.

## Divert & continuation
- [x] Add verified alternate landings, leg cost/tank accounting, locked payload, continuation and abandonment without changing mission deadlines or deployment vars; expired lease return blocked, renewal retains contract lock.
- [x] Add Flight Deck controls for diverted contracts and refuelling the continuation in Dispatch and Crew.
- [x] SQL regression/security tests and signed-in disposable-airline EPGD→EPMB→EPBY passed: 3 PAX retained, 270.58 SC paid only on final arrival. Second EPBY→EPMB divert abandoned through UI, aircraft AVAILABLE at EPMB. Desktop/mobile tank and MTOW panel checked without overflow/runtime errors. Test account/company removed through admin UI; no existing player modified. Actual desktop simulator and Pilot Only flight remain unverified; existing-format key-checked ACARS calls exercised rather than claiming a desktop flight.

## Dashboard global flight board
- [x] Add Global beside Active/Recent using the existing safe, paginated radar feed, with airline/aircraft identity, own-flight badge and UTC ETA; preserve company views and deployment vars.
- [x] Four radar tests passed; signed-in desktop/mobile Global, Active/Recent and manual refresh verified without errors or overflow. Live network returned zero active flights, so airborne live-row verification remains unavailable; supplemental browser-only sample rows verified airline/model, YOU, UTC ETA, READY and automatic 5-second removal/count updates. No player flights created or modified; build OK.

## Administrator account cleanup
- [x] Add admin-only, self-protected company reset/account cleanup with transactional fuel cancellation, foreign-key-safe removal and a tightly scoped ledger DELETE exception.
- [x] Add authenticated reset/delete actions and typed confirmation dialogs in Users & companies; preserve Flight Deck and deployment vars. Personal hangars are excluded from player company mapping; other companies retain deleted pilots' history with attribution detached.
- [x] 35 tests passed including applied SQL cleanup, permission denial, forged scope, fuel/passenger returns and rental retirement. Signed-in disposable company leased C172 (26,050 SC, 1 aircraft), reset to 30,000 SC/0 aircraft and retained Dashboard access; Delete removed it and its Auth identity. Separate No company account deleted through UI. Own account actions hidden; desktop/mobile inspected, no page overflow; build OK. No existing player reset/deleted; active-flight cancellation tested in isolated SQL rather than shared live operations.

## Market licence gates
- [x] Require exact T4+ ratings for leasing and spot rental in both offers/confirmation and transactional acquisition; keep aircraft listed and current rental duration/settlement unchanged.
- [x] 34 tests passed; applied guards confirmed. Signed-in market showed disabled T4–T7 buttons for both modes; all eight direct acquisition requests rejected without changing fleet. Desktop/mobile checked without runtime errors or overflow; build OK. No player acquisition or licence purchase performed.

## Weight-budget planning — stage one
- [x] Added catalogue masses for all nine types and a shared SQL trip-plus-reserve weight budget with 80 kg passengers, bounded passenger/cargo loads, overweight-mission rejection and MTOW landing fees (2.5 SC/t default). Existing discovery/radar and commercial dispatch range limits remain until stage two; payload controls remain until stage three. New unconfigured types fail safely until their masses are configured.
- [x] New quotes freeze trip/reserve gallons, exact density, price and 80% fuel floor; verified ACARS settlement adjusts fuel expense/net before ledger and commission. WEB_MANUAL keeps estimated burn; old dispatched flights retain their quotes. Unused reserve is not billed, cancellation and ingestion protections unchanged. Configuration rows added without overwriting admin tuning; optional seed script preserves defaults in separately imported environments.
- [x] 140 tests passed, including 38 applied-migration integration cases for masses, reserve, cargo, missions, dispatch readback, fuel floor, historical estimates, FBO prices, owner denial and idempotent settlement. Live schema confirmed nine configured types, default settings and denied anonymous helper access. Signed-in EPGD–EPBY Commercial/Ferry quotes read back two weight snapshots, displayed updated landing fees and 0-payload Ferry; no runtime errors/overflow, build OK. No live player flight dispatched/settled or simulator ACARS run; settlement exercised in isolated SQL. Flight Deck and deployment vars unchanged.

## Dashboard radar panorama
- [x] Add a decorative radar sweep and generated night-fjord panorama behind the dashboard header and translucent Home Base; no data or deployment changes.
- [x] Signed-in desktop (1280×1800), current viewport (737×735) and mobile (390×844) checked: image loaded, no overflow or runtime errors, reduced motion stops sweep, Manage bases navigation removes dashboard-only artwork. Preview build OK.

## Flight Deck visual upgrade
- [x] Shared split-flap readouts and read-only owner-scoped operational board beside Fleet; active/recent tabs, refresh, true pilot modes and UTC times. Active query is separate from bounded recent history; no settlement actions added.
- [x] Refresh Index with generated airport-apron imagery and anonymous aggregate telemetry only; no public player flight records or fabricated traffic.
- [x] Add restrained common Flight Deck accents to Dispatch, Logbook, Market, Bases and Radar; preserve controls, economy and deployment vars.
- [x] 37 regression tests passed, preview build OK; signed-in desktop/mobile six-page checks had no runtime errors or page overflow. Recent board showed real arrived/cancelled company flights and freelancer attribution, fleet navigation and refresh worked. Active empty state verified; no currently active flight available, no player flight dispatched. Image loaded; mobile board fits without scrolling sideways.

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

- [x] Spot rental: pilot-chosen Target Fuel counted against MTOW, SimBrief sync, divert continuation, zero-cost ACARS ramp sync, clear fuel guidance

- [x] Dispatch fuel/W&B: kg/lbs and gal/ltr switch (remembered), dual-unit readouts, rule text behind amber (i) popovers

- [x] Special missions: abandon before dispatch (back to board), auto-release after missed deadline with no flight, accept only with a fleet aircraft able to carry the cargo, rules behind (i)
