import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Heart,
  TrendingUp,
} from "lucide-react";

type PredictionDetails = {
  predictedHbA1c: number;
  diabeticStatus: string;
  risk: string;
  interpretation: {
    description: string;
    distanceToNextThreshold: string;
  };
};

const HbA1cResultCard = ({ prediction }: { prediction: PredictionDetails }) => {
  // Handle status-based styling
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Non-Diabetic":
        return "bg-green-100 text-green-800";
      case "Pre-Diabetic":
        return "bg-yellow-100 text-yellow-800";
      case "Diabetic":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Non-Diabetic":
        return <Heart className="text-green-500" />;
      case "Pre-Diabetic":
        return <AlertCircle className="text-yellow-500" />;
      case "Diabetic":
        return <Activity className="text-red-500" />;
      default:
        return <Activity className="text-gray-500" />;
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "Low":
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
            Low Risk
          </span>
        );
      case "Moderate":
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
            Moderate Risk
          </span>
        );
      case "High":
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
            High Risk
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
            Unknown Risk
          </span>
        );
    }
  };

  const getTrendIcon = (status: string) => {
    switch (status) {
      case "Non-Diabetic":
        return <ArrowDown className="text-green-500 h-5 w-5" />;
      case "Pre-Diabetic":
        return <TrendingUp className="text-yellow-500 h-5 w-5" />;
      case "Diabetic":
        return <ArrowUp className="text-red-500 h-5 w-5" />;
      default:
        return null;
    }
  };

  // Show a warning if the prediction is unusually low
  const showLowValueWarning = prediction?.predictedHbA1c < 4.0;

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden max-w-md w-full">
      {/* Header */}
      <div className="px-6 py-4 bg-blue-600 text-white flex justify-between items-center">
        <h2 className="text-xl font-bold">HbA1c Prediction Results</h2>
        <Activity className="h-6 w-6" />
      </div>

      {/* Main content */}
      <div className="p-6">
        {/* Result value */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500 uppercase font-semibold">
              Predicted HbA1c
            </p>
            <div className="flex items-center">
              <span className="text-4xl font-bold text-gray-800">
                {prediction?.predictedHbA1c}
              </span>
              {getTrendIcon(prediction?.diabeticStatus)}
            </div>
          </div>
          <div
            className={`p-4 rounded-full ${getStatusColor(
              prediction?.diabeticStatus
            )}`}
          >
            {getStatusIcon(prediction?.diabeticStatus)}
          </div>
        </div>

        {/* Status & Risk */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium text-gray-800">
              {prediction?.diabeticStatus}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Risk Level</p>
            <div>{getRiskBadge(prediction?.risk)}</div>
          </div>
        </div>

        {/* Threshold information */}
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-1">Threshold Analysis</p>
          <p className="text-sm font-medium text-gray-700">
            {prediction?.interpretation?.distanceToNextThreshold}
          </p>
        </div>

        {/* Description */}
        <div className="bg-blue-50 p-4 rounded-lg mb-4">
          <p className="text-sm text-blue-800">
            {prediction?.interpretation?.description}
          </p>
        </div>

        {/* Warning for unusually low values */}
        {showLowValueWarning && (
          <div className="bg-yellow-50 p-4 rounded-lg mt-4 border border-yellow-200">
            <div className="flex items-start">
              <AlertCircle className="text-yellow-500 h-5 w-5 mr-2 mt-0.5" />
              <p className="text-sm text-yellow-800">
                The predicted value is unusually low. Please consult with a
                healthcare professional for accurate testing.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 text-center">
        <p className="text-xs text-gray-500">
          This is a prediction only. Always consult healthcare professionals for
          medical advice.
        </p>
      </div>
    </div>
  );
};

export default HbA1cResultCard;
