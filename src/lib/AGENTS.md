- Airport data is never loaded whole: radar/dispatch get size>=4 (limit 1500), owner-touched airports and aggregate activity airports in bounded batches; searches are DB-side, limit 50. Global radar uses the safe get_live_radar_flights projection, paginated every 5 seconds, never private flights queries; endpoint coordinates avoid loading the world catalogue.
- ACARS map positions use validated live GPS only; reconnect status and ingestion enforce a strict 30-minute window from server-received telemetry — prevents simulated movement and indefinite resumes.
- Market acquisition blockers are resolved centrally and displayed explicitly; missing country rules resolve to the shared emergency rule without bypassing financial checks — import coverage must not disable funded acquisitions.
- Recruitment defaults/ranges live in economy_config; SQL validates owner-selected rates and applies defaults only to new companies, preserving existing rates and dispatched-flight snapshots.

- Single-flight rentals use atomic owner/tier-checked SQL acquisition and terminal-flight retirement, never deletion; no lease contracts, while ledger charges count in aircraft/company P&L and dividends.
