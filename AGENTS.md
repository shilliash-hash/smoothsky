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
- Money-changing actions run only in SECURITY DEFINER SQL functions (create_company, lease_aircraft, settle_flight); clients have SELECT-only access — keeps the ledger tamper-proof.
- company_ledger is append-only (trigger blocks UPDATE/DELETE); balance = latest balance_after — full audit trail.
- Transaction history resolves flight references with owner-scoped SECURITY INVOKER joins, filters before its row limit, and includes returned aircraft; settlement descriptions freeze aircraft registration and short flight ID without rewriting past ledger entries.
- Economy settings and aircraft specifications are read from database tables; flight quotes are calculated in SQL and frozen at dispatch — UI and settlement must share the same rules.
- Charter rates use a seven-entry aircraft-tier array with one shared T5–7 rate; revenue breakdown reads the quote's frozen settings and total, avoiding drift from rounded display distances.
- Protected operations use authenticated server functions and owner-scoped RLS; no privileged client queries — company data stays private.
- Web simulation and future ACARS share flight records and settlement; ACARS writes require a separately verified ingestion adapter — manual data cannot impersonate simulator evidence.
- Radar dynamically imports Leaflet and uses Turf nautical-mile/geodesic calculations — avoids SSR browser imports and hand-rolled map geometry.
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
