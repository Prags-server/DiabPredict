import { getSessionFromRequest } from "@/lib/server/auth-session";
import { readTrainingWorkspace, saveTrainingWorkspace, workspaceSummary } from "@/lib/server/training-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid model version" }, { status: 400 });
    const workspace = await readTrainingWorkspace(session.userId);
    const selected = workspace.modelVersions?.find((version) => version.id === parsed.data.id);
    if (!selected) return NextResponse.json({ error: "Saved model version not found" }, { status: 404 });
    const remaining = (workspace.modelVersions ?? []).filter((version) => version.id !== selected.id);
    const next = await saveTrainingWorkspace(session.userId, {
      ...workspace,
      model: selected,
      needsRetraining: selected.sampleCount !== workspace.records.length,
      modelVersions: workspace.model ? [workspace.model, ...remaining].slice(0, 5) : remaining,
    });
    return NextResponse.json({ summary: workspaceSummary(next), message: "The selected model version is now active." });
  } catch (error) {
    console.error("Failed to restore model version:", error);
    return NextResponse.json({ error: "Failed to restore model version" }, { status: 500 });
  }
}
