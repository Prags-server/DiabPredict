"use client";

import { ErrorBoundary } from "@/components/common/error-boundary";
import { DatasetRecord, GridView } from "@/components/core/grid-view";
import { PatientForm } from "@/components/form";
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
    <div className="min-h-screen bg-background">
      <div className="border-b bg-muted/30 px-4 py-8 sm:px-8">
        <p className="text-sm font-medium text-primary">Clinical decision support</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">HbA1c prediction workspace</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Maintain a verified training dataset, estimate HbA1c, and improve the saved model only with actual laboratory outcomes.</p>
      </div>
      <div className="flex flex-col xl:flex-row">
        <div className="w-full xl:w-[60%]">
          <ErrorBoundary>
            <GridView data={records} onRecordsChange={handleRecordsChange} />
          </ErrorBoundary>
        </div>
        <div className="w-full xl:w-[40%]">
          <ErrorBoundary>
            <PatientForm onDataChange={handleDataChange} datasetRevision={datasetRevision} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
