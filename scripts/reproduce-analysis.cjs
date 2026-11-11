const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const tf = require("@tensorflow/tfjs");

const input = process.argv[2];
const outputDir = process.argv[3] || path.join(process.cwd(), "reproducibility");
if (!input) throw new Error("Usage: node scripts/reproduce-analysis.cjs <csv-path> [output-dir]");

const columns = ["age", "gender", "height", "weight", "bmi", "systolic_bp", "diastolic_bp", "rbs", "fbs", "waist", "hip", "hba1c"];
const features = columns.slice(0, -1);
const csv = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "").trim();
const lines = csv.split(/\r?\n/);
const parseLine = (line) => {
  const result = [];
  let value = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { result.push(value.trim()); value = ""; }
    else value += char;
  }
  result.push(value.trim());
  return result.map((item) => item.replace(/^"|"$/g, ""));
};
const header = parseLine(lines[0]);
const rows = lines.slice(1).filter(Boolean).map((line, index) => {
  const values = parseLine(line);
  const record = Object.fromEntries(header.map((key, i) => [key, values[i]]));
  const fingerprint = columns.map((column) => record[column]).join("|");
  return { id: `record-${crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 24)}`, ...record };
});

const ranges = {
  age: [1, 120], gender: [0, 1], height: [50, 250], weight: [10, 400], bmi: [10, 80],
  systolic_bp: [50, 300], diastolic_bp: [30, 200], rbs: [20, 700], fbs: [20, 700],
  waist: [30, 250], hip: [30, 250], hba1c: [2, 20],
};
const issues = [];
const valid = [];
for (const [index, row] of rows.entries()) {
  const rowIssues = [];
  for (const column of columns) {
    const value = Number(row[column]);
    if (!Number.isFinite(value)) rowIssues.push(`${column}: non-numeric`);
    else if (value < ranges[column][0] || value > ranges[column][1]) rowIssues.push(`${column}: out of range`);
  }
  if (Number(row.diastolic_bp) >= Number(row.systolic_bp)) rowIssues.push("blood pressure ordering");
  if (rowIssues.length) issues.push({ row: index + 2, issues: rowIssues });
  else valid.push({ ...row, ...Object.fromEntries(columns.map((column) => [column, Number(row[column])])) });
}

function hash(value) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function split(records) {
  const sorted = [...records].sort((a, b) => hash(a.id) - hash(b.id));
  const testSize = Math.max(2, Math.floor(sorted.length * 0.2));
  const finalTestSize = Math.min(testSize, Math.max(2, sorted.length - 5));
  const testRecords = sorted.slice(-finalTestSize);
  const development = sorted.slice(0, sorted.length - finalTestSize);
  const validationCount = development.length >= 6 ? Math.max(2, Math.floor(development.length * 0.2)) : 0;
  const validationRecords = validationCount ? development.slice(-validationCount) : [];
  const trainRecords = validationCount ? development.slice(0, -validationCount) : development;
  return { trainRecords, validationRecords, testRecords };
}

function createModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [11], units: 128, activation: "relu", kernelInitializer: "glorotNormal", kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.dense({ units: 64, activation: "relu", kernelInitializer: "glorotNormal", kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 32, activation: "relu", kernelInitializer: "glorotNormal", kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 16, activation: "relu", kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
  model.add(tf.layers.dense({ units: 1, activation: "linear", kernelInitializer: "zeros" }));
  model.compile({ optimizer: tf.train.adam(0.001), loss: "meanSquaredError", metrics: ["mse", "mae"] });
  return model;
}
function createCompactModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [11], units: 32, activation: "relu", kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
  model.add(tf.layers.dense({ units: 16, activation: "relu", kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
  model.add(tf.layers.dense({ units: 8, activation: "relu", kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
  model.add(tf.layers.dense({ units: 1, activation: "linear" }));
  model.compile({ optimizer: tf.train.adam(0.001), loss: "meanSquaredError", metrics: ["mse", "mae"] });
  return model;
}

function prepare(records) {
  const x = tf.tensor2d(records.map((row) => features.map((column) => Math.max(0, row[column]))));
  const y = tf.tensor1d(records.map((row) => row.hba1c));
  const mean = x.mean(0);
  const std = x.sub(mean).square().mean(0).sqrt();
  return { x: x.sub(mean).div(std.add(1e-6)), y, mean, std };
}
async function fitLikeApplication(model, x, y, validationX, validationY) {
  let bestLoss = Infinity;
  let bestWeights = null;
  let patience = 0;
  await model.fit(x, y, {
    epochs: 200,
    batchSize: 16,
    validationData: [validationX, validationY],
    shuffle: true,
    verbose: 0,
    callbacks: {
      onEpochEnd: (_epoch, logs) => {
        const validationLoss = logs && logs.val_loss;
        if (typeof validationLoss !== "number") return;
        if (validationLoss < bestLoss) {
          bestLoss = validationLoss;
          bestWeights?.forEach((weight) => weight.dispose());
          bestWeights = model.getWeights().map((weight) => weight.clone());
          patience = 0;
        } else {
          patience += 1;
          if (patience >= 10) model.stopTraining = true;
        }
      },
    },
  });
  if (bestWeights) {
    model.setWeights(bestWeights);
    bestWeights.forEach((weight) => weight.dispose());
  }
}

function metricValues(predictions, targets) {
  const errors = predictions.map((value, i) => value - targets[i]);
  const mse = errors.reduce((sum, value) => sum + value * value, 0) / errors.length;
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;
  const mean = targets.reduce((sum, value) => sum + value, 0) / targets.length;
  const total = targets.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const residual = errors.reduce((sum, value) => sum + value * value, 0);
  const actualBinary = targets.map((value) => value >= 6.5);
  const predictedBinary = predictions.map((value) => value >= 6.5);
  const binary = confusion(actualBinary, predictedBinary);
  const auc = rocAuc(predictions, actualBinary);
  return { mae, mse, rmse: Math.sqrt(mse), r2: total === 0 ? 1 : 1 - residual / total, ...binaryRates(binary), rocAuc: auc };
}

function confusion(actual, predicted) {
  const matrix = [[0, 0], [0, 0]];
  actual.forEach((value, i) => { matrix[value ? 1 : 0][predicted[i] ? 1 : 0] += 1; });
  return { tn: matrix[0][0], fp: matrix[0][1], fn: matrix[1][0], tp: matrix[1][1], matrix };
}

function binaryRates({ tn, fp, fn, tp, matrix }) {
  return {
    confusionMatrix: matrix,
    sensitivity: tp + fn ? tp / (tp + fn) : null,
    specificity: tn + fp ? tn / (tn + fp) : null,
    ppv: tp + fp ? tp / (tp + fp) : null,
    npv: tn + fn ? tn / (tn + fn) : null,
    f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null,
  };
}

function rocAuc(scores, labels) {
  const positives = labels.filter(Boolean).length;
  const negatives = labels.length - positives;
  if (!positives || !negatives) return null;
  let concordant = 0;
  let ties = 0;
  scores.forEach((score, i) => scores.forEach((other, j) => {
    if (labels[i] && !labels[j]) {
      if (score > other) concordant += 1;
      else if (score === other) ties += 1;
    }
  }));
  return (concordant + ties / 2) / (positives * negatives);
}

function categories(value) { return value < 5.7 ? 0 : value < 6.5 ? 1 : 2; }
function categoryMatrix(predictions, targets) {
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
  targets.forEach((target, i) => { matrix[categories(target)][categories(predictions[i])] += 1; });
  return matrix;
}
function categoryMetrics(predictions, targets) {
  const matrix = categoryMatrix(predictions, targets);
  const perCategory = matrix.map((row, category) => {
    const tp = row[category];
    const fn = row.reduce((sum, value, index) => sum + (index === category ? 0 : value), 0);
    const fp = matrix.reduce((sum, values, index) => sum + (index === category ? 0 : values[category]), 0);
    const tn = matrix.flat().reduce((sum, value) => sum + value, 0) - tp - fn - fp;
    return {
      sensitivity: tp + fn ? tp / (tp + fn) : null,
      specificity: tn + fp ? tn / (tn + fp) : null,
      precision: tp + fp ? tp / (tp + fp) : null,
      f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null,
      support: tp + fn,
    };
  });
  const validF1 = perCategory.map((metric) => metric.f1).filter((value) => value !== null);
  return { perCategory, macroF1: validF1.reduce((sum, value) => sum + value, 0) / validF1.length, balancedAccuracy: perCategory.reduce((sum, metric) => sum + (metric.sensitivity ?? 0), 0) / perCategory.length };
}
function blandAltmanStats(predictions, targets) {
  const differences = predictions.map((prediction, index) => prediction - targets[index]);
  const means = predictions.map((prediction, index) => (prediction + targets[index]) / 2);
  const bias = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const variance = differences.reduce((sum, value) => sum + (value - bias) ** 2, 0) / Math.max(1, differences.length - 1);
  const sd = Math.sqrt(variance);
  const standardError = sd / Math.sqrt(differences.length);
  return {
    n: differences.length,
    meanBias: bias,
    lowerLimitOfAgreement: bias - 1.96 * sd,
    upperLimitOfAgreement: bias + 1.96 * sd,
    bias95Ci: [bias - 1.96 * standardError, bias + 1.96 * standardError],
    meanOfPairs: means.reduce((sum, value) => sum + value, 0) / means.length,
  };
}

function round(value) { return value === null ? null : Number(value.toFixed(6)); }
function writeSvg(name, content) { fs.writeFileSync(path.join(outputDir, name), content, "utf8"); }
function scatterSvg(rows, title, xLabel, yLabel) {
  const width = 800, height = 520, left = 70, top = 50, plotW = 680, plotH = 380;
  const values = rows.flatMap((row) => [row.x, row.y]);
  const min = Math.min(...values), max = Math.max(...values), scale = (value) => (value - min) / (max - min || 1);
  const points = rows.map((row) => `<circle cx="${left + scale(row.x) * plotW}" cy="${top + plotH - scale(row.y) * plotH}" r="3" fill="#2563eb"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="400" y="25" text-anchor="middle" font-size="18">${title}</text><line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" stroke="black"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" stroke="black"/>${points}<text x="400" y="500" text-anchor="middle">${xLabel}</text><text x="15" y="260" transform="rotate(-90 15 260)" text-anchor="middle">${yLabel}</text></svg>`;
}
function lineSvg(points, title, xLabel, yLabel, xMin = 0, xMax = 1, yMin = 0, yMax = 1) {
  const width = 800, height = 520, left = 70, top = 50, plotW = 680, plotH = 380;
  const sx = (value) => left + ((value - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (value) => top + plotH - ((value - yMin) / (yMax - yMin || 1)) * plotH;
  const pathData = points.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
  const dots = points.map((point) => `<circle cx="${sx(point.x)}" cy="${sy(point.y)}" r="3" fill="#2563eb"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="400" y="25" text-anchor="middle" font-size="18">${title}</text><line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" stroke="black"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" stroke="black"/><path d="${pathData}" fill="none" stroke="#2563eb" stroke-width="2"/>${dots}<text x="400" y="500" text-anchor="middle">${xLabel}</text><text x="15" y="260" transform="rotate(-90 15 260)" text-anchor="middle">${yLabel}</text></svg>`;
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const { trainRecords, validationRecords, testRecords } = split(valid);
  const training = prepare(trainRecords);
  const model = createModel();
  const validationInputs = tf.tensor2d(validationRecords.map((row) => features.map((column) => Math.max(0, row[column])))).sub(training.mean).div(training.std.add(1e-6));
  const validationTargets = tf.tensor1d(validationRecords.map((row) => row.hba1c));
  await fitLikeApplication(model, training.x, training.y, validationInputs, validationTargets);

  const evaluate = (modelToEvaluate, records) => {
    const raw = tf.tensor2d(records.map((row) => features.map((column) => Math.max(0, row[column]))));
    const normalized = raw.sub(training.mean).div(training.std.add(1e-6));
    const predictions = Array.from(modelToEvaluate.predict(normalized).reshape([records.length]).dataSync());
    const targets = records.map((row) => row.hba1c);
    raw.dispose(); normalized.dispose();
    return { predictions, targets, metrics: metricValues(predictions, targets) };
  };
  const train = evaluate(model, trainRecords);
  const validation = evaluate(model, validationRecords);
  const test = evaluate(model, testRecords);
  const compactModel = createCompactModel();
  await fitLikeApplication(compactModel, training.x, training.y, validationInputs, validationTargets);
  const compactTest = evaluate(compactModel, testRecords);
  const testPairs = test.predictions.map((prediction, index) => ({ x: test.targets[index], y: prediction }));
  const report = {
    dataset: { source: path.basename(input), rawRows: rows.length, validRows: valid.length, invalidRows: issues.length, invalidExamples: issues.slice(0, 10), duplicateRows: rows.length - new Set(rows.map((row) => columns.map((column) => row[column]).join("|"))).size },
    split: { train: trainRecords.length, validation: validationRecords.length, test: testRecords.length, trainIds: trainRecords.map((record) => record.id), validationIds: validationRecords.map((record) => record.id), testIds: testRecords.map((record) => record.id), splitRule: "Application-compatible 20% final holdout, then 20% validation slice of development records; stable clinical-row IDs used." },
    architecture: "11-input TensorFlow.js Sequential: Dense(128 ReLU, L2=.001), BatchNorm, Dense(64 ReLU, L2=.001), BatchNorm, Dropout(.3), Dense(32 ReLU, L2=.001), BatchNorm, Dropout(.2), Dense(16 ReLU, L2=.001), Dense(1 linear); Adam learning rate .001 in the application training helper.",
    metrics: Object.fromEntries(Object.entries({ train, validation, test }).map(([key, value]) => [key, Object.fromEntries(Object.entries(value.metrics).map(([metric, result]) => [metric, Array.isArray(result) ? result : round(result)]))])),
    architectureComparison: {
      current: "11 → 128 → 64 → 32 → 16 → 1 with batch normalization, dropout, L2 regularization",
      compact: "11 → 32 → 16 → 8 → 1 with L2 regularization",
      compactTestMetrics: Object.fromEntries(Object.entries(compactTest.metrics).map(([metric, result]) => [metric, Array.isArray(result) ? result : round(result)])),
      selectionRule: "Comparison only; the deployed architecture is not changed automatically. Select using validation performance before finalizing a research model.",
    },
    binaryConfusionMatrices: { train: train.metrics.confusionMatrix, validation: validation.metrics.confusionMatrix, test: test.metrics.confusionMatrix },
    threeCategoryConfusionMatrices: { train: categoryMatrix(train.predictions, train.targets), validation: categoryMatrix(validation.predictions, validation.targets), test: categoryMatrix(test.predictions, test.targets) },
    threeCategoryMetrics: { train: categoryMetrics(train.predictions, train.targets), validation: categoryMetrics(validation.predictions, validation.targets), test: categoryMetrics(test.predictions, test.targets) },
    blandAltman: blandAltmanStats(test.predictions, test.targets),
    reproducibilityNotes: [
      "This reproduction uses stable clinical-row fingerprints matching newly created application record IDs. Existing workspaces with legacy random IDs must be exported to preserve their exact assignments.",
      "TensorFlow.js initialization and shuffled training are stochastic; reproduced metrics can vary between runs unless seed control and persisted IDs are added.",
      "The application stores only aggregate metrics, not per-record predictions, so direct one-to-one metric comparison requires an export from the active model workspace.",
      "Application and reproduction ROC-AUC now use the same conventional pairwise ranking method."
    ]
  };
  fs.writeFileSync(path.join(outputDir, "reproducibility-results.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outputDir, "predictions.csv"), ["split,actual_hba1c,predicted_hba1c,actual_category,predicted_category"].concat([
    ...train.targets.map((actual, i) => `train,${actual},${train.predictions[i]},${categories(actual)},${categories(train.predictions[i])}`),
    ...validation.targets.map((actual, i) => `validation,${actual},${validation.predictions[i]},${categories(actual)},${categories(validation.predictions[i])}`),
    ...test.targets.map((actual, i) => `test,${actual},${test.predictions[i]},${categories(actual)},${categories(test.predictions[i])}`)
  ]).join("\n"));
  writeSvg("actual-vs-predicted.svg", scatterSvg(testPairs, "Actual versus predicted HbA1c (test set)", "Laboratory HbA1c (%)", "Predicted HbA1c (%)"));
  const bland = test.predictions.map((prediction, i) => ({ x: (prediction + test.targets[i]) / 2, y: prediction - test.targets[i] }));
  writeSvg("bland-altman.svg", scatterSvg(bland, "Bland–Altman plot", "Mean of actual and predicted HbA1c", "Prediction minus actual"));
  const testLabels = test.targets.map((value) => value >= 6.5);
  const rocPoints = [{ x: 0, y: 0 }];
  [...new Set(test.predictions)].sort((a, b) => b - a).forEach((threshold) => {
    const predicted = test.predictions.map((value) => value >= threshold);
    const matrix = confusion(testLabels, predicted);
    rocPoints.push({ x: matrix.fp / (matrix.fp + matrix.tn || 1), y: matrix.tp / (matrix.tp + matrix.fn || 1) });
  });
  rocPoints.push({ x: 1, y: 1 });
  writeSvg("roc-curve.svg", lineSvg(rocPoints, "Binary ROC curve (test set)", "False-positive rate", "Sensitivity"));
  const calibration = [0, 1, 2].map((category) => {
    const selected = test.predictions.map((prediction, i) => ({ prediction, actual: test.targets[i] })).filter((row) => categories(row.prediction) === category);
    return { x: selected.length ? selected.reduce((sum, row) => sum + row.prediction, 0) / selected.length : 0, y: selected.length ? selected.reduce((sum, row) => sum + row.actual, 0) / selected.length : 0 };
  });
  writeSvg("calibration-plot.svg", lineSvg(calibration, "Category-stratified calibration (test set)", "Mean predicted HbA1c (%)", "Mean observed HbA1c (%)", 4, 10, 4, 10));
  console.log(JSON.stringify({ outputDir, rows: rows.length, valid: valid.length, split: report.split, testMetrics: report.metrics.test }, null, 2));
  fs.writeFileSync(path.join(outputDir, "split-assignments.json"), JSON.stringify({ train: trainRecords.map((record) => record.id), validation: validationRecords.map((record) => record.id), test: testRecords.map((record) => record.id) }, null, 2));
  model.dispose(); compactModel.dispose(); validationInputs.dispose(); validationTargets.dispose(); training.x.dispose(); training.y.dispose(); training.mean.dispose(); training.std.dispose();
})();
