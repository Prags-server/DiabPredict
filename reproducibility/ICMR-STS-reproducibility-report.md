# DiabPredict reproducibility analysis

## Scope and reproducibility statement

This analysis evaluates the supplied file `Final%20346%20patient%20data%282%29.csv` using the preprocessing and TensorFlow.js neural-network architecture implemented by DiabPredict. It is an independent reproduction from the raw CSV, not a claim that the persisted production workspace produced these exact numbers. Newly created records use stable clinical-row fingerprints, while older workspaces may contain legacy random IDs; training is also stochastic, so the exact production weights require the private workspace export.

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
| Training (n=222) | 0.3949 | 0.2708 | 0.5204 | 0.7935 |
| Validation (n=55) | 0.6360 | 0.7138 | 0.8449 | 0.2578 |
| Test (n=69) | 0.5452 | 0.6882 | 0.8296 | 0.5013 |

The validation error is higher than the training error, indicating generalization uncertainty and possible overfitting. The test result in this single stochastic reproduction should be treated as preliminary, not as a definitive clinical performance estimate.

## Binary diabetes-threshold results

For binary screening analysis, HbA1c ≥6.5% is treated as positive. On the test set, the confusion matrix is shown as rows = actual negative/positive and columns = predicted negative/positive:

```text
[[52, 2],
 [ 2,13]]
```

Sensitivity was **0.8667**, specificity **0.9630**, PPV **0.8667**, NPV **0.9630**, F1-score **0.8667**, and conventional pairwise ROC-AUC **0.9481**.

## Three-category results

Categories are normal (<5.7%), prediabetes (5.7% to <6.5%), and diabetes (≥6.5%). The test confusion matrix, with rows = actual category and columns = predicted category, is:

```text
[[12, 6, 0],
 [20,14, 2],
 [ 1, 1,13]]
```

The largest error pattern is movement between normal and prediabetes. This is clinically plausible near a threshold, but it means the three-category output should not be presented as perfectly calibrated or diagnostic.

## Figures

- [Actual-versus-predicted plot](./actual-vs-predicted.svg)
- [ROC curve](./roc-curve.svg)
- [Category-stratified calibration plot](./calibration-plot.svg)
- [Bland–Altman plot](./bland-altman.svg)

The calibration figure is descriptive: it compares mean predicted and observed HbA1c within the three predicted clinical bands. It is not a full probability calibration curve because the model outputs a continuous HbA1c estimate rather than a calibrated class probability.

## Comparison with application metrics

A numerical one-to-one comparison with an already persisted production model requires the private workspace export. The current implementation now persists split assignments with newly trained models and exports them with the workspace. The supplied JSON and CSV outputs preserve this reproduction's evidence without substituting improved or invented values.

The compact architecture comparison was also run on the same split. Its test MAE was **0.6310**, RMSE **0.8784**, and R² **0.4409**, compared with the current architecture's test MAE **0.5452**, RMSE **0.8296**, and R² **0.5013** in this single stochastic run. This comparison is evidence for review, not a basis for claiming universal superiority; repeated seeded evaluation is still recommended.

## Functional answer

Yes. The implemented model performs the requested functional pathway:

1. It trains on the 11 listed patient variables.
2. It uses laboratory HbA1c as the continuous target.
3. It accepts the same 11 variables for a new patient without requiring HbA1c.
4. It predicts a continuous HbA1c value.
5. It assigns the predicted value to normal, prediabetes, or diabetes and derives low, moderate, or high risk.

It is therefore a regression-based screening support model with post-prediction clinical categorization, not a classification model trained directly on risk labels and not a diagnostic replacement.

## Methodological recommendations

Before academic submission, the research workflow should fix and record random seeds, export split assignments and per-record predictions, repeat training across several seeds or use repeated cross-validation, report confidence intervals, and distinguish the exploratory reproduction from prospective clinical validation. Application and reproduction ROC-AUC now use the same conventional pairwise ranking method.
