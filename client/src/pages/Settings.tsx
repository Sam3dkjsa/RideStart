import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, BadgeCheck, Gauge, Info, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { settingsSchema } from "@shared/rideLedger";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CURRENCY_OPTIONS } from "@/lib/rideLedger";

const emptyForm = {
  currency: "INR",
  vehicleEfficiencyKmPerLiter: "",
  fuelPricePerLiter: "",
  maintenanceReservePerKm: "",
};

export default function SettingsPage() {
  const settingsQuery = trpc.rideLedger.settings.get.useQuery();
  const utils = trpc.useUtils();
  const saveMutation = trpc.rideLedger.settings.save.useMutation();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const saved = settingsQuery.data;

  useEffect(() => {
    if (!saved) return;
    setForm({
      currency: saved.currency,
      vehicleEfficiencyKmPerLiter: String(saved.vehicleEfficiencyKmPerLiter),
      fuelPricePerLiter: String(saved.fuelPricePerLiter),
      maintenanceReservePerKm: String(saved.maintenanceReservePerKm),
    });
  }, [saved]);

  function setField(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const parsed = settingsSchema.safeParse({
      currency: form.currency,
      vehicleEfficiencyKmPerLiter: Number(form.vehicleEfficiencyKmPerLiter),
      fuelPricePerLiter: Number(form.fuelPricePerLiter),
      maintenanceReservePerKm: Number(form.maintenanceReservePerKm),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the settings and try again.");
      return;
    }
    try {
      await saveMutation.mutateAsync(parsed.data);
      await utils.rideLedger.settings.get.invalidate();
      toast.success("Cost assumptions saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Settings could not be saved.";
      setFormError(message);
      toast.error(message);
    }
  }

  return (
    <div className="rl-page rl-settings-page">
      <header className="rl-page-header">
        <div>
          <a className="rl-back-link" href="/"><ArrowLeft size={15} /> Back to ledger</a>
          <p className="rl-overline">YOUR RIDING BUSINESS</p>
          <h1>Cost settings</h1>
          <p className="rl-page-subtitle">Tell RideLedger how your vehicle and operating costs work.</p>
        </div>
      </header>

      {settingsQuery.isLoading ? (
        <section className="rl-card rl-loading-card"><span className="rl-spinner" /> Loading your settings…</section>
      ) : settingsQuery.isError ? (
        <div className="rl-inline-error" role="alert">Could not load your settings: {settingsQuery.error.message}</div>
      ) : (
        <div className="rl-settings-grid">
          <section className="rl-card rl-settings-card">
            <div className="rl-section-heading">
              <div className="rl-icon-tile"><Settings2 size={19} /></div>
              <div><p className="rl-overline">PERSONAL ASSUMPTIONS</p><h2>{saved ? "Your current settings" : "Set up your vehicle"}</h2></div>
            </div>
            <p className="rl-muted rl-settings-intro">Enter your own values. RideLedger does not prefill example vehicle or fuel assumptions.</p>
            <form className="rl-form rl-settings-form" onSubmit={submit} noValidate>
              <div className="rl-field">
                <label htmlFor="currency">Display currency</label>
                <select id="currency" value={form.currency} onChange={event => setField("currency", event.target.value)}>
                  {CURRENCY_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
                </select>
                <span className="rl-field-help">New totals and earnings inputs use this currency. Default: INR.</span>
              </div>
              <div className="rl-field">
                <label htmlFor="vehicle-efficiency">Vehicle efficiency <span>km / L</span></label>
                <input id="vehicle-efficiency" type="number" inputMode="decimal" min="0.1" max="150" step="0.001" placeholder="Enter your vehicle’s efficiency" value={form.vehicleEfficiencyKmPerLiter} onChange={event => setField("vehicleEfficiencyKmPerLiter", event.target.value)} required />
                <span className="rl-field-help">Use the mileage you expect while working, not a preset estimate.</span>
              </div>
              <div className="rl-field">
                <label htmlFor="fuel-price">Fuel price per liter <span>{form.currency} / L</span></label>
                <input id="fuel-price" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" placeholder="Enter your local price" value={form.fuelPricePerLiter} onChange={event => setField("fuelPricePerLiter", event.target.value)} required />
              </div>
              <div className="rl-field">
                <label htmlFor="maintenance-rate">Maintenance reserve <span>{form.currency} / km</span></label>
                <input id="maintenance-rate" type="number" inputMode="decimal" min="0" max="100000" step="0.01" placeholder="Enter a reserve per kilometer" value={form.maintenanceReservePerKm} onChange={event => setField("maintenanceReservePerKm", event.target.value)} required />
                <span className="rl-field-help">This is a planning estimate, not a repair bill or a recorded payment.</span>
              </div>
              {formError && <p className="rl-form-error" role="alert">{formError}</p>}
              <Button type="submit" className="rl-submit-button rl-settings-save" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <span className="rl-spinner" /> : saved ? <Save size={16} /> : <BadgeCheck size={16} />}
                {saveMutation.isPending ? "Saving…" : saved ? "Save changes" : "Save my assumptions"}
              </Button>
            </form>
          </section>

          <aside className="rl-settings-side">
            <section className="rl-card rl-explainer-card">
              <div className="rl-icon-tile"><Gauge size={19} /></div>
              <h2>What gets calculated</h2>
              <ul className="rl-formula-list">
                <li><span>Fuel used</span><strong>distance ÷ efficiency</strong></li>
                <li><span>Fuel expense</span><strong>liters × fuel price</strong></li>
                <li><span>Maintenance reserve</span><strong>distance × reserve/km</strong></li>
                <li><span>Net profit</span><strong>gross − all listed costs</strong></li>
              </ul>
            </section>
            <section className="rl-assumption-info">
              <Info size={16} />
              <p>Every saved day keeps a snapshot of the settings used to calculate it. Changes here apply to new entries; historical days keep their original assumptions.</p>
            </section>
            <div className="rl-settings-security"><BadgeCheck size={15} /> Your settings and ledger belong to your signed-in account.</div>
          </aside>
        </div>
      )}
    </div>
  );
}
