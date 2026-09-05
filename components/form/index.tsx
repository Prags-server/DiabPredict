"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "../common/error-boundary";
import HbA1cResultCard from "./details";

const numericField = (label: string, min: number, max: number) =>
  z.string().refine((value) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max, {
    message: `${label} must be between ${min} and ${max}`,
  });

const formSchema = z.object({
  age: numericField("Age", 1, 120),
  gender: z.string().refine((val) => val === "0" || val === "1", {
    message: "Gender must be 0 (Female) or 1 (Male)",
  }),
  height: numericField("Height", 50, 250),
  weight: numericField("Weight", 10, 400),
  bmi: numericField("BMI", 10, 80),
  systolic_bp: numericField("Systolic BP", 50, 300),
  diastolic_bp: numericField("Diastolic BP", 30, 200),
  rbs: numericField("Random blood sugar", 20, 700),
  fbs: numericField("Fasting blood sugar", 20, 700),
  waist: numericField("Waist", 30, 250),
  hip: numericField("Hip", 30, 250),
});

type Prediction = {
  predictedHbA1c: number;
  diabeticStatus: string;
  risk: string;
  interpretation: {
    status: string;
    description: string;
    distanceToNextThreshold: string;
  };
};

type HistoryItem = {
  id: string;
  createdAt: string;
  prediction: Prediction;
  inputs: z.infer<typeof formSchema>;
  actualHbA1c?: number;
  verifiedAt?: string;
};

type DatasetSummary = {
  recordCount: number;
  verifiedOutcomeCount: number;
  lastImportAt: string | null;
  lastTrainedAt: string | null;
  modelSampleCount: number;
  pendingRetraining: boolean;
  modelMetrics: { mae: number; mse: number; validationMae?: number; validationMse?: number } | null;
  modelVersionCount: number;
};

type ModelVersion = {
  id: string;
  trainedAt: string;
  sampleCount: number;
  metrics: { mae: number; mse: number; validationMae?: number; validationMse?: number } | null;
};

type UserSession = {
  userId: string;
  name: string;
};

