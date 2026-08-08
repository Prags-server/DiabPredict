import * as tf from "@tensorflow/tfjs";

type ZScoreStats = {
  mode: "zscore";
  mean: tf.Tensor1D;
  std: tf.Tensor1D;
};

type MinMaxStats = {
  mode: "minmax";
  min: tf.Tensor1D;
  max: tf.Tensor1D;
};

export type NormalizationStats = ZScoreStats | MinMaxStats;

export async function prepareData(rawData: any[]) {
  // First validate the data
  const validData = rawData.filter((row) => {
    // Check for missing or invalid values
    const values = [
      row.age,
      row.gender,
      row.height,
      row.weight,
      row.bmi,
      row.systolic_bp,
      row.diastolic_bp,
      row.rbs,
      row.fbs,
      row.waist,
      row.hip,
    ];
    return values.every(
      (val) => val !== undefined && val !== null && !isNaN(val)
    );
  });

  if (validData.length < rawData.length) {
    console.warn(
      `Filtered out ${rawData.length - validData.length} rows with invalid data`
    );
  }

  // Extract features and target
  const X = validData.map((row: any) => [
    parseFloat(row.age),
    parseFloat(row.gender),
    parseFloat(row.height),
    parseFloat(row.weight),
    parseFloat(row.bmi),
    parseFloat(row.systolic_bp),
    parseFloat(row.diastolic_bp),
    parseFloat(row.rbs), // random blood sugar
    parseFloat(row.fbs), // fasting blood sugar
    parseFloat(row.waist),
    parseFloat(row.hip),
  ]);

  const Y = validData.map((row: any) => parseFloat(row.hba1c));

  // Convert to tensors
  const xTensor = tf.tensor2d(X);
  const yTensor = tf.tensor1d(Y);

  // Check for NaN or Infinity values after conversion
  const hasNaN =
    tf.any(tf.isNaN(xTensor)).dataSync()[0] ||
    tf.any(tf.isNaN(yTensor)).dataSync()[0];

  if (hasNaN) {
    console.error("NaN values detected in the tensors after conversion");
  }

  // Handle outliers before normalization (clip to reasonable range if needed)
  // Example: For features that should be positive (like age, weight, etc.)
  const xClipped = tf.clipByValue(xTensor, 0, Number.MAX_VALUE);

  // Normalize the input features
  const xMean = xClipped.mean(0);
  const xStd = xClipped.sub(xMean).square().mean(0).sqrt();

  // Add a larger epsilon to prevent division by near-zero
  const epsilon = 1e-6;
  const xNorm = xClipped.sub(xMean).div(xStd.add(epsilon));

  // Verify normalization result doesn't contain NaN
  const normHasNaN = tf.any(tf.isNaN(xNorm)).dataSync()[0];
  if (normHasNaN) {
    console.error("NaN values detected after normalization");
    // Fallback to a simpler normalization if needed
    return handleNormalizationFailure(xClipped, yTensor);
  }

  // Log summary statistics for debugging
  console.log("Data preparation completed:");
  console.log(`- Samples: ${xNorm.shape[0]}`);
  console.log(`- Features: ${xNorm.shape[1]}`);
  console.log(
    `- X range after normalization: [${xNorm.min().dataSync()[0]}, ${
      xNorm.max().dataSync()[0]
    }]`
  );
  console.log(
    `- Y range: [${yTensor.min().dataSync()[0]}, ${
      yTensor.max().dataSync()[0]
    }]`
  );

  return {
    X: xNorm as tf.Tensor2D,
    Y: yTensor,
    stats: {
      mode: "zscore",
      mean: xMean,
      std: xStd,
    } as ZScoreStats,
  };
}

// Fallback function in case standard normalization fails
function handleNormalizationFailure(
  xTensor: tf.Tensor2D,
  yTensor: tf.Tensor1D
) {
  console.warn(
    "Using fallback min-max normalization due to issues with Z-score normalization"
  );

  // Use min-max scaling instead
  const xMin = xTensor.min(0);
  const xMax = xTensor.max(0);
  const range = tf.sub(xMax, xMin);

  // Add epsilon to range to avoid division by zero
  const epsilon = 1e-6;
  const xNorm = xTensor.sub(xMin).div(range.add(epsilon));

  return {
    X: xNorm as tf.Tensor2D,
    Y: yTensor,
    stats: {
      mode: "minmax",
      min: xMin,
      max: xMax,
    } as MinMaxStats,
  };
}
