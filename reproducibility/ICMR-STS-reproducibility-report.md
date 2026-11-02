# DiabPredict reproducibility analysis

## Scope and reproducibility statement

This analysis evaluates the supplied file `Final%20346%20patient%20data%282%29.csv` using the preprocessing and TensorFlow.js neural-network architecture implemented by DiabPredict. It is an independent reproduction from the raw CSV, not a claim that the persisted production workspace produced these exact numbers. The application creates random UUIDs when records are imported and training is stochastic; therefore, the exact production split and weights cannot be reconstructed from the CSV alone.

The analysis uses deterministic row identities (`row-1` through `row-346`) solely to make this reproduction auditable. A future research release should persist a stable row fingerprint or split seed and export per-record predictions.

## Data validation and allocation

- Raw records: **346**
- Records passing required-field, numeric, range, and blood-pressure-order checks: **346**
- Records excluded: **0**
- Duplicate clinical rows detected: **0**
- Features: age, gender, height, weight, BMI, systolic BP, diastolic BP, RBS, FBS, waist circumference, and hip circumference
- Outcome: laboratory HbA1c
- Training records: **222**
- Validation records: **55**
- Final test records: **69**

The split follows the application's deterministic structure: a 20% final holdout is removed first, followed by a 20% validation slice of the development records. The model is trained only on the 222 training records.

## Model and preprocessing

The model is a continuous HbA1c regression model. Inputs are clipped at zero and standardized using means and standard deviations calculated from the training records only. The architecture is:

`Dense(128, ReLU, L2=.001) → BatchNorm → Dense(64, ReLU, L2=.001) → BatchNorm → Dropout(.3) → Dense(32, ReLU, L2=.001) → BatchNorm → Dropout(.2) → Dense(16, ReLU, L2=.001) → Dense(1, linear)`.

Training uses Adam, mean squared error, batch size 16, 200 epochs, shuffling, and the application's effective learning rate of 0.001 from `train-model.ts`.

## Regression results

| Split | MAE | MSE | RMSE | R² |
|---|---:|---:|---:|---:|
| Training (n=222) | 0.3221 | 0.1679 | 0.4097 | 0.8616 |
| Validation (n=55) | 0.8031 | 1.1509 | 1.0728 | 0.3592 |
| Test (n=69) | 0.4245 | 0.4000 | 0.6325 | 0.5324 |

The validation error is higher than the training error, indicating generalization uncertainty and possible overfitting. The test result in this single stochastic reproduction should be treated as preliminary, not as a definitive clinical performance estimate.

## Binary diabetes-threshold results

For binary screening analysis, HbA1c ≥6.5% is treated as positive. On the test set, the confusion matrix is shown as rows = actual negative/positive and columns = predicted negative/positive:

```text
[[59, 2],
 [ 2, 6]]
```

Sensitivity was **0.7500**, specificity **0.9672**, PPV **0.7500**, NPV **0.9672**, F1-score **0.7500**, and conventional pairwise ROC-AUC **0.9918**.

## Three-category results

Categories are normal (<5.7%), prediabetes (5.7% to <6.5%), and diabetes (≥6.5%). The test confusion matrix, with rows = actual category and columns = predicted category, is:

```text
[[12, 3, 0],
 [20,24, 2],
 [ 0, 2, 6]]
```

The largest error pattern is movement between normal and prediabetes. This is clinically plausible near a threshold, but it means the three-category output should not be presented as perfectly calibrated or diagnostic.

## Figures

- [Actual-versus-predicted plot](./actual-vs-predicted.svg)
- [ROC curve](./roc-curve.svg)
- [Category-stratified calibration plot](./calibration-plot.svg)
- [Bland–Altman plot](./bland-altman.svg)

The calibration figure is descriptive: it compares mean predicted and observed HbA1c within the three predicted clinical bands. It is not a full probability calibration curve because the model outputs a continuous HbA1c estimate rather than a calibrated class probability.

## Comparison with application metrics

A numerical one-to-one comparison with the application's persisted model could not be completed from the CSV alone. The application stores aggregate metrics and random imported record IDs, but does not currently export the active model's per-record predictions, split assignments, random seed, or exact training history. The supplied JSON and CSV outputs preserve this reproduction's evidence without substituting improved or invented values.

## Functional answer

Yes. The implemented model performs the requested functional pathway:

1. It trains on the 11 listed patient variables.
2. It uses laboratory HbA1c as the continuous target.
3. It accepts the same 11 variables for a new patient without requiring HbA1c.
4. It predicts a continuous HbA1c value.
5. It assigns the predicted value to normal, prediabetes, or diabetes and derives low, moderate, or high risk.

It is therefore a regression-based screening support model with post-prediction clinical categorization, not a classification model trained directly on risk labels and not a diagnostic replacement.

## Methodological recommendations

Before academic submission, the research workflow should persist stable row fingerprints, fix and record random seeds, export split assignments and per-record predictions, repeat training across several seeds or use repeated cross-validation, report confidence intervals, and distinguish the exploratory reproduction from prospective clinical validation. The application should also correct or document any differences between its ROC-AUC implementation and a standard ROC-AUC calculation.
