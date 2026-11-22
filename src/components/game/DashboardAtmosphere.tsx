import fjord from "@/assets/dashboard-fjord.webp.asset.json";

/** Decorative instrument artwork only; never represents live flight telemetry. */
export function DashboardAtmosphere() {
  return (
    <div className="dashboard-atmosphere" aria-hidden="true">
      <img className="dashboard-terrain" src="/dashboard-fjord.webp" alt="" fetchPriority="high" />
      <div className="dashboard-terrain-shade" />
      <svg className="dashboard-radar" viewBox="0 0 600 600" fill="none">
        <defs>
          <linearGradient id="dashboard-sweep-fill" x1="300" y1="300" x2="510" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--primary)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <g className="dashboard-radar-grid">
          {[70, 135, 200, 265].map(radius => <circle key={radius} cx="300" cy="300" r={radius} />)}
          {[0, 30, 60, 90, 120, 150].map(angle => <path key={angle} d="M300 25V575" transform={`rotate(${angle} 300 300)`} />)}
          {Array.from({ length: 72 }, (_, i) => <path key={i} d={i % 6 === 0 ? "M300 20V35" : "M300 20V26"} transform={`rotate(${i * 5} 300 300)`} />)}
        </g>
        <g className="dashboard-radar-sweep">
          <path d="M300 300L487.4 112.6A265 265 0 0 0 300 35Z" fill="url(#dashboard-sweep-fill)" />
          <path d="M300 300V35" stroke="var(--primary)" strokeOpacity="0.5" />
        </g>
        <g className="dashboard-radar-echoes">
          <path d="M390 150v12m-6-6h12M204 235v12m-6-6h12M410 358v12m-6-6h12" />
          <circle cx="390" cy="156" r="13" /><circle cx="204" cy="241" r="10" />
          <path d="M390 156l-15 24M204 241l-10 22M410 364l18 18" strokeDasharray="2 5" />
        </g>
      </svg>
    </div>
  );
}
