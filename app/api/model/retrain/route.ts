import { getSessionFromRequest } from "@/lib/server/auth-session";
import { readTrainingWorkspace, workspaceSummary } from "@/lib/server/training-store";
import { getModel } from "@/app/api/predict/helper";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const workspace = await readTrainingWorkspace(session.userId);
    const state = await getModel({ userId: session.userId, records: workspace.records, forceRetrain: true });
    state.model.dispose();
    if (state.stats.mode === "zscore") {
      state.stats.mean.dispose();
      state.stats.std.dispose();
    } else {
      state.stats.min.dispose();
      state.stats.max.dispose();
    }
    const updated = await readTrainingWorkspace(session.userId);
    return NextResponse.json({
      summary: workspaceSummary(updated),
      promoted: state.promoted,
      message: state.promoted
        ? "The retrained model passed the quality check and is now active."
        : "The existing model was retained because the new candidate performed materially worse on validation data.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Training failed" }, { status: 400 });
  }
}
