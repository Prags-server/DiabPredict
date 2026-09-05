"use client";

import { ErrorBoundary } from "@/components/common/error-boundary";
import { DatasetRecord, GridView } from "@/components/core/grid-view";
import { PatientForm } from "@/components/form";
import { ArrowRight, Database, FlaskConical, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [records, setRecords] = useState<DatasetRecord[]>([]);
  const [datasetRevision, setDatasetRevision] = useState(0);

  const handleDataChange = (data: Record<string, string | number>[]) => {
    setRecords(data as DatasetRecord[]);
  };

  const handleRecordsChange = (nextRecords: DatasetRecord[]) => {
    setRecords(nextRecords);
    setDatasetRevision((revision) => revision + 1);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/.12),_transparent_38%),hsl(var(--background))]">
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
        <div className="relative overflow-hidden rounded-3xl border bg-card/90 p-6 shadow-sm backdrop-blur sm:p-10">
          <div className="relative z-10 max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <FlaskConical className="h-3.5 w-3.5" />
              Evidence-led screening workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Understand your HbA1c risk with a guided workflow.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Keep verified records in one place, run a transparent estimate, and improve your personal model only when real laboratory outcomes are available.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#prediction" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90">
                Start a prediction <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#dataset" className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition hover:bg-muted">
                Manage training data
              </a>
            </div>
          </div>
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Database, title: "One saved dataset", text: "CSV imports, manual entries, and verified outcomes stay together." },
            { icon: ShieldCheck, title: "Verified-only learning", text: "Predictions never become labels without a confirmed lab result." },
            { icon: FlaskConical, title: "Model stewardship", text: "Metrics, validation, retraining, and rollback are built into the workspace." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border bg-card/80 p-4">
              <Icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">{title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 pb-12 sm:px-8 xl:flex-row">
        <section id="dataset" className="min-w-0 flex-1 scroll-mt-24">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Step 1</p>
              <h2 className="text-xl font-semibold">Your training workspace</h2>
            </div>
            <span className="hidden text-sm text-muted-foreground sm:block">Review, import, and maintain records</span>
          </div>
          <ErrorBoundary>
            <GridView data={records} onRecordsChange={handleRecordsChange} />
          </ErrorBoundary>
        </section>
        <section id="prediction" className="min-w-0 flex-1 scroll-mt-24">
          <div className="mb-3 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Step 2</p>
            <h2 className="text-xl font-semibold">Guided prediction</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in, enter the patient measurements, and review the result with context.</p>
          </div>
          <ErrorBoundary>
            <PatientForm onDataChange={handleDataChange} datasetRevision={datasetRevision} />
          </ErrorBoundary>
        </section>
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-8 text-center text-xs leading-5 text-muted-foreground sm:px-8">
        Screening support only. This estimate is not a diagnosis and should not replace professional medical advice or a laboratory test.
      </p>
    </main>
  );
}
