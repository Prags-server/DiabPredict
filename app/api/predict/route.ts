import { parseCSV } from "@/lib/server/core/parser";
import { getSessionFromRequest } from "@/lib/server/auth-session";
import { predictPatient } from "@/lib/server/core/predict";
import { prepareData } from "@/lib/server/core/prepare";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getModel } from "./helper";

export const config = {
  maxDuration: 120,
};

const PATIENT_FEATURE_COUNT = 11;
const MAX_CSV_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const patientInputSchema = z.array(z.number().finite()).length(PATIENT_FEATURE_COUNT);

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const patientData = formData.get("patientData") as string;
    const resetTraining = formData.get("resetTraining") === "true";

    if (!file || !patientData) {
      return NextResponse.json(
        { error: "Missing file or patient data" },
        { status: 400 }
      );
    }

    if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "CSV file is too large. Maximum size is 2MB." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a CSV file." },
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

    const csvData = await parseCSV(file);
    const trainingData = await prepareData(csvData);

    const modelState = await getModel({ trainingData, resetTraining });

    const prediction = await predictPatient(
      parsedInput.data,
      modelState.model,
      modelState.stats || trainingData.stats
    );

    return NextResponse.json({
      csvData,
      prediction,
    });
  } catch (error) {
    console.error("Prediction error:", error);
    return NextResponse.json(
      { error: "Failed to process prediction" },
      { status: 500 }
    );
  }
}
