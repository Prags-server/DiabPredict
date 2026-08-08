import { parseCSV } from "@/lib/server/core/parser";
import { predictPatient } from "@/lib/server/core/predict";
import { prepareData } from "@/lib/server/core/prepare";
import { NextRequest, NextResponse } from "next/server";
import { getModel } from "./helper";

export const config = {
  maxDuration: 120,
};

export async function POST(request: NextRequest) {
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

    const csvData = await parseCSV(file);
    const trainingData = await prepareData(csvData);

    const modelState = await getModel({ trainingData, resetTraining });

    const inputData = patientData.split(",").map(Number);
    const prediction = await predictPatient(
      inputData,
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
