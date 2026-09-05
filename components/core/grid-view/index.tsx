"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

const fields = [
  ["age", "Age"], ["gender", "Gender"], ["height", "Height"], ["weight", "Weight"], ["bmi", "BMI"],
  ["systolic_bp", "Systolic BP"], ["diastolic_bp", "Diastolic BP"], ["rbs", "RBS"], ["fbs", "FBS"],
  ["waist", "Waist"], ["hip", "Hip"], ["hba1c", "HbA1c"],
] as const;

type FieldName = (typeof fields)[number][0];
export type DatasetRecord = Record<FieldName, string | number> & { id: string; source?: string; createdAt?: string };

export function GridView({ data, onRecordsChange }: { data: DatasetRecord[]; onRecordsChange: (records: DatasetRecord[]) => void }) {
  const [editing, setEditing] = useState<DatasetRecord | null>(null);
  const [values, setValues] = useState<Record<FieldName, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const beginEdit = (record: DatasetRecord) => {
    setEditing(record);
    setValues(Object.fromEntries(fields.map(([key]) => [key, String(record[key] ?? "")])) as Record<FieldName, string>);
    setError("");
  };

  const saveEdit = async () => {
    if (!editing || !values) return;
    setBusy(true);
    try {
      const response = await fetch("/api/dataset", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...values }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update record");
      onRecordsChange(result.records || []);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update record.");
    } finally {
      setBusy(false);
    }
  };

  const removeRecord = async (record: DatasetRecord) => {
    if (!window.confirm("Remove this training record? Retraining will be required before the model uses the revised dataset.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/dataset?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to remove record");
      onRecordsChange(result.records || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to remove record.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Training records</h2><p className="text-sm text-muted-foreground">Review and correct saved clinical rows for this profile.</p></div>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{data.length} saved</span>
      </div>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow>{fields.map(([, label]) => <TableHead key={label}>{label}</TableHead>)}<TableHead>Source</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.length ? data.map((record) => <TableRow key={record.id}>
              {fields.map(([key]) => <TableCell key={key}>{record[key]}</TableCell>)}
              <TableCell className="capitalize text-muted-foreground">{record.source?.replace("-", " ") || "import"}</TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-1"><Button type="button" size="icon" variant="ghost" onClick={() => beginEdit(record)} disabled={busy} aria-label="Edit record"><Pencil className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" onClick={() => removeRecord(record)} disabled={busy} aria-label="Remove record"><Trash2 className="h-4 w-4" /></Button></div></TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={fields.length + 2} className="h-28 text-center text-muted-foreground">Import a CSV or save a verified record to begin.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Edit training record</DialogTitle><DialogDescription>Use only verified clinical values. Saving marks the model for retraining.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`record-${key}`}>{label}</Label><Input id={`record-${key}`} type="number" step="any" value={values?.[key] ?? ""} onChange={(event) => setValues((current) => current ? { ...current, [key]: event.target.value } : current)} /></div>)}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="button" onClick={saveEdit} disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
