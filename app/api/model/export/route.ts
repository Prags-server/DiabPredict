import { getSessionFromRequest } from "@/lib/server/auth-session";
import { readTrainingWorkspace, workspaceSummary } from "@/lib/server/training-store";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const workspace = await readTrainingWorkspace(session.userId);
    const exportPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      application: "DiabPredict",
      profile: { userId: session.userId, name: session.name },
      summary: workspaceSummary(workspace),
      trainingColumns: [
        "age", "gender", "height", "weight", "bmi", "systolic_bp",
        "diastolic_bp", "rbs", "fbs", "waist", "hip", "hba1c",
      ],
      split: {
        trainFraction: 0.8,
        validationFractionOfDevelopment: 0.2,
        testRule: "Application research split; exact assignment depends on persisted record IDs.",
      },
      records: workspace.records,
      activeModel: workspace.model,
      retainedModelVersions: workspace.modelVersions ?? [],
      needsRetraining: Boolean(workspace.needsRetraining),
      lastImportAt: workspace.lastImportAt,
      updatedAt: workspace.updatedAt,
    };

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="diabpredict-workspace-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export training workspace:", error);
    return NextResponse.json({ error: "Failed to export training workspace" }, { status: 500 });
  }
}
