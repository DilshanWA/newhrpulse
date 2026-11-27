/** Dependency-free bar chart. */
export function BarChart({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div
      className="flex w-full items-end gap-2"
      style={{ height }}
      role="img"
      aria-label={`Bar chart: ${data.map(({ label, value }) => `${label}: ${value}`).join(", ")}`}
    >
      {data.map(({ label, value }) => (
        <div key={label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${label}: ${value}`}>
          <span className="text-xs font-medium text-slate-700">{value}</span>
          <div className="flex w-full flex-1 items-end justify-center">
            <div
              aria-hidden="true"
              className={`w-3/5 max-w-12 rounded-t-md transition-all ${value ? "bg-brand-500" : "bg-slate-200"}`}
              style={{ height: `${value ? Math.max(6, (value / max) * 100) : 2}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
export const ChartLabels = ({ labels }: { labels: string[] }) => (
  <div className="mt-2 flex text-[11px] text-slate-400">
    {labels.map((l) => (
      <span key={l} className="flex-1 text-center">{l}</span>
    ))}
  </div>
);
