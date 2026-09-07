import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase-admin";

type Prediction = {
  predictedHbA1c: number;
  diabeticStatus: string;
  risk: string;
  interpretation: {
    status: string;
    description: string;
    distanceToNextThreshold: string;
  };
};

type PredictionInputs = {
  age: string;
  gender: string;
  height: string;
  weight: string;
  bmi: string;
  systolic_bp: string;
  diastolic_bp: string;
  rbs: string;
  fbs: string;
  waist: string;
  hip: string;
};

export type PredictionHistoryItem = {
  id: string;
  createdAt: string;
  prediction: Prediction;
  inputs: PredictionInputs;
  actualHbA1c?: number;
  verifiedAt?: string;
};

const DATA_DIRECTORY = path.join(process.cwd(), ".data");
const HISTORY_DIRECTORY = path.join(DATA_DIRECTORY, "history");
const MAX_HISTORY_ITEMS = 100;
const isKvConfigured = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

function ensureStorageConfigured() {
  if (process.env.NODE_ENV === "production" && !isSupabaseConfigured()) {
    throw new Error("Secure history storage is not configured. Set Supabase server environment variables.");
  }
}

function getHistoryFilePath(userId: string): string {
  return path.join(HISTORY_DIRECTORY, `${userId}.json`);
}

function getHistoryKey(userId: string): string {
  return `history:${userId}`;
}

async function ensureHistoryFile(userId: string) {
  const historyFilePath = getHistoryFilePath(userId);
  await fs.mkdir(HISTORY_DIRECTORY, { recursive: true });
  try {
    await fs.access(historyFilePath);
  } catch {
    await fs.writeFile(historyFilePath, "[]", "utf-8");
  }
}

async function writeHistoryFile(userId: string, history: PredictionHistoryItem[]) {
  const historyFilePath = getHistoryFilePath(userId);
  const temporaryPath = `${historyFilePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(history, null, 2), "utf-8");
  await fs.rename(temporaryPath, historyFilePath);
}

async function readHistoryFile(userId: string): Promise<PredictionHistoryItem[]> {
  try {
    return JSON.parse(await fs.readFile(getHistoryFilePath(userId), "utf-8")) as PredictionHistoryItem[];
  } catch (error) {
    if (error instanceof SyntaxError) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return JSON.parse(await fs.readFile(getHistoryFilePath(userId), "utf-8")) as PredictionHistoryItem[];
    }
    throw error;
  }
}

export async function readHistory(userId: string): Promise<PredictionHistoryItem[]> {
  ensureStorageConfigured();
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin()
      .from("prediction_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_ITEMS);
    if (error) throw new Error(`Failed to read secure prediction history: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      prediction: row.prediction,
      inputs: row.inputs,
      ...(row.actual_hba1c == null ? {} : { actualHbA1c: Number(row.actual_hba1c) }),
      ...(row.verified_at == null ? {} : { verifiedAt: row.verified_at }),
    }));
  }
  if (isKvConfigured) {
    const data = await kv.get<PredictionHistoryItem[]>(getHistoryKey(userId));
    return Array.isArray(data) ? data : [];
  }

  await ensureHistoryFile(userId);
  const parsedContent = await readHistoryFile(userId);
  return Array.isArray(parsedContent) ? parsedContent : [];
}

export async function saveHistory(
  userId: string,
  item: PredictionHistoryItem
): Promise<PredictionHistoryItem[]> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from("prediction_history").insert({
      id: item.id,
      user_id: userId,
      prediction: item.prediction,
      inputs: item.inputs,
      actual_hba1c: item.actualHbA1c ?? null,
      verified_at: item.verifiedAt ?? null,
      created_at: item.createdAt,
    });
    if (error) throw new Error(`Failed to save secure prediction history: ${error.message}`);
    return readHistory(userId);
  }
  if (isKvConfigured) {
    const existingHistory = await readHistory(userId);
    const nextHistory = [item, ...existingHistory].slice(0, MAX_HISTORY_ITEMS);
    await kv.set(getHistoryKey(userId), nextHistory);
    return nextHistory;
  }

  const existingHistory = await readHistory(userId);
  const nextHistory = [item, ...existingHistory].slice(0, MAX_HISTORY_ITEMS);
  await writeHistoryFile(userId, nextHistory);
  return nextHistory;
}

export async function removeHistoryItem(
  userId: string,
  id: string
): Promise<PredictionHistoryItem[]> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .from("prediction_history")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(`Failed to remove secure prediction history: ${error.message}`);
    return readHistory(userId);
  }
  if (isKvConfigured) {
    const existingHistory = await readHistory(userId);
    const nextHistory = existingHistory.filter((item) => item.id !== id);
    await kv.set(getHistoryKey(userId), nextHistory);
    return nextHistory;
  }

  const existingHistory = await readHistory(userId);
  const nextHistory = existingHistory.filter((item) => item.id !== id);
  await writeHistoryFile(userId, nextHistory);
  return nextHistory;
}

export async function clearHistory(userId: string): Promise<PredictionHistoryItem[]> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .from("prediction_history")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(`Failed to clear secure prediction history: ${error.message}`);
    return [];
  }
  if (isKvConfigured) {
    await kv.del(getHistoryKey(userId));
    return [];
  }

  await ensureHistoryFile(userId);
  await writeHistoryFile(userId, []);
  return [];
}

export async function updateHistoryItem(
  userId: string,
  id: string,
  updates: Pick<PredictionHistoryItem, "actualHbA1c" | "verifiedAt">
): Promise<PredictionHistoryItem[]> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .from("prediction_history")
      .update({
        actual_hba1c: updates.actualHbA1c ?? null,
        verified_at: updates.verifiedAt ?? null,
      })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(`Failed to update secure prediction history: ${error.message}`);
    return readHistory(userId);
  }
  const existingHistory = await readHistory(userId);
  const nextHistory = existingHistory.map((item) => item.id === id ? { ...item, ...updates } : item);
  if (isKvConfigured) {
    await kv.set(getHistoryKey(userId), nextHistory);
  } else {
    await ensureHistoryFile(userId);
    await writeHistoryFile(userId, nextHistory);
  }
  return nextHistory;
}
