"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { KeyRound, Loader2, Lock, Palette, Save, ShieldAlert, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Segmented } from "@/components/shared/segmented";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLock } from "@/components/layout/pin-gate";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { formatDateTime } from "@/lib/dates";
import { formatINR, paiseToRupees } from "@/lib/money";
import { DEFAULT_SALARY_SETTINGS } from "@/lib/types";
import { updateSettings, type SettingsView as Settings } from "@/data/settings";
import { changePin } from "@/data/pin";
import { resetAllData } from "@/data/backup";
import { BackupCard } from "./backup-card";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "UTC"];

export function SettingsView({ settings, defaultPin }: { settings: Settings; defaultPin: boolean }) {
  const { theme, setTheme } = useTheme();
  const { lock } = useLock();
  const [form, setForm] = useState({
    monthlyBasicSalary: String(paiseToRupees(settings.monthlyBasicSalaryPaise)),
    standardDailyHours: String(settings.standardDailyHours),
    salaryDivisor: String(settings.salaryDivisor),
    overtimeMultiplier: String(settings.overtimeMultiplier),
    paydayDay: String(settings.paydayDay),
    timezone: settings.timezone,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState({ current: "", next: "", confirm: "" });
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await updateSettings(form);
      toast.success("Salary settings saved. They apply to months you have not saved yet.");
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (pin.next !== pin.confirm) return setPinError("The new PINs do not match.");
    setPinBusy(true);
    try {
      await changePin(pin.current, pin.next);
      toast.success("PIN changed");
      setPin({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPinError(errorMessage(err));
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Salary, backups, PIN and appearance.</p>
      </div>

      <Card id="salary" className="scroll-mt-20">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" /> Change salary
            </CardTitle>
            <CardDescription className="mt-1">
              A new salary applies to months you have not saved yet. Saved and received salaries keep their amounts.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4" noValidate>
            <Field label="Monthly basic salary (₹)" htmlFor="s-salary" error={errors.monthlyBasicSalary} hint={`Default ${formatINR(DEFAULT_SALARY_SETTINGS.monthlyBasicSalaryPaise)}`}>
              <MoneyInput id="s-salary" value={form.monthlyBasicSalary} onChange={(v) => setForm({ ...form, monthlyBasicSalary: v })} invalid={Boolean(errors.monthlyBasicSalary)} />
            </Field>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Field label="Daily working hours" htmlFor="s-hours" error={errors.standardDailyHours} hint="Hourly = daily ÷ this">
                <Input id="s-hours" inputMode="decimal" value={form.standardDailyHours} onChange={set("standardDailyHours")} />
              </Field>
              <Field label="Salary divisor (days)" htmlFor="s-div" error={errors.salaryDivisor} hint="Daily = salary ÷ this">
                <Input id="s-div" inputMode="numeric" value={form.salaryDivisor} onChange={set("salaryDivisor")} />
              </Field>
              <Field label="Overtime multiplier" htmlFor="s-mult" error={errors.overtimeMultiplier} hint="1 = normal hourly rate">
                <Input id="s-mult" inputMode="decimal" value={form.overtimeMultiplier} onChange={set("overtimeMultiplier")} />
              </Field>
              <Field label="Payday (next month)" htmlFor="s-day" error={errors.paydayDay} hint="10 = October salary paid 10 Nov">
                <Input id="s-day" inputMode="numeric" value={form.paydayDay} onChange={set("paydayDay")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency" htmlFor="s-cur">
                <Input id="s-cur" value="INR (₹)" disabled readOnly />
              </Field>
              <Field label="Timezone" htmlFor="s-tz" error={errors.timezone}>
                <Select id="s-tz" value={form.timezone} onChange={set("timezone")}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{settings.updatedAt ? `Last changed ${formatDateTime(settings.updatedAt, settings.timezone)}` : ""}</p>
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Save salary settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <BackupCard />

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> PIN lock
            </CardTitle>
            <CardDescription className="mt-1">
              Asked every time MY PAY is opened.{defaultPin && " You are still using the starting PIN."} The PIN keeps casual eyes out; it does not encrypt the data on this phone, so keep your phone&rsquo;s own screen lock on.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={savePin} className="space-y-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Current PIN" htmlFor="pin-cur">
                <Input id="pin-cur" type="password" inputMode="numeric" autoComplete="off" value={pin.current} onChange={(e) => setPin({ ...pin, current: digits(e.target.value) })} />
              </Field>
              <Field label="New PIN" htmlFor="pin-new" hint="4 to 8 digits">
                <Input id="pin-new" type="password" inputMode="numeric" autoComplete="off" value={pin.next} onChange={(e) => setPin({ ...pin, next: digits(e.target.value) })} />
              </Field>
              <Field label="Confirm new PIN" htmlFor="pin-confirm">
                <Input id="pin-confirm" type="password" inputMode="numeric" autoComplete="off" value={pin.confirm} onChange={(e) => setPin({ ...pin, confirm: digits(e.target.value) })} />
              </Field>
            </div>
            {pinError && <p className="text-sm font-medium text-danger">{pinError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline" disabled={pinBusy || pin.current.length < 4 || pin.next.length < 4}>
                {pinBusy && <Loader2 className="animate-spin" />} Change PIN
              </Button>
              <Button type="button" variant="ghost" onClick={lock}>
                <Lock /> Lock now
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-4 text-primary" /> Theme
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Segmented
            label="Theme"
            value={(theme as "light" | "dark" | "system") ?? "light"}
            onChange={setTheme}
            className="sm:max-w-sm"
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-4 text-primary" /> About your data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Everything is stored only in this browser on this device (IndexedDB). Nothing is sent to a server, and MY PAY works offline. Clearing the browser&rsquo;s site data, or uninstalling the browser, deletes it, so download a backup regularly and keep it somewhere safe.
          </p>
          <div className="rounded-xl border border-danger/25 bg-danger-soft/50 p-3.5">
            <p className="flex items-center gap-2 font-semibold text-danger">
              <ShieldAlert className="size-4" /> Delete all data
            </p>
            <p className="mt-1 text-xs">Removes every salary, debt and transaction from this device. Download a backup first.</p>
            <Button variant="outline" className="mt-3 text-danger" onClick={() => setResetOpen(true)}>
              Delete all data…
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Delete all data on this device?"
        description="All salaries, debts, repayments and transactions on this phone will be permanently deleted. This cannot be undone unless you have a backup file."
        confirmLabel="Delete everything"
        destructive
        requireText="DELETE"
        onConfirm={async () => {
          try {
            await resetAllData();
            toast.success("All data deleted");
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </div>
  );
}
