"use client";

import { ErrorBoundary } from "@/components/common/error-boundary";
import { GridView } from "@/components/core/grid-view";
import { PatientForm } from "@/components/form";
import { useState } from "react";

export default function Home() {
  const [csvData, setCsvData] = useState<string[][]>([]);

  const handleDataChange = (data: Record<string, string>[]) => {
    const transformedData = data.map((row) => [
      row.age || "",
      row.gender || "",
      row.height || "",
      row.weight || "",
      row.bmi || "",
      row.systolic_bp || "",
      row.diastolic_bp || "",
      row.rbs || "",
      row.fbs || "",
      row.waist || "",
      row.hip || "",
      row.hba1c || "",
    ]);
    setCsvData(transformedData);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-col xl:flex-row">
        <div className="w-full xl:w-[60%]">
          <ErrorBoundary>
            <GridView initialRows={1} initialCols={12} data={csvData} />
          </ErrorBoundary>
        </div>
        <div className="w-full xl:w-[40%]">
          <ErrorBoundary>
            <PatientForm onDataChange={handleDataChange} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
