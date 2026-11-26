/** Dependency-free SVG bar chart. Swap for Recharts/ECharts if desired. */
export function BarChart({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 100 ${height / 2}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#456ac7" />
          <stop offset="100%" stopColor="#01279b" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const h = (d.value / max) * (height / 2 - 10);
        return <rect key={d.label} x={i * w + w * 0.2} y={height / 2 - h} width={w * 0.6} height={h} rx="1.2" fill="url(#bar)" opacity="0.9" />;
      })}
    </svg>
  );
}
export const ChartLabels = ({ labels }: { labels: string[] }) => (
  <div className="mt-2 flex text-[11px] text-slate-400">
    {labels.map((l) => (
      <span key={l} className="flex-1 text-center">{l}</span>
    ))}
  </div>
);
