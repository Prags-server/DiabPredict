import { getSessionFromRequest } from "@/lib/server/auth-session";
import { predictPatient } from "@/lib/server/core/predict";
import { readTrainingWorkspace, workspaceSummary } from "@/lib/server/training-store";
import { saveHistory } from "@/lib/server/history-store";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getModel } from "./helper";

export const config = {
  maxDuration: 120,
};

const PATIENT_FEATURE_COUNT = 11;
const patientInputSchema = z.array(z.number().finite()).length(PATIENT_FEATURE_COUNT);

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const patientData = formData.get("patientData") as string;

    if (!patientData) {
      return NextResponse.json(
        { error: "Missing patient data" },
        { status: 400 }
      );
    }

    const inputData = patientData.split(",").map(Number);
    const parsedInput = patientInputSchema.safeParse(inputData);
    if (!parsedInput.success) {
      return NextResponse.json(
        { error: "Invalid patient input. Expected 11 numeric values." },
        { status: 400 }
      );
    }

    const workspace = await readTrainingWorkspace(session.userId);
    const modelState = await getModel({ userId: session.userId, records: workspace.records });

    const prediction = await predictPatient(
      parsedInput.data,
      modelState.model,
      modelState.stats
    );

    modelState.model.dispose();
    if (modelState.stats.mode === "zscore") {
      modelState.stats.mean.dispose();
      modelState.stats.std.dispose();
    } else {
      modelState.stats.min.dispose();
      modelState.stats.max.dispose();
    }

    const updatedWorkspace = modelState.trained
      ? await readTrainingWorkspace(session.userId)
      : workspace;

    const history = await saveHistory(session.userId, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      prediction,
      inputs: {
        age: String(parsedInput.data[0]), gender: String(parsedInput.data[1]), height: String(parsedInput.data[2]),
        weight: String(parsedInput.data[3]), bmi: String(parsedInput.data[4]), systolic_bp: String(parsedInput.data[5]),
        diastolic_bp: String(parsedInput.data[6]), rbs: String(parsedInput.data[7]), fbs: String(parsedInput.data[8]),
        waist: String(parsedInput.data[9]), hip: String(parsedInput.data[10]),
      },
    });

    return NextResponse.json({
      prediction,
      dataset: workspaceSummary(updatedWorkspace),
      history,
    });
  } catch (error) {
    console.error("Prediction error:", error);
    return NextResponse.json(
      { error: "Failed to process prediction" },
      { status: 500 }
    );
  }
}
