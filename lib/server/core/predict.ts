import * as tf from "@tensorflow/tfjs";
import { NormalizationStats } from "./prepare";

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

  if (hba1cValue < 5.7) {
    diabeticStatus = "Non-Diabetic";
    risk = "Low";
  } else if (hba1cValue >= 5.7 && hba1cValue < 6.5) {
    diabeticStatus = "Pre-Diabetic";
    risk = "Moderate";
  } else {
    diabeticStatus = "Diabetic";
    risk = "High";
  }

  // Generate an interpretable output
  return {
    predictedHbA1c: parseFloat(hba1cValue.toFixed(2)),
    diabeticStatus,
    risk,
    interpretation: {
      status: diabeticStatus,
      description: getDescription(diabeticStatus),
      distanceToNextThreshold: getDistanceToThreshold(
        hba1cValue,
        diabeticStatus
      ),
    },
  };
}

// Helper function to get description based on status
function getDescription(status: string): string {
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
      return `${(5.7 - hba1cValue).toFixed(
        2
      )} units below pre-diabetic threshold (5.7)`;
    case "Pre-Diabetic":
      return `${(6.5 - hba1cValue).toFixed(
        2
      )} units below diabetic threshold (6.5)`;
    case "Diabetic":
      return `${(hba1cValue - 6.5).toFixed(
        2
      )} units above diabetic threshold (6.5)`;
    default:
      return "";
  }
}
