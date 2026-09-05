import { getSessionFromRequest } from "@/lib/server/auth-session";
import { parseCSV } from "@/lib/server/core/parser";
import {
  createRecord,
  readTrainingWorkspace,
  recordFingerprint,
  saveTrainingWorkspace,
  TRAINING_COLUMNS,
  TrainingColumn,
  TrainingRecord,
  workspaceSummary,
} from "@/lib/server/training-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const MAX_CSV_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_TRAINING_ROWS = 5_000;
const valuesSchema = z.object({
  age: z.coerce.number().finite().min(1).max(120),
  gender: z.coerce.number().int().min(0).max(1),
  height: z.coerce.number().finite().min(50).max(250),
  weight: z.coerce.number().finite().min(10).max(400),
  bmi: z.coerce.number().finite().min(10).max(80),
  systolic_bp: z.coerce.number().finite().min(50).max(300),
  diastolic_bp: z.coerce.number().finite().min(30).max(200),
  rbs: z.coerce.number().finite().min(20).max(700),
  fbs: z.coerce.number().finite().min(20).max(700),
  waist: z.coerce.number().finite().min(30).max(250),
  hip: z.coerce.number().finite().min(30).max(250),
  hba1c: z.coerce.number().finite().min(2).max(20),
}).superRefine((values, context) => {
  if (values.diastolic_bp >= values.systolic_bp) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["diastolic_bp"], message: "must be lower than systolic_bp" });
  }
});
const updateSchema = valuesSchema.extend({ id: z.string().uuid() });

function userId(request: NextRequest) {
  return getSessionFromRequest(request)?.userId ?? null;
}

function validateRow(row: Record<string, string>) {
  const normalized = Object.fromEntries(
    TRAINING_COLUMNS.map((column) => [column, row[column]?.trim()])
  );
  return valuesSchema.safeParse(normalized);
}

export async function GET(request: NextRequest) {
  const id = userId(request);
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const workspace = await readTrainingWorkspace(id);
    return NextResponse.json({
      summary: workspaceSummary(workspace),
      records: workspace.records.slice(0, 100),
      modelHistory: (workspace.modelVersions ?? []).map((model) => ({
        id: model.id,
        trainedAt: model.trainedAt,
        sampleCount: model.sampleCount,
        metrics: model.metrics ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load saved dataset" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const id = userId(request);
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const parsed = valuesSchema.safeParse(await request.json());
      if (!parsed.success) return NextResponse.json({ error: "Provide all 12 valid clinical values, including an actual HbA1c result." }, { status: 400 });
      const workspace = await readTrainingWorkspace(id);
      const record = createRecord(parsed.data as Record<TrainingColumn, number>, "manual");
      if (workspace.records.some((existing) => recordFingerprint(existing) === recordFingerprint(record))) {
        return NextResponse.json({ error: "An identical training record is already saved." }, { status: 409 });
      }
      const next = await saveTrainingWorkspace(id, { ...workspace, records: [...workspace.records, record], needsRetraining: Boolean(workspace.model) });
      return NextResponse.json({ record, summary: workspaceSummary(next), records: next.records.slice(0, 100) }, { status: 201 });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Please upload a CSV file." }, { status: 400 });
    }
    if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "CSV file is too large. Maximum size is 2MB." }, { status: 400 });
    }

    const rows = await parseCSV(file);
    const missingColumns = TRAINING_COLUMNS.filter((column) => !(column in (rows[0] ?? {})));
    if (missingColumns.length) {
      return NextResponse.json({ error: `Missing required columns: ${missingColumns.join(", ")}` }, { status: 400 });
    }

    if (rows.length > MAX_TRAINING_ROWS) {
      return NextResponse.json({ error: `CSV contains too many rows. Maximum is ${MAX_TRAINING_ROWS}.` }, { status: 400 });
    }
    const invalidRows: Array<{ line: number; issues: string[] }> = [];
    const incoming: TrainingRecord[] = [];
    rows.forEach((row, index) => {
      const parsed = validateRow(row);
      if (!parsed.success) invalidRows.push({
        line: index + 2,
        issues: parsed.error.issues.map((issue) => `${issue.path.join(" ") || "value"} ${issue.message}`),
      });
      else incoming.push(createRecord(parsed.data as Record<TrainingColumn, number>, "import"));
    });
    if (!incoming.length) {
      return NextResponse.json({ error: "No valid training rows were found in the CSV." }, { status: 400 });
    }

    const workspace = await readTrainingWorkspace(id);
    const fingerprints = new Set(workspace.records.map(recordFingerprint));
    const uniqueRows = incoming.filter((record) => {
      const fingerprint = recordFingerprint(record);
      if (fingerprints.has(fingerprint)) return false;
      fingerprints.add(fingerprint);
      return true;
    });
    const next = await saveTrainingWorkspace(id, {
      ...workspace,
      records: [...workspace.records, ...uniqueRows],
      lastImportAt: new Date().toISOString(),
      needsRetraining: uniqueRows.length ? Boolean(workspace.model) : workspace.needsRetraining,
    });
    return NextResponse.json({
      imported: uniqueRows.length,
      duplicatesSkipped: incoming.length - uniqueRows.length,
      invalidRows,
      summary: workspaceSummary(next),
      records: next.records.slice(0, 100),
    }, { status: 201 });
  } catch (error) {
    console.error("Dataset import failed:", error);
    return NextResponse.json({ error: "Failed to import training dataset" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = userId(request);
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide all valid clinical values to update this record." }, { status: 400 });
    const workspace = await readTrainingWorkspace(id);
    const current = workspace.records.find((record) => record.id === parsed.data.id);
    if (!current) return NextResponse.json({ error: "Training record not found" }, { status: 404 });
    const replacement = { ...current, ...parsed.data };
    if (workspace.records.some((record) => record.id !== current.id && recordFingerprint(record) === recordFingerprint(replacement))) {
      return NextResponse.json({ error: "An identical training record is already saved." }, { status: 409 });
    }
    const next = await saveTrainingWorkspace(id, {
      ...workspace,
      records: workspace.records.map((record) => record.id === current.id ? replacement : record),
      needsRetraining: Boolean(workspace.model),
    });
    return NextResponse.json({ summary: workspaceSummary(next), records: next.records.slice(0, 100) });
  } catch (error) {
    console.error("Dataset update failed:", error);
    return NextResponse.json({ error: "Failed to update training record" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = userId(request);
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const recordId = request.nextUrl.searchParams.get("id");
  if (!recordId) return NextResponse.json({ error: "A training record id is required" }, { status: 400 });
  try {
    const workspace = await readTrainingWorkspace(id);
    if (!workspace.records.some((record) => record.id === recordId)) return NextResponse.json({ error: "Training record not found" }, { status: 404 });
    const next = await saveTrainingWorkspace(id, {
      ...workspace,
      records: workspace.records.filter((record) => record.id !== recordId),
      needsRetraining: Boolean(workspace.model),
    });
    return NextResponse.json({ summary: workspaceSummary(next), records: next.records.slice(0, 100) });
  } catch (error) {
    console.error("Dataset deletion failed:", error);
    return NextResponse.json({ error: "Failed to remove training record" }, { status: 500 });
  }
}
