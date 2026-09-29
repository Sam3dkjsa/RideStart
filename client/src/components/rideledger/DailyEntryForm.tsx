import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarDays, Check, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { calculateRideCosts, entryInputSchema } from "@shared/rideLedger";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { LedgerRecord } from "@/lib/rideLedger";
import { formatCurrency, formatQuantity } from "@/lib/rideLedger";

type Settings = {
  currency: string;
  vehicleEfficiencyKmPerLiter: string;
  fuelPricePerLiter: string;
  maintenanceReservePerKm: string;
};

type Props = {
  settings: Settings | null;
  editingEntry: LedgerRecord | null;
  onCancelEdit: () => void;
  onSaved: () => void;
};

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const blankDraft = () => ({
  rideDate: localToday(),
  ridesCompleted: "0",
  distanceKm: "",
  grossEarnings: "",
  platformFees: "0",
  otherCosts: "0",
});

export default function DailyEntryForm({ settings, editingEntry, onCancelEdit, onSaved }: Props) {
  const [draft, setDraft] = useState(blankDraft);
  const [formError, setFormError] = useState("");
  const utils = trpc.useUtils();
  const createMutation = trpc.rideLedger.ledger.create.useMutation();
  const updateMutation = trpc.rideLedger.ledger.update.useMutation();
  const pending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!editingEntry) {
      setDraft(blankDraft());
      setFormError("");
      return;
    }
    setDraft({
      rideDate: editingEntry.rideDate,
      ridesCompleted: String(editingEntry.ridesCompleted),
      distanceKm: String(editingEntry.distanceKm),
      grossEarnings: String(editingEntry.grossEarnings),
      platformFees: String(editingEntry.platformFees),
      otherCosts: String(editingEntry.otherCosts),
    });
    setFormError("");
  }, [editingEntry]);

  const effectiveAssumptions = useMemo(() => {
    if (editingEntry) {
      return {
        vehicleEfficiencyKmPerLiter: Number(editingEntry.assumptionVehicleEfficiencyKmPerLiter),
        fuelPricePerLiter: Number(editingEntry.assumptionFuelPricePerLiter),
        maintenanceReservePerKm: Number(editingEntry.assumptionMaintenanceReservePerKm),
      };
    }
    if (settings) {
      return {
        vehicleEfficiencyKmPerLiter: Number(settings.vehicleEfficiencyKmPerLiter),
        fuelPricePerLiter: Number(settings.fuelPricePerLiter),
        maintenanceReservePerKm: Number(settings.maintenanceReservePerKm),
      };
    }
    return null;
  }, [editingEntry, settings]);

  const preview = useMemo(() => {
    if (!effectiveAssumptions || !draft.distanceKm || !draft.grossEarnings) return null;
    try {
      return calculateRideCosts(
        {
          distanceKm: Number(draft.distanceKm),
          grossEarnings: Number(draft.grossEarnings),
          platformFees: Number(draft.platformFees || 0),
          otherCosts: Number(draft.otherCosts || 0),
        },
        effectiveAssumptions,
      );
    } catch {
      return null;
    }
  }, [draft, effectiveAssumptions]);

  function setField(field: keyof typeof draft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const parsed = entryInputSchema.safeParse({
      rideDate: draft.rideDate,
      ridesCompleted: Number(draft.ridesCompleted),
      distanceKm: Number(draft.distanceKm),
      grossEarnings: Number(draft.grossEarnings),
      platformFees: Number(draft.platformFees),
      otherCosts: Number(draft.otherCosts),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the entry fields and try again.");
      return;
    }
    if (!settings) {
      setFormError("Save your vehicle and cost assumptions before adding a daily entry.");
      return;
    }
    try {
      if (editingEntry) {
        await updateMutation.mutateAsync({ id: editingEntry.id, ...parsed.data });
        toast.success("Daily entry updated");
      } else {
        await createMutation.mutateAsync(parsed.data);
        toast.success("Daily entry saved");
      }
      await utils.rideLedger.ledger.list.invalidate();
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The entry could not be saved.";
      setFormError(message);
      toast.error(message);
    }
  }

  if (!settings) {
    return (
      <section className="rl-card rl-setup-callout">
        <div className="rl-icon-tile"><ArrowUpRight size={18} /></div>
        <div>
          <h2>Set up your cost assumptions first</h2>
          <p>RideLedger uses your vehicle efficiency, fuel price, and maintenance reserve to calculate real net profit.</p>
          <a className="rl-text-link" href="/settings">Open cost settings <ArrowUpRight size={14} /></a>
        </div>
      </section>
    );
  }

  return (
    <section className="rl-card rl-form-card">
      <div className="rl-section-heading">
        <div className="rl-icon-tile"><CalendarDays size={18} /></div>
        <div>
          <p className="rl-overline">DAILY LEDGER</p>
          <h2>{editingEntry ? "Edit a day" : "Log today’s work"}</h2>
        </div>
      </div>
      <p className="rl-muted rl-form-intro">
        {editingEntry ? "This entry keeps the cost assumptions saved on that day." : "One entry per calendar date. Your settings are saved with each day."}
      </p>
      <form onSubmit={submit} className="rl-form" noValidate>
        <div className="rl-field">
          <label htmlFor="ride-date">Work date</label>
          <input id="ride-date" type="date" value={draft.rideDate} onChange={event => setField("rideDate", event.target.value)} required />
        </div>
        <div className="rl-form-row">
          <div className="rl-field">
            <label htmlFor="rides-completed">Rides completed</label>
            <input id="rides-completed" type="number" inputMode="numeric" min="0" max="500" step="1" value={draft.ridesCompleted} onChange={event => setField("ridesCompleted", event.target.value)} required />
          </div>
          <div className="rl-field">
            <label htmlFor="distance-km">Distance <span>km</span></label>
            <input id="distance-km" type="number" inputMode="decimal" min="0" max="2000" step="0.01" placeholder="0.00" value={draft.distanceKm} onChange={event => setField("distanceKm", event.target.value)} required />
          </div>
        </div>
        <div className="rl-field">
          <label htmlFor="gross-earnings">Gross earnings <span>{settings.currency}</span></label>
          <input id="gross-earnings" type="number" inputMode="decimal" min="0" max="100000000" step="0.01" placeholder="0.00" value={draft.grossEarnings} onChange={event => setField("grossEarnings", event.target.value)} required />
        </div>
        <div className="rl-form-row">
          <div className="rl-field">
            <label htmlFor="platform-fees">Platform fees <span>{settings.currency}</span></label>
            <input id="platform-fees" type="number" inputMode="decimal" min="0" max="100000000" step="0.01" placeholder="0.00" value={draft.platformFees} onChange={event => setField("platformFees", event.target.value)} required />
          </div>
          <div className="rl-field">
            <label htmlFor="other-costs">Other costs <span>{settings.currency}</span></label>
            <input id="other-costs" type="number" inputMode="decimal" min="0" max="100000000" step="0.01" placeholder="0.00" value={draft.otherCosts} onChange={event => setField("otherCosts", event.target.value)} required />
          </div>
        </div>
        {preview && (
          <div className="rl-preview-box" aria-live="polite">
            <div><span>Fuel estimate</span><strong>{formatQuantity(preview.fuelLiters, 3)} L · {formatCurrency(preview.fuelCost, settings.currency)}</strong></div>
            <div><span>Maintenance reserve</span><strong>{formatCurrency(preview.maintenanceReserve, settings.currency)}</strong></div>
            <div className="rl-preview-net"><span>Estimated net profit</span><strong>{formatCurrency(preview.netProfit, settings.currency)}</strong></div>
          </div>
        )}
        {formError && <p role="alert" className="rl-form-error">{formError}</p>}
        <div className="rl-form-actions">
          {editingEntry && <Button type="button" variant="outline" onClick={onCancelEdit} disabled={pending}><X size={15} /> Cancel</Button>}
          <Button type="submit" className="rl-submit-button" disabled={pending}>
            {pending ? <span className="rl-spinner" /> : editingEntry ? <Save size={16} /> : <Plus size={16} />}
            {pending ? "Saving…" : editingEntry ? "Update day" : "Save day"}
          </Button>
        </div>
      </form>
      <p className="rl-form-footnote"><Check size={13} /> Estimates use your saved settings. You can edit this day later.</p>
    </section>
  );
}
