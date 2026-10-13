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

function stableRecordHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function splitForResearch(records: TrainingRecord[]) {
  if (records.length < 10) {
    return { trainRecords: records, validationRecords: [], testRecords: [] };
  }

  const sorted = [...records].sort((left, right) => stableRecordHash(left.id) - stableRecordHash(right.id));
  const testSize = Math.max(2, Math.floor(sorted.length * 0.2));
  const finalTestSize = Math.min(testSize, Math.max(2, sorted.length - 5));
  const testRecords = sorted.slice(-finalTestSize);
  const trainRecords = sorted.slice(0, sorted.length - finalTestSize);

  return { trainRecords, validationRecords: [], testRecords };
}

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

function classifyHbA1c(value: number) {
  if (value < 5.7) return "Normal";
  if (value < 6.5) return "Prediabetes";
  return "Diabetes";
}

function calculateClassificationMetrics(predictions: number[], targets: number[]) {
  const positiveThreshold = 6.5;
  const positiveLabels = targets.map((value) => value >= positiveThreshold);
  const predictedPositive = predictions.map((value) => value >= positiveThreshold);

  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;

  for (let index = 0; index < positiveLabels.length; index += 1) {
    const actualPositive = positiveLabels[index];
    const predictedPositiveValue = predictedPositive[index];

    if (actualPositive && predictedPositiveValue) truePositive += 1;
    else if (!actualPositive && predictedPositiveValue) falsePositive += 1;
    else if (!actualPositive && !predictedPositiveValue) trueNegative += 1;
    else falseNegative += 1;
  }

  const sensitivity = (truePositive + falseNegative) === 0 ? 1 : truePositive / (truePositive + falseNegative);
  const specificity = (trueNegative + falsePositive) === 0 ? 1 : trueNegative / (trueNegative + falsePositive);
  const ppv = (truePositive + falsePositive) === 0 ? 1 : truePositive / (truePositive + falsePositive);
  const npv = (trueNegative + falseNegative) === 0 ? 1 : trueNegative / (trueNegative + falseNegative);
  const f1 = (truePositive + falsePositive + falseNegative) === 0 ? 1 : (2 * truePositive) / (2 * truePositive + falsePositive + falseNegative);

  const positives = positiveLabels.filter(Boolean).length;
  const negatives = positiveLabels.length - positives;
  if (positives === 0 || negatives === 0) {
    return { sensitivity, specificity, ppv, npv, f1, rocAuc: 0.5 };
  }

  const sortedPairs = predictions
    .map((value, index) => ({ value, label: positiveLabels[index] }))
    .sort((left, right) => left.value - right.value);

  let tp = 0;
  let fp = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  let rocAuc = 0;

  for (const pair of sortedPairs) {
    if (pair.label) tp += 1;
    else fp += 1;

    const currentTpr = tp / positives;
    const currentFpr = fp / negatives;
    rocAuc += (currentFpr - prevFpr) * (currentTpr + prevTpr) * 0.5;
    prevFpr = currentFpr;
    prevTpr = currentTpr;
  }

  return { sensitivity, specificity, ppv, npv, f1, rocAuc: Number(Math.min(Math.max(rocAuc, 0), 1).toFixed(3)) };
}

function getMetrics(model: tf.Sequential, inputs: tf.Tensor, targets: tf.Tensor1D) {
  const predictionTensor = model.predict(inputs) as tf.Tensor;
  const predictions = predictionTensor.reshape([targets.shape[0]]);
  const errors = predictions.sub(targets);
  const mseValue = errors.square().mean().dataSync()[0];
  const maeValue = errors.abs().mean().dataSync()[0];
  const rmseValue = Math.sqrt(mseValue);
  const targetMean = targets.mean().dataSync()[0];
  const totalSumSquares = targets.sub(targetMean).square().sum().dataSync()[0];
  const residualSumSquares = errors.square().sum().dataSync()[0];
  const r2Value = totalSumSquares <= 1e-9 ? 1 : 1 - residualSumSquares / totalSumSquares;
  const predictionValues = Array.from(predictions.dataSync());
  const targetValues = Array.from(targets.dataSync());
  const classification = calculateClassificationMetrics(predictionValues, targetValues);

  predictionTensor.dispose();
  predictions.dispose();
  errors.dispose();

  return {
    mae: Number(maeValue.toFixed(3)),
    mse: Number(mseValue.toFixed(3)),
    rmse: Number(rmseValue.toFixed(3)),
    r2: Number(r2Value.toFixed(3)),
    sensitivity: Number(classification.sensitivity.toFixed(3)),
    specificity: Number(classification.specificity.toFixed(3)),
    ppv: Number(classification.ppv.toFixed(3)),
    npv: Number(classification.npv.toFixed(3)),
    f1: Number(classification.f1.toFixed(3)),
    rocAuc: Number(classification.rocAuc.toFixed(3)),
    clinicalStatus: classifyHbA1c(predictionValues[0] ?? 0),
  };
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

  const { trainRecords, testRecords } = splitForResearch(records);
  const researchTrainRecords = trainRecords.length ? trainRecords : records;

  const validationCount = researchTrainRecords.length >= 6 ? Math.max(2, Math.floor(researchTrainRecords.length * 0.2)) : 0;
  const modelTrainingRecords = validationCount ? researchTrainRecords.slice(0, -validationCount) : researchTrainRecords;
  const validationRecords = validationCount ? researchTrainRecords.slice(-validationCount) : [];

  const trainingData = await prepareData(modelTrainingRecords);
  const model = createModel();
  await trainModel({ trainingData, model, validationSplit: 0 });

  const trainingMetrics = getMetrics(model, trainingData.X, trainingData.Y);
  let metrics: SerializedModel["metrics"] = { ...trainingMetrics };

  if (validationRecords.length) {
    const validation = validationTensors(validationRecords, trainingData.stats);
    const validationMetrics = getMetrics(model, validation.inputs, validation.targets);
    validation.inputs.dispose();
    validation.rawInputs.dispose();
    validation.targets.dispose();
    metrics = {
      ...trainingMetrics,
      validationMae: validationMetrics.mae,
      validationMse: validationMetrics.mse,
      validationRmse: validationMetrics.rmse,
      validationR2: validationMetrics.r2,
    };
  }

  if (testRecords.length) {
    const holdout = validationTensors(testRecords, trainingData.stats);
    const testMetrics = getMetrics(model, holdout.inputs, holdout.targets);
    holdout.inputs.dispose();
    holdout.rawInputs.dispose();
    holdout.targets.dispose();
    metrics = {
      ...metrics,
      testMae: testMetrics.mae,
      testMse: testMetrics.mse,
      testRmse: testMetrics.rmse,
      testR2: testMetrics.r2,
      testSensitivity: testMetrics.sensitivity,
      testSpecificity: testMetrics.specificity,
      testPpv: testMetrics.ppv,
      testNpv: testMetrics.npv,
      testF1: testMetrics.f1,
      testRocAuc: testMetrics.rocAuc,
    };
  }

  const currentValidationMae = workspace.model?.metrics?.validationMae;
  const candidateValidationMae = metrics.validationMae;
  if (forceRetrain && currentValidationMae !== undefined && candidateValidationMae !== undefined && candidateValidationMae > currentValidationMae * 1.1) {
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
