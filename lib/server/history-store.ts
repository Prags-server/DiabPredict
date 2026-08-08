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
const HISTORY_FILE_PATH = path.join(DATA_DIRECTORY, "prediction-history.json");
const MAX_HISTORY_ITEMS = 100;

async function ensureHistoryFile() {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });
  try {
    await fs.access(HISTORY_FILE_PATH);
  } catch {
    await fs.writeFile(HISTORY_FILE_PATH, "[]", "utf-8");
  }
}

export async function readHistory(): Promise<PredictionHistoryItem[]> {
  await ensureHistoryFile();
  const rawContent = await fs.readFile(HISTORY_FILE_PATH, "utf-8");
  const parsedContent = JSON.parse(rawContent) as PredictionHistoryItem[];
  return Array.isArray(parsedContent) ? parsedContent : [];
}

export async function saveHistory(
  item: PredictionHistoryItem
): Promise<PredictionHistoryItem[]> {
  const existingHistory = await readHistory();
  const nextHistory = [item, ...existingHistory].slice(0, MAX_HISTORY_ITEMS);
  await fs.writeFile(HISTORY_FILE_PATH, JSON.stringify(nextHistory, null, 2), "utf-8");
  return nextHistory;
}

export async function removeHistoryItem(id: string): Promise<PredictionHistoryItem[]> {
  const existingHistory = await readHistory();
  const nextHistory = existingHistory.filter((item) => item.id !== id);
  await fs.writeFile(HISTORY_FILE_PATH, JSON.stringify(nextHistory, null, 2), "utf-8");
  return nextHistory;
}

export async function clearHistory(): Promise<PredictionHistoryItem[]> {
  await ensureHistoryFile();
  await fs.writeFile(HISTORY_FILE_PATH, "[]", "utf-8");
  return [];
}
