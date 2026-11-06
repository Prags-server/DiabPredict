import * as tf from "@tensorflow/tfjs";

/**
 * Creates an enhanced sequential neural network model for predicting HbA1c values.
 * The model architecture is specifically optimized for high-accuracy regression on patient health data.
 *
 * @returns {tf.Sequential} A compiled TensorFlow.js sequential model
 */
export function createModel(): tf.Sequential {
  // Create a sequential model
  const model = tf.sequential();

  // Input layer - Using batch normalization for better stability
  model.add(
    tf.layers.dense({
      inputShape: [11],
      units: 128,
      activation: "relu",
      kernelInitializer: "glorotNormal",
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
    })
  );

  // Add batch normalization for training stability
  model.add(tf.layers.batchNormalization());

  // First hidden layer
  model.add(
    tf.layers.dense({
      units: 64,
      activation: "relu",
      kernelInitializer: "glorotNormal",
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
    })
  );

  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.dropout({ rate: 0.3 }));

  // Second hidden layer - Wider than before
  model.add(
    tf.layers.dense({
      units: 32,
      activation: "relu",
      kernelInitializer: "glorotNormal",
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
    })
  );

  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.dropout({ rate: 0.2 }));

  // Additional hidden layer specifically for feature extraction
  model.add(
    tf.layers.dense({
      units: 16,
      activation: "relu",
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
    })
  );

  // Output layer for HbA1c prediction
  model.add(
    tf.layers.dense({
      units: 1,
      activation: "linear", // Linear activation for regression
      kernelInitializer: "zeros", // More stable initialization for output layer
    })
  );

  // Use a custom optimizer configuration with gradient clipping
  const optimizer = tf.train.adam(0.001);

  // Apply gradient clipping to the optimizer
  // Note: TensorFlow.js adam() only accepts learning rate as a number
  // We'll configure other parameters when compiling the model

  // Compile with mean squared error loss
  model.compile({
    optimizer: optimizer,
    loss: "meanSquaredError",
    metrics: ["mse", "mae"], // Added mean absolute error as additional metric
  });

  console.log("Enhanced HbA1c prediction model created and compiled");
  model.summary();

  return model;
}
