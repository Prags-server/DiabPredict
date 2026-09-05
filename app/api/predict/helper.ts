import { createModel } from "@/lib/server/core/create-model";
import { NormalizationStats, prepareData } from "@/lib/server/core/prepare";
import { trainModel } from "@/lib/server/core/train-model";
import {
  readTrainingWorkspace,
  saveTrainingWorkspace,
  SerializedModel,
  TrainingRecord,
} from "@/lib/server/training-store";
import * as tf from "@tensorflow/tfjs";
import { randomUUID } from "crypto";

function serializeStats(stats: NormalizationStats): SerializedModel["normalization"] {
  if (stats.mode === "zscore") {
    return { mode: "zscore", first: Array.from(stats.mean.dataSync()), second: Array.from(stats.std.dataSync()) };
  }
  return { mode: "minmax", first: Array.from(stats.min.dataSync()), second: Array.from(stats.max.dataSync()) };
}

function deserializeStats(normalization: SerializedModel["normalization"]): NormalizationStats {
  if (normalization.mode === "zscore") {
    return { mode: "zscore", mean: tf.tensor1d(normalization.first), std: tf.tensor1d(normalization.second) };
  }
  return { mode: "minmax", min: tf.tensor1d(normalization.first), max: tf.tensor1d(normalization.second) };
}

function hydrateModel(saved: SerializedModel) {
  const model = createModel();
  const weights = saved.weights.map((weight) => tf.tensor(weight.values, weight.shape));
  model.setWeights(weights);
  weights.forEach((weight) => weight.dispose());
  return model;
}

function getMetrics(model: tf.Sequential, inputs: tf.Tensor, targets: tf.Tensor1D) {
  const predictionTensor = model.predict(inputs) as tf.Tensor;
  const errors = predictionTensor.reshape([targets.shape[0]]).sub(targets);
  const mae = errors.abs().mean().dataSync()[0];
  const mse = errors.square().mean().dataSync()[0];
  predictionTensor.dispose();
  errors.dispose();
  return { mae: Number(mae.toFixed(3)), mse: Number(mse.toFixed(3)) };
}

function validationTensors(records: TrainingRecord[], stats: NormalizationStats) {
  const features = tf.tensor2d(records.map((record) => [record.age, record.gender, record.height, record.weight, record.bmi, record.systolic_bp, record.diastolic_bp, record.rbs, record.fbs, record.waist, record.hip]));
  const targets = tf.tensor1d(records.map((record) => record.hba1c));
  if (stats.mode === "zscore") return { inputs: features.sub(stats.mean).div(stats.std.add(1e-6)), rawInputs: features, targets };
  return { inputs: features.sub(stats.min).div(stats.max.sub(stats.min).add(1e-6)), rawInputs: features, targets };
}

function serializeModel(model: tf.Sequential, stats: NormalizationStats, sampleCount: number, metrics: SerializedModel["metrics"]): SerializedModel {
  const weights = model.getWeights();
  const serialized = weights.map((weight) => ({ shape: weight.shape, values: Array.from(weight.dataSync()) }));
  return { id: randomUUID(), trainedAt: new Date().toISOString(), sampleCount, metrics, normalization: serializeStats(stats), weights: serialized };
}

export async function getModel({ userId, records, forceRetrain = false }: {
  userId: string;
  records: TrainingRecord[];
  forceRetrain?: boolean;
}) {
  const workspace = await readTrainingWorkspace(userId);
  if (workspace.model && !forceRetrain) {
    return { model: hydrateModel(workspace.model), stats: deserializeStats(workspace.model.normalization), trained: false };
  }
  if (records.length < 5) {
    throw new Error("At least 5 verified training records are required before a model can be trained.");
  }

  const validationCount = records.length >= 10 ? Math.max(2, Math.floor(records.length * 0.2)) : 0;
  const trainingRecords = validationCount ? records.slice(0, -validationCount) : records;
  const validationRecords = validationCount ? records.slice(-validationCount) : [];
  const trainingData = await prepareData(trainingRecords);
  const model = createModel();
  await trainModel({ trainingData, model, validationSplit: 0 });
  const trainingMetrics = getMetrics(model, trainingData.X, trainingData.Y);
  let metrics: SerializedModel["metrics"] = trainingMetrics;
  if (validationRecords.length) {
    const validation = validationTensors(validationRecords, trainingData.stats);
    const validationMetrics = getMetrics(model, validation.inputs, validation.targets);
    validation.inputs.dispose();
    validation.rawInputs.dispose();
    validation.targets.dispose();
    metrics = { ...trainingMetrics, validationMae: validationMetrics.mae, validationMse: validationMetrics.mse };
  }
  const currentValidationMae = workspace.model?.metrics?.validationMae;
  if (forceRetrain && currentValidationMae && metrics.validationMae && metrics.validationMae > currentValidationMae * 1.1) {
    model.dispose();
    trainingData.X.dispose();
    trainingData.Y.dispose();
    if (trainingData.stats.mode === "zscore") { trainingData.stats.mean.dispose(); trainingData.stats.std.dispose(); }
    else { trainingData.stats.min.dispose(); trainingData.stats.max.dispose(); }
    return { model: hydrateModel(workspace.model!), stats: deserializeStats(workspace.model!.normalization), trained: false, promoted: false, metrics: workspace.model!.metrics };
  }
  const serialized = serializeModel(model, trainingData.stats, records.length, metrics);
  await saveTrainingWorkspace(userId, { ...workspace, records, model: serialized, needsRetraining: false, modelVersions: workspace.model ? [workspace.model, ...(workspace.modelVersions ?? [])].slice(0, 5) : workspace.modelVersions ?? [] });
  trainingData.X.dispose();
  trainingData.Y.dispose();
  if (trainingData.stats.mode === "zscore") {
    trainingData.stats.mean.dispose();
    trainingData.stats.std.dispose();
  } else {
    trainingData.stats.min.dispose();
    trainingData.stats.max.dispose();
  }
  return { model, stats: deserializeStats(serialized.normalization), trained: true, promoted: true, metrics };
}
