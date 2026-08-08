import * as tf from "@tensorflow/tfjs";
import { NormalizationStats } from "./prepare";

interface TrainingParams {
  trainingData: {
    X: tf.Tensor2D;
    Y: tf.Tensor1D;
    stats: NormalizationStats;
  };
  model: tf.Sequential;
  epochs?: number;
  batchSize?: number;
  validationSplit?: number;
  earlyStoppingPatience?: number;
  learningRate?: number;
}

export async function trainModel({
  trainingData,
  model,
  epochs = 200,
  batchSize = 16,
  validationSplit = 0.2,
  earlyStoppingPatience = 10,
  learningRate = 0.001,
}: TrainingParams): Promise<tf.History> {
  console.log("Starting model training...");

  // Create optimizer with custom learning rate
  const optimizer = tf.train.adam(learningRate);

  // Compile the model with the optimizer
  model.compile({
    optimizer: optimizer,
    loss: "meanSquaredError",
    metrics: ["mse", "mae"],
  });

  // Track best model state
  let bestLoss = Infinity;
  let bestModelWeights: tf.NamedTensorMap | null = null;
  let patienceCounter = 0;

  // Train the model
  const history = await model.fit(trainingData.X, trainingData.Y, {
    epochs,
    batchSize,
    validationSplit,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        const valLoss = logs?.val_loss || 0;

        console.log(
          `Epoch ${epoch + 1}/${epochs}: loss = ${logs?.loss.toFixed(
            4
          )}, val_loss = ${valLoss.toFixed(4)}, mae = ${
            logs?.mae?.toFixed(4) || "N/A"
          }`
        );

        // Early stopping logic
        if (valLoss < bestLoss) {
          bestLoss = valLoss;
          // Save the weights of the best model
          bestModelWeights = {};
          const weights = model.getWeights();
          weights.forEach((weight, i) => {
            bestModelWeights![`weight_${i}`] = weight.clone();
          });
          patienceCounter = 0;
        } else {
          patienceCounter++;
          if (patienceCounter >= earlyStoppingPatience) {
            console.log(`Early stopping triggered after ${epoch + 1} epochs`);
            model.stopTraining = true;
          }
        }
      },
    },
  });

  console.log("Model training completed");

  // Restore best model weights if available
  if (bestModelWeights) {
    console.log("Restoring best model weights...");
    const bestWeights = Object.values(bestModelWeights).map((w: any) =>
      w.clone()
    );
    model.setWeights(bestWeights);

    // Clean up tensor memory
    Object.values(bestModelWeights).forEach((w: any) => w.dispose());
  }

  // Evaluate the model on the training data
  const evaluation = model.evaluate(trainingData.X, trainingData.Y, {
    batchSize,
  }) as tf.Scalar[];

  console.log(`Final MSE: ${evaluation[0].dataSync()[0].toFixed(4)}`);
  console.log(`Final MAE: ${evaluation[1].dataSync()[0].toFixed(4)}`);

  return history;
}
