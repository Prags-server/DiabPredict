import {
  PredictionHistoryItem,
  clearHistory,
  readHistory,
  removeHistoryItem,
  saveHistory,
} from "@/lib/server/history-store";
import { getSessionFromRequest } from "@/lib/server/auth-session";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const predictionSchema = z.object({
  predictedHbA1c: z.number(),
  diabeticStatus: z.string(),
  risk: z.string(),
  interpretation: z.object({
    status: z.string(),
    description: z.string(),
    distanceToNextThreshold: z.string(),
  }),
});

const inputsSchema = z.object({
  age: z.string(),
  gender: z.string(),
  height: z.string(),
  weight: z.string(),
  bmi: z.string(),
  systolic_bp: z.string(),
  diastolic_bp: z.string(),
  rbs: z.string(),
  fbs: z.string(),
  waist: z.string(),
  hip: z.string(),
});

const createHistoryItemSchema = z.object({
  prediction: predictionSchema,
  inputs: inputsSchema,
});

function getAuthorizedUserId(request: NextRequest): string | null {
  const session = getSessionFromRequest(request);
  return session?.userId || null;
}

export async function GET(request: NextRequest) {
  const userId = getAuthorizedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const history = await readHistory(userId);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to read prediction history:", error);
    return NextResponse.json(
      { error: "Failed to read prediction history" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = getAuthorizedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const parsedPayload = createHistoryItemSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { error: "Invalid history payload" },
        { status: 400 }
      );
    }

    const newHistoryItem: PredictionHistoryItem = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      prediction: parsedPayload.data.prediction,
      inputs: parsedPayload.data.inputs,
    };

    const history = await saveHistory(userId, newHistoryItem);
    return NextResponse.json({ item: newHistoryItem, history }, { status: 201 });
  } catch (error) {
    console.error("Failed to save prediction history:", error);
    return NextResponse.json(
      { error: "Failed to save prediction history" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getAuthorizedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const itemId = request.nextUrl.searchParams.get("id");
    const history = itemId
      ? await removeHistoryItem(userId, itemId)
      : await clearHistory(userId);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to delete prediction history:", error);
    return NextResponse.json(
      { error: "Failed to delete prediction history" },
      { status: 500 }
    );
  }
}
