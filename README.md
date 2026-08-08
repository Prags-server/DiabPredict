# Predict Diabetes (Test/experimental Project)

The system is designed to be a screening test tool for experiment and should be used in conjunction with professional medical advice

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000`

## Deploy to Vercel (Production)

1. Import this repository in Vercel.
2. Add environment variables from [.env.example](C:/Users/prags/OneDrive/Desktop/DiabPredict/DiabPredict/.env.example):
   - `SESSION_SECRET` (required in production)
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN` (recommended for persistent history)
3. Deploy.

Without KV, history falls back to local filesystem storage, which is not durable on serverless production.

## Training CSV Format

Upload a CSV file with these headers (in this order):

`age,gender,height,weight,bmi,systolic_bp,diastolic_bp,rbs,fbs,waist,hip,hba1c`

## Prediction History Persistence

- Predictions are saved by the backend API in Vercel KV when configured.
- Local fallback uses `.data/history/<userId>.json` for development.
- History is isolated per signed-in profile.
- History can be loaded, removed, and cleared from the UI.

## Profile Authentication

- The app uses lightweight profile sign-in (name-based) with an HTTP-only session cookie.
- Set `SESSION_SECRET` in your environment for production deployments.
- You must sign in before prediction history can be accessed.

Diabetes Prediction System - Core Logic Explained

1. Data Collection
   The system collects 11 key health parameters from patients:
   Age
   Gender
   Height
   Weight
   BMI (Body Mass Index)
   Blood Pressure (High and Low)
   Random Blood Sugar (RBS)
   Fasting Blood Sugar (FBS)
   Waist measurement
   Hip measurement
2. Prediction Process
   The system uses a machine learning model to predict HbA1c levels, which is a key indicator for diabetes. Here's how it works:
   Step 1: Data Preparation
   The system takes patient data and normalizes it to ensure consistent analysis
   It checks for any missing or invalid values
   The data is converted into a format suitable for the prediction model
   Step 2: Prediction
   The model predicts the HbA1c value, which is then categorized into three levels:
   Non-Diabetic: HbA1c < 5.7%
   Pre-Diabetic: HbA1c between 5.7% and 6.5%
   Diabetic: HbA1c ≥ 6.5%
   Step 3: Risk Assessment
   Based on the HbA1c prediction, the system assigns a risk level:
   Low Risk: For non-diabetic patients
   Moderate Risk: For pre-diabetic patients
   High Risk: For diabetic patients
3. Results Interpretation
   The system provides:
   The predicted HbA1c value
   The patient's diabetic status
   Risk level assessment
   A clear description of what the results mean
   Information about how far the patient is from the next threshold (e.g., how close a pre-diabetic patient is to becoming diabetic)
4. Medical Guidelines
   The system follows standard medical guidelines for diabetes diagnosis:
   Non-Diabetic: HbA1c < 5.7%
   Pre-Diabetic: HbA1c 5.7% - 6.4%
   Diabetic: HbA1c ≥ 6.5%

## Summary

## Data Processing and Quality Control

The system first validates all input data to ensure there are no missing or invalid values. It normalizes the data (scales it to a standard range) to ensure consistent analysis.

### Example Patient Data

| Parameter      | Value                  |
| -------------- | ---------------------- |
| Age            | 45                     |
| Gender         | 1 (male) or 0 (female) |
| Height         | 170 cm                 |
| Weight         | 75 kg                  |
| BMI            | 26                     |
| Blood Pressure | 130/85                 |
| RBS            | 140 mg/dL              |
| FBS            | 110 mg/dL              |
| Waist          | 90 cm                  |
| Hip            | 100 cm                 |

## The Prediction Model Architecture

The system uses a sophisticated neural network with multiple layers:

### Network Structure

- **Input Layer**: Takes the 11 health parameters
- **Hidden Layers**:
  - First layer: 128 neurons with ReLU activation
  - Second layer: 64 neurons with ReLU activation
  - Third layer: 32 neurons with ReLU activation
  - Fourth layer: 16 neurons with ReLU activation
- **Output Layer**: Predicts the HbA1c value

### Model Features

- Batch normalization for stable training
- Dropout layers to prevent overfitting
- Regularization to maintain model simplicity

## Risk Assessment Process

The system follows a detailed risk assessment protocol:

### a) Non-Diabetic (Low Risk)

- HbA1c < 5.7%
- System provides: How many units below the pre-diabetic threshold
- Example: If HbA1c is 5.2%, it would show "0.5 units below pre-diabetic threshold (5.7)"

### b) Pre-Diabetic (Moderate Risk)

- HbA1c between 5.7% and 6.5%
- System provides: How close to the diabetic threshold
- Example: If HbA1c is 6.0%, it would show "0.5 units below diabetic threshold (6.5)"

### c) Diabetic (High Risk)

- HbA1c ≥ 6.5%
- System provides: How many units above the diabetic threshold
- Example: If HbA1c is 7.0%, it would show "0.5 units above diabetic threshold (6.5)"

## Interpretation and Recommendations

For each risk level, the system provides specific guidance:

### a) Non-Diabetic

- Message: "Your predicted HbA1c is within the normal range. Continue maintaining healthy lifestyle habits."
- Focus on preventive measures and regular monitoring

### b) Pre-Diabetic

- Message: "Your predicted HbA1c falls in the pre-diabetic range. Consider lifestyle modifications and consult with a healthcare provider."
- Emphasis on lifestyle changes and regular follow-ups

### c) Diabetic

- Message: "Your predicted HbA1c is in the diabetic range. Please consult with a healthcare provider for proper management."
- Immediate medical attention recommended
