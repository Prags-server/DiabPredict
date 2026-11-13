import * as tf from "@tensorflow/tfjs";
import { NormalizationStats } from "./prepare";

const NORMAL_THRESHOLD = 5.7;
const DIABETES_THRESHOLD = 6.5;
const BORDERLINE_DISTANCE = 0.3;

export async function predictPatient(
  newPatient: any,
  trainedModel: any,
  stats?: NormalizationStats
) {
  // Convert patient data to tensor
  const inputTensor = tf.tensor2d([newPatient]);

  // Normalize input if stats are provided
  let normalizedInput = inputTensor;
  if (stats?.mode === "zscore") {
    normalizedInput = inputTensor.sub(stats.mean).div(stats.std.add(1e-8));
  } else if (stats?.mode === "minmax") {
    const range = stats.max.sub(stats.min);
    normalizedInput = inputTensor.sub(stats.min).div(range.add(1e-8));
  }

  // Predict
  const prediction = trainedModel.predict(normalizedInput);
  const hba1cValue = prediction.dataSync()[0];

  // Clean up tensors
  inputTensor.dispose();
  normalizedInput.dispose();
  prediction.dispose();

  // Categorize HbA1c value according to standard medical guidelines
  let diabeticStatus = "Non-Diabetic";
  let risk = "Low";

  if (hba1cValue < NORMAL_THRESHOLD) {
    diabeticStatus = "Non-Diabetic";
    risk = "Low";
  } else if (hba1cValue < DIABETES_THRESHOLD) {
    diabeticStatus = "Pre-Diabetic";
    risk = "Moderate";
  } else {
    diabeticStatus = "Diabetic";
    risk = "High";
  }

  const distanceToThreshold = Math.min(
    Math.abs(hba1cValue - NORMAL_THRESHOLD),
    Math.abs(hba1cValue - DIABETES_THRESHOLD)
  );
  const isBorderline = distanceToThreshold <= BORDERLINE_DISTANCE;

  return {
    predictedHbA1c: parseFloat(hba1cValue.toFixed(2)),
    diabeticStatus,
    risk,
    isBorderline,
    interpretation: {
      status: diabeticStatus,
      description: getDescription(diabeticStatus, isBorderline),
      distanceToNextThreshold: getDistanceToThreshold(
        hba1cValue,
        diabeticStatus
      ),
      thresholdWarning: isBorderline
        ? "This estimate is close to a clinical HbA1c threshold. Classification may change with normal measurement variation; confirm with a laboratory HbA1c test."
        : null,
    },
  };
}

function getDescription(status: string, isBorderline: boolean): string {
  if (isBorderline) {
    return "This estimate is near a category boundary. Use it for screening discussion only and arrange confirmatory laboratory testing with a healthcare professional.";
  }
  switch (status) {
    case "Non-Diabetic":
      return "Your predicted HbA1c is within the normal range. Continue maintaining healthy lifestyle habits.";
    case "Pre-Diabetic":
      return "Your predicted HbA1c falls in the pre-diabetic range. Consider lifestyle modifications and consult with a healthcare provider.";
    case "Diabetic":
      return "Your predicted HbA1c is in the diabetic range. Please consult with a healthcare provider for proper management.";
    default:
      return "Unable to provide a description for your HbA1c value.";
  }
}

// Helper function to calculate distance to next threshold
function getDistanceToThreshold(hba1cValue: number, status: string): string {
  switch (status) {
    case "Non-Diabetic":
      return `${(NORMAL_THRESHOLD - hba1cValue).toFixed(
        2
      )} units below pre-diabetic threshold (${NORMAL_THRESHOLD})`;
    case "Pre-Diabetic":
      return `${(DIABETES_THRESHOLD - hba1cValue).toFixed(
        2
      )} units below diabetic threshold (${DIABETES_THRESHOLD})`;
    case "Diabetic":
      return `${(hba1cValue - DIABETES_THRESHOLD).toFixed(
        2
      )} units above diabetic threshold (${DIABETES_THRESHOLD})`;
    default:
      return "";
  }
}
