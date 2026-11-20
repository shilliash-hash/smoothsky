<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Account entry points use nullable owner-scoped company/profile reads and career-aware destinations; admin access is company-independent — supports pilot-only accounts.
- Flight Logbook reads all completed owner flights with paginated RLS-scoped queries, includes retired aircraft, and uses settled net/minutes rather than current quotes or accelerated elapsed time — preserves historical results without schema changes.
- Money-changing actions run only in SECURITY DEFINER SQL functions (create_company, lease_aircraft, settle_flight); clients have SELECT-only access — keeps the ledger tamper-proof.
- company_ledger is append-only (trigger blocks UPDATE/DELETE); balance = latest balance_after — full audit trail.
- Transaction history resolves flight references with owner-scoped SECURITY INVOKER joins, filters before its row limit, and includes returned aircraft; settlement descriptions freeze flight number, registration and route without rewriting past ledger entries.
- Flight numbers are allocated under a company-row lock from ICAO + a sequence starting at 101, unique per company, with an authenticated dispatch-time override; UUIDs remain internal references so readable identities do not affect ledger integrity.
- Economy settings and aircraft specifications are read from database tables; flight quotes are calculated in SQL and frozen at dispatch — UI and settlement must share the same rules.
- Charter uses seven tier rates (shared T5–7); SQL freezes exact-distance reduction and rate for passengers, cargo and UI — prevents rounded-boundary drift.
- Protected operations use authenticated server functions and owner-scoped RLS; no privileged client queries — company data stays private.
- Web simulation and future ACARS share flight records and settlement; ACARS writes require a separately verified ingestion adapter — manual data cannot impersonate simulator evidence.
- Radar dynamically imports Leaflet and uses Turf nautical-mile/geodesic calculations — avoids SSR browser imports and hand-rolled map geometry.
- Radar airport popups live on the map, not replaceable marker layers; memoize airport filters so clock ticks do not rebuild markers — keeps airport details open during refresh and panning.
- Airport imports retain source provenance, provisional size classification and nullable fuel/runway data — missing information must not be fabricated.
- Administrator authorization lives in protected user_roles and is checked by authenticated server functions and RLS; profile metadata never grants privileges.
- Simulated airport fuel is separate from nullable real-world availability; dispatch reserves stock transactionally and cancellation returns it exactly once.
- Radar metrics expose only aggregate airport activity and stock, never other companies' flight details; pagination covers the entire network.
- Compute radar-wide supplies with set-based joins and one economy-settings read, not per-airport helper calls; this avoids statement timeouts across the full network.
- Lease contracts store term/rate snapshots; authenticated SQL synchronizes due weekly ledger payments before operations, caps billing at expiry and excludes returned aircraft from active fleet limits.
- Aircraft P&L aggregates the complete owner ledger by registration/flight reference and accrues lease cost across contract periods; refundable deposits are assets, not expenses.
- Fuel mass uses editable fuel-specific densities and exact US-gallon/litre and pound/kg conversion constants; planned reserve is separate from billed consumption and never constitutes ACARS validation.
- Country registration rules live in a read-only catalogue; acquisition serializes allocation and enforces a global normalized unique index, preserving old registrations for ledger references.
- Owned aircraft use a transactional purchase ledger entry and price snapshot, bypass lease expiry checks, and do not count toward lease limits; acquisition is an asset, not an operating expense.
- Daily results aggregate the complete owner ledger and prorated contract accrual in SQL; web-test arrivals settle idempotently on authenticated operational refresh, never as ACARS evidence.
- FOB investments and obligations serialize on the owner company row; SQL freezes airport-specific discounts into quotes and settlement consumes those quotes — prevents double billing and quote drift.
- Financial debt is the negative ledger cash balance after obligations; recovery closes infrastructure and liquidates aircraft via new ledger entries without deleting history — preserves auditability.
- Airport supply reset is admin-only and refuses active flights under a dispatch-blocking table lock — preserves transactional fuel reservations.
- Leaderboard reads use an authenticated aggregate-only SQL function; net worth values active aircraft/deposits and FOB ledger investment, excluding retired assets, and UTC weekly snapshots are captured lazily to avoid external scheduling dependencies. Supporter badges are cosmetic and changed only by admin-checked SQL functions.
- ACARS routes call key-checking SQL; positions overwrite flight telemetry; PIREPs reuse settle_flight; SimBrief only prefills dispatch — one settlement path.
- Pilot careers live on profiles (role, callsign, type ratings, single roster contract) with a separate append-only pilot_ledger; Pilot Only careers never receive a starting grant and change only through SECURITY DEFINER functions — prevents multi-account cash farming.
- ACARS position rate limits, plausibility checks and duplicate-PIREP rejection run inside the key-checking SQL functions, so every gateway path enforces them.
- Pilot flights use pilot_flight_action acting as aircraft owner; flights triggers attach pilot context, enforce reservations and split commission/payout to pilot_ledger — one settlement path.
- Personal aircraft sit in a hidden is_personal company of the pilot (filter is_personal=false in company reads); stakes ≤30% priced from net worth, 7-day lock, weekly dividends from operating profit.
- Cargo/missions pass options to flight_quote_cargo via a transaction-local setting; mission board refreshes lazily, late cuts apply in settle_flight — one settlement path.
- Homepage reads only anon aggregate counts — no player data.
- Used market: flights-completion trigger accrues airframe hours; SQL depreciated_value prices net worth, broker and P2P listings — one valuation rule.
