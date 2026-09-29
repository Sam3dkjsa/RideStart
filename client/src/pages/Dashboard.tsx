import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Bike, CalendarRange, ChartNoAxesCombined, CircleDollarSign, Fuel, Gauge, Pencil, Plus, Route, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import DailyEntryForm from "@/components/rideledger/DailyEntryForm";
import { trpc } from "@/lib/trpc";
import { downloadLedgerCsv, formatCalendarDate, formatCurrency, formatQuantity, type LedgerRecord } from "@/lib/rideLedger";
import { buildRideTrendSeries, sumDecimalValues } from "@shared/rideLedger";

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function firstOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function friendlyRange(from: string, to: string) {
  if (!from || !to) return "Select a date range";
  if (from === to) return formatCalendarDate(from, { year: undefined });
  return `${formatCalendarDate(from, { year: undefined })} — ${formatCalendarDate(to, { year: undefined })}`;
}

function StatCard({ label, value, suffix, icon: Icon, tone = "mint", note }: {
  label: string;
  value: string;
  suffix?: string;
  icon: typeof Bike;
  tone?: "mint" | "amber" | "neutral";
  note?: string;
}) {
  return (
    <article className={`rl-stat-card rl-tone-${tone}`}>
      <div className="rl-stat-top"><span>{label}</span><span className="rl-stat-icon"><Icon size={16} /></span></div>
      <div className="rl-stat-value">{value}{suffix && <span className="rl-stat-suffix">{suffix}</span>}</div>
      {note && <div className="rl-stat-note">{note}</div>}
    </article>
  );
}

function LoadingBlock() {
  return <div className="rl-card rl-loading-card"><span className="rl-spinner" /> Loading your ledger…</div>;
}

