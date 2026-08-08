"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

const formSchema = z.object({
  age: z.string().refine((val) => Number(val) > 0, {
    message: "Age must be greater than 0",
  }),
  gender: z.string().refine((val) => val === "0" || val === "1", {
    message: "Gender must be 0 (Female) or 1 (Male)",
  }),
  height: z.string().refine((val) => Number(val) > 0, {
    message: "Height must be greater than 0",
  }),
  weight: z.string().refine((val) => Number(val) > 0, {
    message: "Weight must be greater than 0",
  }),
  bmi: z.string().refine((val) => Number(val) > 0, {
    message: "BMI must be greater than 0",
  }),
  systolic_bp: z.string().refine((val) => Number(val) > 0, {
    message: "Systolic BP must be greater than 0",
  }),
  diastolic_bp: z.string().refine((val) => Number(val) > 0, {
    message: "Diastolic BP must be greater than 0",
  }),
  rbs: z.string().refine((val) => Number(val) > 0, {
    message: "Random blood sugar must be greater than 0",
  }),
  fbs: z.string().refine((val) => Number(val) > 0, {
    message: "Fasting blood sugar must be greater than 0",
  }),
  waist: z.string().refine((val) => Number(val) > 0, {
    message: "Waist must be greater than 0",
  }),
  hip: z.string().refine((val) => Number(val) > 0, {
    message: "Hip must be greater than 0",
  }),
  resetTraining: z.boolean().default(false),
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
  inputs: Omit<z.infer<typeof formSchema>, "resetTraining">;
};

type UserSession = {
  userId: string;
  name: string;
};

export function PatientForm({
  onDataChange,
}: {
  onDataChange: (data: Record<string, string>[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
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
      resetTraining: false,
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
        await loadHistory();
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
  }, [loadHistory]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setSubmissionError("");
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
      await loadHistory();
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

    if (!file) {
      setSubmissionError("Please upload a training data CSV file before predicting.");
      return;
    }

    setIsLoading(true);
    setSubmissionError("");
    try {
      const formData = new FormData();
      formData.append("file", file);

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
      formData.append("resetTraining", values.resetTraining.toString());

      const response = await fetch("/api/predict", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Prediction request failed");
      }
      onDataChange(result.csvData || []);

      if (result.prediction !== undefined) {
        setPrediction(result.prediction);
        const historyResponse = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prediction: result.prediction,
            inputs: {
              age: values.age,
              gender: values.gender,
              height: values.height,
              weight: values.weight,
              bmi: values.bmi,
              systolic_bp: values.systolic_bp,
              diastolic_bp: values.diastolic_bp,
              rbs: values.rbs,
              fbs: values.fbs,
              waist: values.waist,
              hip: values.hip,
            },
          }),
        });
        const historyResult = await historyResponse.json();
        if (!historyResponse.ok) {
          throw new Error(historyResult.error || "Failed to save prediction history");
        }
        setHistory(historyResult.history || []);
      }

      form.setValue("resetTraining", false);
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
          <CardTitle>Upload Training Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-1.5">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 transition-colors hover:border-primary/50">
              <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                {fileName || "Drag and drop or click to upload"}
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
                disabled={!isAuthenticated}
              >
                <Upload className="mr-2 h-4 w-4" />
                Select CSV File
              </Button>
            </div>
          </div>
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

              <FormField
                control={form.control}
                name="resetTraining"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Use new training data on server</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

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

      <Card className="border-none shadow-sm">
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
