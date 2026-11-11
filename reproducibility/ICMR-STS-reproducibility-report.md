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
| Training (n=222) | 0.3310 | 0.1671 | 0.4088 | 0.8726 |
| Validation (n=55) | 0.5906 | 0.6640 | 0.8149 | 0.3236 |
| Test (n=69) | 0.5326 | 0.6152 | 0.7844 | 0.5541 |

The validation error is higher than the training error, indicating generalization uncertainty and possible overfitting. The test result in this single stochastic reproduction should be treated as preliminary, not as a definitive clinical performance estimate.

## Binary diabetes-threshold results

For binary screening analysis, HbA1c ≥6.5% is treated as positive. On the test set, the confusion matrix is shown as rows = actual negative/positive and columns = predicted negative/positive:

```text
[[50, 4],
 [ 2,13]]
```

Sensitivity was **0.8667**, specificity **0.9259**, PPV **0.7647**, NPV **0.9615**, F1-score **0.8125**, and conventional pairwise ROC-AUC **0.9815**.

## Three-category results

Categories are normal (<5.7%), prediabetes (5.7% to <6.5%), and diabetes (≥6.5%). The test confusion matrix, with rows = actual category and columns = predicted category, is:

```text
[[13, 5, 0],
 [18,18, 0],
 [ 1, 1,13]]
```

The test macro-F1 was **0.6586** and balanced accuracy was **0.6963**. Category-specific sensitivity was **0.7222** for normal, **0.5000** for prediabetes, and **0.8667** for diabetes. The largest error pattern is movement between normal and prediabetes, so the three-category output should not be presented as perfectly calibrated or diagnostic.

The test-only Bland–Altman analysis showed a mean bias of **-0.0941 HbA1c percentage points**, with 95% limits of agreement from **-1.6315 to 1.4434**. The 95% confidence interval for the mean bias was **-0.2791 to 0.0910**.

## Figures

- [Actual-versus-predicted plot](./actual-vs-predicted.svg)
- [ROC curve](./roc-curve.svg)
- [Category-stratified calibration plot](./calibration-plot.svg)
- [Bland–Altman plot](./bland-altman.svg)

The calibration figure is descriptive: it compares mean predicted and observed HbA1c within the three predicted clinical bands. It is not a full probability calibration curve because the model outputs a continuous HbA1c estimate rather than a calibrated class probability.

## Comparison with application metrics

A numerical one-to-one comparison with an already persisted production model requires the private workspace export. The current implementation now persists split assignments with newly trained models and exports them with the workspace. The supplied JSON and CSV outputs preserve this reproduction's evidence without substituting improved or invented values.

The compact architecture comparison was also run on the same split. Its test MAE was **0.5819**, RMSE **0.7440**, and R² **0.5989**, while the current architecture's test MAE was **0.5326**, RMSE **0.7844**, and R² **0.5541** in this single stochastic run. The current model had lower MAE, while the compact model had lower RMSE and higher R². This comparison is inconclusive from one stochastic run; repeated fixed-seed evaluation is required before selecting one architecture scientifically.

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