export default function Dashboard() {
  const today = localToday();
  const [startDate, setStartDate] = useState(() => firstOfMonth(today));
  const [endDate, setEndDate] = useState(today);
  const [editingEntry, setEditingEntry] = useState<LedgerRecord | null>(null);
  const settingsQuery = trpc.rideLedger.settings.get.useQuery();
  const entriesQuery = trpc.rideLedger.ledger.list.useQuery({ startDate, endDate });
  const exportQuery = trpc.rideLedger.ledger.export.useQuery(undefined, { enabled: false });
  const utils = trpc.useUtils();
  const deleteMutation = trpc.rideLedger.ledger.delete.useMutation();
  const settings = settingsQuery.data;
  const currency = settings?.currency ?? "INR";
  const entries = entriesQuery.data ?? [];
  const busy = settingsQuery.isLoading || entriesQuery.isLoading;

  const totals = useMemo(() => ({
    rides: entries.reduce((total, entry) => total + entry.ridesCompleted, 0),
    distance: sumDecimalValues(entries.map(entry => entry.distanceKm), 2),
    gross: sumDecimalValues(entries.map(entry => entry.grossEarnings), 2),
    fees: sumDecimalValues(entries.map(entry => entry.platformFees), 2),
    otherCosts: sumDecimalValues(entries.map(entry => entry.otherCosts), 2),
    liters: sumDecimalValues(entries.map(entry => entry.fuelLiters), 3),
    fuel: sumDecimalValues(entries.map(entry => entry.fuelCost), 2),
    maintenance: sumDecimalValues(entries.map(entry => entry.maintenanceReserve), 2),
    net: sumDecimalValues(entries.map(entry => entry.netProfit), 2),
  }), [entries]);

  const chartData = useMemo(() => buildRideTrendSeries(entries), [entries]);
  const fuelTrendData = chartData.filter(point => point.efficiencyKmPerLiter !== null);

  async function exportCsv() {
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        downloadLedgerCsv(result.data);
        toast.success(`Exported ${result.data.length} of your daily entries`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV export failed.");
    }
  }

  async function deleteEntry(entry: LedgerRecord) {
    const ok = window.confirm(`Delete the ledger entry for ${formatCalendarDate(entry.rideDate)}? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync({ id: entry.id });
      await utils.rideLedger.ledger.list.invalidate();
      toast.success("Daily entry deleted");
      if (editingEntry?.id === entry.id) setEditingEntry(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The entry could not be deleted.");
    }
  }

  if (busy) return <div className="rl-page"><LoadingBlock /></div>;

  return (
    <div className="rl-page">
      <header className="rl-page-header">
        <div>
          <p className="rl-overline">YOUR RIDING BUSINESS</p>
          <h1>Daily ledger</h1>
          <p className="rl-page-subtitle">A clear view of what each workday really earns.</p>
        </div>
        <div className="rl-header-actions">
          <Button type="button" variant="outline" onClick={exportCsv} disabled={exportQuery.isFetching}>
            <ArrowDownToLine size={16} /> {exportQuery.isFetching ? "Preparing…" : "Export CSV"}
          </Button>
        </div>
      </header>

      <section className="rl-range-bar" aria-label="Dashboard date range">
        <div className="rl-range-label"><CalendarRange size={17} /><span>Summary period</span><strong>{friendlyRange(startDate, endDate)}</strong></div>
        <div className="rl-range-fields">
          <label>From <input type="date" value={startDate} max={endDate || undefined} onChange={event => setStartDate(event.target.value)} /></label>
          <span className="rl-range-arrow">→</span>
          <label>To <input type="date" value={endDate} min={startDate || undefined} max={today} onChange={event => setEndDate(event.target.value)} /></label>
        </div>
      </section>

      {settingsQuery.isError && <div className="rl-inline-error" role="alert">Could not load your settings: {settingsQuery.error.message}</div>}
      {entriesQuery.isError && <div className="rl-inline-error" role="alert">Could not load this date range: {entriesQuery.error.message}</div>}

      {!settings && (
        <section className="rl-onboarding-banner">
          <div className="rl-icon-tile"><ShieldCheck size={19} /></div>
          <div><strong>Start with your own vehicle assumptions</strong><p>No sample costs or earnings are prefilled. Add your vehicle efficiency, fuel price, and maintenance reserve to unlock daily profit estimates.</p></div>
          <a href="/settings" className="rl-text-link">Set up RideLedger <ArrowUpRight size={14} /></a>
        </section>
      )}

      <section className="rl-stat-grid" aria-label="Date-range key metrics">
        <StatCard label="Net profit" value={formatCurrency(totals.net, currency)} icon={CircleDollarSign} tone="mint" note={entries.length ? "After listed costs and reserve" : "No entries in this range"} />
        <StatCard label="Gross earnings" value={formatCurrency(totals.gross, currency)} icon={ArrowUpRight} tone="neutral" note="Before fees and operating costs" />
        <StatCard label="Distance traveled" value={formatQuantity(totals.distance)} suffix=" km" icon={Route} tone="neutral" note={`${formatQuantity(totals.liters, 3)} L estimated fuel`} />
        <StatCard label="Rides completed" value={formatQuantity(totals.rides, 0)} icon={Bike} tone="amber" note={`${entries.length} logged ${entries.length === 1 ? "day" : "days"}`} />
      </section>

      <div className="rl-dashboard-grid">
        <div className="rl-dashboard-main">
          <div className="rl-chart-pair">
            <section className="rl-card rl-chart-card">
              <div className="rl-card-heading">
                <div><p className="rl-overline">PROFITABILITY</p><h2>Net profit trend</h2></div>
                <span className="rl-period-pill">{entries.length} {entries.length === 1 ? "day" : "days"}</span>
              </div>
              {chartData.length ? (
                <div className="rl-chart-wrap" role="img" aria-label="Net profit by day from your saved entries">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 5, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#69D6B4" stopOpacity={0.25} /><stop offset="95%" stopColor="#69D6B4" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(177, 205, 199, .10)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={value => formatCalendarDate(String(value), { year: undefined, day: "numeric", month: "short" })} tick={{ fill: "#94AAA8", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tickFormatter={value => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))} tick={{ fill: "#94AAA8", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip
                        contentStyle={{ background: "#182A2D", border: "1px solid #315052", borderRadius: 12, color: "#EEF5F3" }}
                        labelStyle={{ color: "#A8BFBA", marginBottom: 4 }}
                        labelFormatter={value => formatCalendarDate(String(value))}
                        formatter={value => [formatCurrency(Number(value ?? 0), currency), "Net profit"]}
                      />
                      <Area type="monotone" dataKey="netProfit" name="Net profit" stroke="#69D6B4" strokeWidth={2.5} fill="url(#netFill)" activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rl-chart-empty"><div className="rl-empty-icon"><ChartNoAxesCombined size={23} /></div><strong>No saved days in this period</strong><span>Log a workday to see your net-profit trend.</span></div>
              )}
            </section>

            <section className="rl-card rl-chart-card">
              <div className="rl-card-heading">
                <div><p className="rl-overline">FUEL ECONOMY</p><h2>Fuel efficiency · km/L</h2></div>
                <span className="rl-period-pill">{fuelTrendData.length} {fuelTrendData.length === 1 ? "day" : "days"}</span>
              </div>
              <p className="rl-chart-caption">Estimated from each saved day’s distance and calculated fuel liters.</p>
              {fuelTrendData.length ? (
                <div className="rl-chart-wrap" role="img" aria-label="Estimated fuel efficiency in kilometers per liter by day from saved entries">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fuelTrendData} margin={{ top: 8, right: 5, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="rgba(177, 205, 199, .10)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={value => formatCalendarDate(String(value), { year: undefined, day: "numeric", month: "short" })} tick={{ fill: "#94AAA8", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tickFormatter={value => formatQuantity(Number(value), 1)} tick={{ fill: "#94AAA8", fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
                      <Tooltip
                        contentStyle={{ background: "#182A2D", border: "1px solid #315052", borderRadius: 12, color: "#EEF5F3" }}
                        labelStyle={{ color: "#A8BFBA", marginBottom: 4 }}
                        labelFormatter={value => formatCalendarDate(String(value))}
                        formatter={value => [`${formatQuantity(Number(value ?? 0), 2)} km/L`, "Estimated efficiency"]}
                      />
                      <Line type="monotone" dataKey="efficiencyKmPerLiter" name="Estimated efficiency" stroke="#F1B567" strokeWidth={2.5} dot={{ r: 3, fill: "#F1B567", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rl-chart-empty"><div className="rl-empty-icon"><Fuel size={23} /></div><strong>No fuel estimates in this period</strong><span>Log a day with distance traveled to see the trend.</span></div>
              )}
            </section>
          </div>

          <section className="rl-breakdown-grid" aria-label="Date-range cost summary">
            <StatCard label="Platform fees" value={formatCurrency(totals.fees, currency)} icon={ArrowDownToLine} tone="neutral" />
            <StatCard label="Fuel cost · estimated" value={formatCurrency(totals.fuel, currency)} icon={Fuel} tone="amber" />
            <StatCard label="Maintenance reserve" value={formatCurrency(totals.maintenance, currency)} icon={Gauge} tone="amber" note="Estimate, not a repair bill" />
            <StatCard label="Other costs" value={formatCurrency(totals.otherCosts, currency)} icon={CircleDollarSign} tone="neutral" />
          </section>

          <section className="rl-card rl-ledger-card">
            <div className="rl-card-heading">
              <div><p className="rl-overline">RECENT ACTIVITY</p><h2>Daily entries</h2></div>
              <span className="rl-period-pill">{friendlyRange(startDate, endDate)}</span>
            </div>
            {entries.length ? (
              <div className="rl-table-wrap">
                <table className="rl-table">
                  <thead><tr><th>Date</th><th>Rides</th><th>Distance</th><th>Gross</th><th>Fuel est.</th><th>Net profit</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{entries.slice(0, 10).map(entry => (
                    <tr key={entry.id}>
                      <td className="rl-date-cell">{formatCalendarDate(entry.rideDate)}</td>
                      <td>{entry.ridesCompleted}</td>
                      <td>{formatQuantity(entry.distanceKm)} km</td>
                      <td>{formatCurrency(entry.grossEarnings, currency)}</td>
                      <td>{formatCurrency(entry.fuelCost, currency)}</td>
                      <td className={`rl-profit-cell ${Number(entry.netProfit) < 0 ? "is-negative" : ""}`}>{formatCurrency(entry.netProfit, currency)}</td>
                      <td><div className="rl-row-actions">
                        <button type="button" aria-label={`Edit entry for ${entry.rideDate}`} title="Edit entry" onClick={() => setEditingEntry(entry)}><Pencil size={15} /></button>
                        <button type="button" aria-label={`Delete entry for ${entry.rideDate}`} title="Delete entry" className="rl-delete-action" onClick={() => void deleteEntry(entry)} disabled={deleteMutation.isPending}><Trash2 size={15} /></button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="rl-ledger-empty"><div className="rl-empty-icon"><Bike size={21} /></div><div><strong>Your ledger starts here</strong><p>There are no records in this date range yet. Add a day on the right; RideLedger won’t fill in demo data.</p></div><a href="/settings" className="rl-text-link">Review assumptions <ArrowUpRight size={14} /></a></div>
            )}
            {entries.length > 10 && <p className="rl-table-footnote">Showing the 10 most recent days in this range. CSV export includes all of your saved records.</p>}
          </section>
        </div>

        <aside className="rl-dashboard-aside">
          <DailyEntryForm settings={settings ?? null} editingEntry={editingEntry} onCancelEdit={() => setEditingEntry(null)} onSaved={() => setEditingEntry(null)} />
          {settings && <section className="rl-assumption-note"><ShieldCheck size={15} /><span>Each day keeps its own saved vehicle and cost assumptions. Updating settings won’t rewrite past entries.</span></section>}
        </aside>
      </div>
    </div>
  );
}
