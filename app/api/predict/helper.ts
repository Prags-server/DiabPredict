import { createModel } from "@/lib/server/core/create-model";
import { NormalizationStats } from "@/lib/server/core/prepare";
import { trainModel } from "@/lib/server/core/train-model";
import * as tf from "@tensorflow/tfjs";

class ModelSingleton {
  private static model: tf.Sequential | null = null;
  private static stats: NormalizationStats | null = null;
  private static isTrained = false;

  private constructor() {}

  public static async getInstance({
    trainingData,
    resetTraining,
  }: {
    trainingData: {
      X: tf.Tensor2D;
      Y: tf.Tensor1D;
      stats: NormalizationStats;
    };
    resetTraining: boolean;
  }) {
    if (!ModelSingleton.model) {
      ModelSingleton.model = createModel();
    }

    const shouldTrain = !ModelSingleton.isTrained || resetTraining;
    if (shouldTrain) {
      await trainModel({ trainingData, model: ModelSingleton.model });
      ModelSingleton.stats = trainingData.stats;
      ModelSingleton.isTrained = true;
    }

    return {
      model: ModelSingleton.model,
      stats: ModelSingleton.stats,
    };
  }
}

export const getModel = ModelSingleton.getInstance;
