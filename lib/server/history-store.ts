import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";

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
  if (process.env.NODE_ENV === "production" && !isKvConfigured) {
    throw new Error("Persistent history storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.");
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
