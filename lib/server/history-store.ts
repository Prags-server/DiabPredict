import { promises as fs } from "fs";
import path from "path";

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
};

const DATA_DIRECTORY = path.join(process.cwd(), ".data");
const HISTORY_DIRECTORY = path.join(DATA_DIRECTORY, "history");
const MAX_HISTORY_ITEMS = 100;

function getHistoryFilePath(userId: string): string {
  return path.join(HISTORY_DIRECTORY, `${userId}.json`);
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
  const historyFilePath = getHistoryFilePath(userId);
  const existingHistory = await readHistory(userId);
  const nextHistory = existingHistory.filter((item) => item.id !== id);
  await fs.writeFile(historyFilePath, JSON.stringify(nextHistory, null, 2), "utf-8");
  return nextHistory;
}

export async function clearHistory(userId: string): Promise<PredictionHistoryItem[]> {
  const historyFilePath = getHistoryFilePath(userId);
  await ensureHistoryFile(userId);
  await fs.writeFile(historyFilePath, "[]", "utf-8");
  return [];
}
