import { promises as fs } from "fs";
import path from "path";
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

export async function readHistory(userId: string): Promise<PredictionHistoryItem[]> {
  if (isKvConfigured) {
    const data = await kv.get<PredictionHistoryItem[]>(getHistoryKey(userId));
    return Array.isArray(data) ? data : [];
  }

  const historyFilePath = getHistoryFilePath(userId);
  await ensureHistoryFile(userId);
  const rawContent = await fs.readFile(historyFilePath, "utf-8");
  const parsedContent = JSON.parse(rawContent) as PredictionHistoryItem[];
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

  const historyFilePath = getHistoryFilePath(userId);
  const existingHistory = await readHistory(userId);
  const nextHistory = [item, ...existingHistory].slice(0, MAX_HISTORY_ITEMS);
  await fs.writeFile(historyFilePath, JSON.stringify(nextHistory, null, 2), "utf-8");
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

  const historyFilePath = getHistoryFilePath(userId);
  const existingHistory = await readHistory(userId);
  const nextHistory = existingHistory.filter((item) => item.id !== id);
  await fs.writeFile(historyFilePath, JSON.stringify(nextHistory, null, 2), "utf-8");
  return nextHistory;
}

export async function clearHistory(userId: string): Promise<PredictionHistoryItem[]> {
  if (isKvConfigured) {
    await kv.del(getHistoryKey(userId));
    return [];
  }

  const historyFilePath = getHistoryFilePath(userId);
  await ensureHistoryFile(userId);
  await fs.writeFile(historyFilePath, "[]", "utf-8");
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
    await fs.writeFile(getHistoryFilePath(userId), JSON.stringify(nextHistory, null, 2), "utf-8");
  }
  return nextHistory;
}
