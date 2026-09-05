import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";

export const TRAINING_COLUMNS = [
  "age", "gender", "height", "weight", "bmi", "systolic_bp",
  "diastolic_bp", "rbs", "fbs", "waist", "hip", "hba1c",
] as const;

export type TrainingColumn = (typeof TRAINING_COLUMNS)[number];
export type TrainingRecord = Record<TrainingColumn, number> & {
  id: string;
  createdAt: string;
  source: "import" | "verified-outcome" | "manual";
};

export type SerializedModel = {
  id: string;
  trainedAt: string;
  sampleCount: number;
  metrics?: { mae: number; mse: number; validationMae?: number; validationMse?: number };
  normalization: {
    mode: "zscore" | "minmax";
    first: number[];
    second: number[];
  };
  weights: Array<{ shape: number[]; values: number[] }>;
};

export type TrainingWorkspace = {
  records: TrainingRecord[];
  model: SerializedModel | null;
  modelVersions?: SerializedModel[];
  needsRetraining?: boolean;
  lastImportAt: string | null;
  updatedAt: string;
};

const DATA_DIRECTORY = path.join(process.cwd(), ".data", "training");
const isKvConfigured = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

function ensureStorageConfigured() {
  if (process.env.NODE_ENV === "production" && !isKvConfigured) {
    throw new Error("Persistent training storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.");
  }
}

function getKey(userId: string) {
  return `training-workspace:${userId}`;
}

function getFilePath(userId: string) {
  return path.join(DATA_DIRECTORY, `${userId}.json`);
}

function emptyWorkspace(): TrainingWorkspace {
  return { records: [], model: null, modelVersions: [], lastImportAt: null, updatedAt: new Date().toISOString() };
}

async function readLocalWorkspace(userId: string): Promise<TrainingWorkspace> {
  try {
    const raw = await fs.readFile(getFilePath(userId), "utf-8");
    return JSON.parse(raw) as TrainingWorkspace;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyWorkspace();
    if (error instanceof SyntaxError) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return JSON.parse(await fs.readFile(getFilePath(userId), "utf-8")) as TrainingWorkspace;
    }
    throw error;
  }
}

export async function readTrainingWorkspace(userId: string): Promise<TrainingWorkspace> {
  ensureStorageConfigured();
  if (isKvConfigured) {
    const stored = await kv.get<TrainingWorkspace>(getKey(userId));
    return stored && Array.isArray(stored.records) ? stored : emptyWorkspace();
  }

  const stored = await readLocalWorkspace(userId);
  return Array.isArray(stored.records) ? stored : emptyWorkspace();
}

export async function saveTrainingWorkspace(userId: string, workspace: TrainingWorkspace) {
  const next = { ...workspace, updatedAt: new Date().toISOString() };
  if (isKvConfigured) {
    await kv.set(getKey(userId), next);
    return next;
  }

  await fs.mkdir(DATA_DIRECTORY, { recursive: true });
  const filePath = getFilePath(userId);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2), "utf-8");
  await fs.rename(temporaryPath, filePath);
  return next;
}

export function createRecord(
  values: Record<TrainingColumn, number>,
  source: TrainingRecord["source"]
): TrainingRecord {
  return { id: randomUUID(), createdAt: new Date().toISOString(), source, ...values };
}

export function recordFingerprint(record: Pick<TrainingRecord, TrainingColumn>): string {
  return TRAINING_COLUMNS.map((column) => record[column]).join("|");
}

export function workspaceSummary(workspace: TrainingWorkspace) {
  return {
    recordCount: workspace.records.length,
    verifiedOutcomeCount: workspace.records.filter((record) => record.source === "verified-outcome").length,
    lastImportAt: workspace.lastImportAt,
    lastTrainedAt: workspace.model?.trainedAt ?? null,
    modelSampleCount: workspace.model?.sampleCount ?? 0,
    modelMetrics: workspace.model?.metrics ?? null,
    modelVersionCount: workspace.modelVersions?.length ?? 0,
    pendingRetraining: Boolean(workspace.needsRetraining || (workspace.model && workspace.records.length > workspace.model.sampleCount)),
  };
}