export function PatientForm({
  onDataChange,
  datasetRevision,
}: {
  onDataChange: (data: Record<string, string | number>[]) => void;
  datasetRevision: number;
}) {
  const [fileName, setFileName] = useState<string>("");
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [modelHistory, setModelHistory] = useState<ModelVersion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string[]>([]);
  const [retraining, setRetraining] = useState(false);
  const [retrainingOutcome, setRetrainingOutcome] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [submissionError, setSubmissionError] = useState<string>("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [authName, setAuthName] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [signInLoading, setSignInLoading] = useState(false);
  const isAuthenticated = !!session;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      age: "",
      gender: "",
      height: "",
      weight: "",
      bmi: "",
      systolic_bp: "",
      diastolic_bp: "",
      rbs: "",
      fbs: "",
      waist: "",
      hip: "",
    },
  });

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/history", { method: "GET" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to load prediction history");
      }
      setHistory(result.history || []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load prediction history.";
      setSubmissionError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadDataset = useCallback(async () => {
    const response = await fetch("/api/dataset");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to load saved dataset");
    setDataset(result.summary || null);
    setModelHistory(result.modelHistory || []);
    onDataChange(result.records || []);
  }, [onDataChange]);

  const loadSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth/session", { method: "GET" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to load session");
      }
      if (result.session) {
        setSession(result.session);
        setAuthName(result.session.name);
        await Promise.all([loadHistory(), loadDataset()]);
      } else {
        setSession(null);
        setHistory([]);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load profile session.";
      setSubmissionError(message);
    } finally {
      setAuthLoading(false);
    }
  }, [loadDataset, loadHistory]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!session || datasetRevision === 0) return;
    loadDataset().catch((error) => setSubmissionError(error instanceof Error ? error.message : "Failed to refresh saved dataset."));
  }, [datasetRevision, loadDataset, session]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFileName(selectedFile.name);
    setSubmissionError("");
    setImportFeedback([]);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch("/api/dataset", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to save training data");
      setDataset(result.summary || null);
      onDataChange(result.records || []);
      const feedback = [`${result.imported} valid record${result.imported === 1 ? "" : "s"} saved.`];
      if (result.duplicatesSkipped) feedback.push(`${result.duplicatesSkipped} duplicate record${result.duplicatesSkipped === 1 ? " was" : "s were"} skipped.`);
      if (result.invalidRows?.length) {
        const examples = result.invalidRows.slice(0, 3).map((row: { line: number; issues: string[] }) => `Line ${row.line}: ${row.issues.join(", ")}`);
        feedback.push(`${result.invalidRows.length} invalid row${result.invalidRows.length === 1 ? " was" : "s were"} skipped. ${examples.join(" · ")}`);
      }
      setImportFeedback(feedback);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Failed to save training data.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const signIn = async () => {
    const trimmedName = authName.trim();
    if (trimmedName.length < 2) {
      setSubmissionError("Enter a profile name with at least 2 characters.");
      return;
    }

    setSignInLoading(true);
    setSubmissionError("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to sign in");
      }

      setSession(result.session);
      await Promise.all([loadHistory(), loadDataset()]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sign in to profile.";
      setSubmissionError(message);
    } finally {
      setSignInLoading(false);
    }
  };

  const signOut = async () => {
    setSubmissionError("");
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to sign out");
      }
      setSession(null);
      setHistory([]);
      setPrediction(null);
      setDataset(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sign out.";
      setSubmissionError(message);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!isAuthenticated) {
      setSubmissionError("Please sign in to a profile before predicting.");
      return;
    }

    setIsLoading(true);
    setSubmissionError("");
    try {
      const formData = new FormData();
      const patientData = [
        values.age,
        values.gender,
        values.height,
        values.weight,
        values.bmi,
        values.systolic_bp,
        values.diastolic_bp,
        values.rbs,
        values.fbs,
        values.waist,
        values.hip,
      ].join(",");

      formData.append("patientData", patientData);

      const response = await fetch("/api/predict", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Prediction request failed");
      }
      setDataset(result.dataset || dataset);

      if (result.prediction !== undefined) {
        setPrediction(result.prediction);
        setHistory(result.history || []);
      }

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while predicting.";
      setSubmissionError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const applyHistoryItem = (item: HistoryItem) => {
    setPrediction(item.prediction);
    form.setValue("age", item.inputs.age);
    form.setValue("gender", item.inputs.gender);
    form.setValue("height", item.inputs.height);
    form.setValue("weight", item.inputs.weight);
    form.setValue("bmi", item.inputs.bmi);
    form.setValue("systolic_bp", item.inputs.systolic_bp);
    form.setValue("diastolic_bp", item.inputs.diastolic_bp);
    form.setValue("rbs", item.inputs.rbs);
    form.setValue("fbs", item.inputs.fbs);
    form.setValue("waist", item.inputs.waist);
    form.setValue("hip", item.inputs.hip);
  };

  const retrainModel = async () => {
    setRetraining(true);
    setSubmissionError("");
    setRetrainingOutcome("");
    try {
      const response = await fetch("/api/model/retrain", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Retraining failed");
      setDataset(result.summary || null);
      setRetrainingOutcome(result.message || "Model retrained.");
      await loadDataset();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Retraining failed.");
    } finally {
      setRetraining(false);
    }
  };

  const addVerifiedOutcome = async (item: HistoryItem) => {
    const entered = window.prompt("Enter the verified laboratory HbA1c result (%). Only actual lab results should be added to training.");
    if (entered === null) return;
    try {
      const response = await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, actualHbA1c: entered }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to save verified outcome");
      setHistory(result.history || []);
      await loadDataset();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Failed to save verified outcome.");
    }
  };

  const saveManualTrainingRecord = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;
    const actualHbA1c = window.prompt("Enter the actual laboratory HbA1c result (%). This record will be saved for the next training run.");
    if (actualHbA1c === null) return;
    try {
      const response = await fetch("/api/dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form.getValues(), hba1c: actualHbA1c }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to save training record");
      setDataset(result.summary || null);
      onDataChange(result.records || []);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Failed to save training record.");
    }
  };

  const restoreModel = async (version: ModelVersion) => {
    if (!window.confirm(`Restore the model trained on ${new Date(version.trainedAt).toLocaleString()}?`)) return;
    try {
      const response = await fetch("/api/model/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: version.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to restore model");
      setRetrainingOutcome(result.message || "Model restored.");
      await loadDataset();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Failed to restore model.");
    }
  };

  const removeHistoryItem = async (id: string) => {
    try {
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to remove history item");
      }
      setHistory(result.history || []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove history item.";
      setSubmissionError(message);
    }
  };

  const clearHistory = async () => {
    try {
      const response = await fetch("/api/history", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to clear history");
      }
      setHistory(result.history || []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear history.";
      setSubmissionError(message);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-2 sm:p-4">
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Profile Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {authLoading ? (
            <p className="text-sm text-muted-foreground">Loading profile...</p>
          ) : isAuthenticated ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Signed in</Badge>
                <span className="text-sm font-medium">{session.name}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={authName}
                onChange={(event) => setAuthName(event.target.value)}
                placeholder="Enter your profile name"
                maxLength={40}
              />
              <Button type="button" onClick={signIn} disabled={signInLoading}>
                {signInLoading ? "Signing in..." : "Sign in"}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Your profile keeps prediction history isolated by user.
          </p>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Saved training dataset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted p-3"><p className="text-muted-foreground">Validated records</p><p className="text-lg font-semibold">{dataset?.recordCount ?? 0}</p></div>
            <div className="rounded-md bg-muted p-3"><p className="text-muted-foreground">Model status</p><p className="text-lg font-semibold">{dataset?.lastTrainedAt ? "Ready" : "Not trained"}</p></div>
          </div>
          {dataset?.modelMetrics ? (
            <p className="text-xs text-muted-foreground">
              {dataset.modelMetrics.validationMae !== undefined
                ? `Validation MAE ${dataset.modelMetrics.validationMae}% · validation MSE ${dataset.modelMetrics.validationMse}`
                : `Training MAE ${dataset.modelMetrics.mae}% · training MSE ${dataset.modelMetrics.mse}`}
              {dataset.modelVersionCount ? ` · ${dataset.modelVersionCount} prior version${dataset.modelVersionCount === 1 ? "" : "s"} retained` : ""}
            </p>
          ) : null}
          {retrainingOutcome ? <Alert><AlertDescription>{retrainingOutcome}</AlertDescription></Alert> : null}
          {modelHistory.length ? (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Previous model versions ({modelHistory.length})</summary>
              <div className="mt-3 space-y-2">
                {modelHistory.map((version) => (
                  <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 p-2">
                    <span>{new Date(version.trainedAt).toLocaleString()} · {version.metrics?.validationMae !== undefined ? `validation MAE ${version.metrics.validationMae}%` : `${version.sampleCount} records`}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => restoreModel(version)}>Restore</Button>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {dataset?.pendingRetraining ? (
            <Alert><AlertDescription>New verified records are ready. Retrain to include them in the saved model.</AlertDescription></Alert>
          ) : null}
          <div className="flex flex-col space-y-1.5">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 transition-colors hover:border-primary/50">
              <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                {fileName || "Import a CSV once; it stays available to this profile"}
              </p>
              <Input
                id="file-upload"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("file-upload")?.click()}
                className="mt-2"
                disabled={!isAuthenticated || uploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Saving dataset..." : "Import CSV"}
              </Button>
            </div>
          </div>
          {importFeedback.length ? <Alert><AlertDescription><ul className="space-y-1">{importFeedback.map((message) => <li key={message}>{message}</li>)}</ul></AlertDescription></Alert> : null}
          <Button type="button" variant="secondary" onClick={retrainModel} disabled={!isAuthenticated || retraining || (dataset?.recordCount ?? 0) < 5}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {retraining ? "Retraining..." : "Retrain saved model"}
          </Button>
          <p className="text-xs text-muted-foreground">Only validated spreadsheet records and verified laboratory outcomes are used for training.</p>
          <a href="/training-template.csv" download className="text-xs font-medium text-primary underline underline-offset-4">Download the CSV template</a>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
        </CardHeader>
        <CardContent>
          {submissionError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{submissionError}</AlertDescription>
            </Alert>
          ) : null}
          {!isAuthenticated ? (
            <Alert className="mb-4">
              <AlertDescription>
                Sign in above to enable prediction and personal history.
              </AlertDescription>
            </Alert>
          ) : null}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" placeholder="Age" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="whitespace-nowrap">
                        Gender (0-Female, 1-Male)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="1"
                          placeholder="0 or 1"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="height"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Height (cm)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Height" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight (kg)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Weight" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bmi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BMI</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="BMI" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="systolic_bp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Systolic BP (mmHg)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Systolic BP" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="diastolic_bp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diastolic BP (mmHg)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Diastolic BP" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rbs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Random Blood Sugar</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="RBS" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fbs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fasting Blood Sugar</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="FBS" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="waist"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Waist (cm)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Waist" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hip (cm)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Hip" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isLoading || !isAuthenticated}>
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  "Predict"
                )}
              </Button>
                <Button type="button" variant="outline" onClick={saveManualTrainingRecord} disabled={!isAuthenticated}>
                  Save verified training record
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {prediction && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Prediction Results</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorBoundary>
              <HbA1cResultCard prediction={prediction} />
            </ErrorBoundary>
          </CardContent>
        </Card>
      )}

      <Card id="history" className="scroll-mt-24 border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Prediction History</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearHistory}
            disabled={history.length === 0 || !isAuthenticated}
          >
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          {!isAuthenticated ? (
            <p className="text-sm text-muted-foreground">
              Sign in to access your personal prediction history.
            </p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {historyLoading ? "Loading history..." : "No saved predictions yet."}
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border p-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      HbA1c: {item.prediction.predictedHbA1c} (
                      {item.prediction.diabeticStatus})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                    {item.actualHbA1c !== undefined ? (
                      <p className="text-xs text-green-700">Verified lab HbA1c: {item.actualHbA1c}%</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyHistoryItem(item)}
                    >
                      Load
                    </Button>
                    {item.actualHbA1c === undefined ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addVerifiedOutcome(item)}
                      >
                        Add lab result
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeHistoryItem(item.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
