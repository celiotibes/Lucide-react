/**
 * Setup Wizard Component
 * Multi-step wizard for initial application configuration
 */

import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, AlertCircle, Loader2 } from 'lucide-react';

interface StepConfig {
  id: string;
  title: string;
  description: string;
  order: number;
  fields: StepField[];
}

interface StepField {
  name: string;
  type: 'text' | 'password' | 'number' | 'select' | 'checkbox' | 'textarea';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  conditional?: (values: Record<string, any>) => boolean;
}

interface ValidationError {
  field: string;
  message: string;
}

interface SetupWizardProps {
  platform: string;
  apiBaseUrl: string;
  onComplete?: (configId: string) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  platform,
  apiBaseUrl,
  onComplete,
}) => {
  const [configId, setConfigId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<StepConfig | null>(null);
  const [stepValues, setStepValues] = useState<Record<string, Record<string, any>>>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  // Initialize setup on mount
  useEffect(() => {
    initializeSetup();
  }, []);

  // Load step when it changes
  useEffect(() => {
    if (currentStep) {
      loadStep(currentStep.id);
    }
  }, [currentStep?.id]);

  const initializeSetup = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/setup-wizard/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });

      const data = await response.json();
      setConfigId(data.configId);
      setTotalSteps(data.totalSteps);

      // Load first step
      const stepResponse = await fetch(`${apiBaseUrl}/api/setup-wizard/step/welcome`);
      const stepData = await stepResponse.json();
      setCurrentStep(stepData.step);
    } catch (error) {
      console.error('Failed to initialize setup:', error);
      setErrors([{ field: 'general', message: 'Failed to initialize setup wizard' }]);
    } finally {
      setLoading(false);
    }
  };

  const loadStep = async (stepId: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/setup-wizard/step/${stepId}`);
      const data = await response.json();
      setCurrentStep(data.step);
      setErrors([]);
    } catch (error) {
      console.error('Failed to load step:', error);
      setErrors([{ field: 'general', message: 'Failed to load step' }]);
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    if (!currentStep) return;

    const currentValues = stepValues[currentStep.id] || {};
    setStepValues({
      ...stepValues,
      [currentStep.id]: {
        ...currentValues,
        [fieldName]: value,
      },
    });
  };

  const handleNextStep = async () => {
    if (!currentStep || !configId) return;

    try {
      setSubmitting(true);
      const currentValues = stepValues[currentStep.id] || {};

      const response = await fetch(
        `${apiBaseUrl}/api/setup-wizard/${configId}/step/${currentStep.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentValues),
        }
      );

      const data = await response.json();

      if (!data.valid) {
        setErrors(data.errors || []);
        return;
      }

      setCompletedSteps([...completedSteps, currentStep.id]);
      setErrors([]);

      if (data.nextStep) {
        await loadStep(data.nextStep);
        setCurrentStep((prev) => prev && { ...prev, id: data.nextStep });
      } else {
        // Setup complete
        if (onComplete) onComplete(configId);
      }
    } catch (error) {
      console.error('Failed to submit step:', error);
      setErrors([{ field: 'general', message: 'Failed to submit step' }]);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviousStep = async () => {
    if (!currentStep) return;

    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/setup-wizard/step/${currentStep.id}`);
      const data = await response.json();

      if (data.navigation.previous) {
        await loadStep(data.navigation.previous);
        setCurrentStep((prev) => prev && { ...prev, id: data.navigation.previous });
        setCompletedSteps(completedSteps.filter((s) => s !== currentStep.id));
      }
    } catch (error) {
      console.error('Failed to load previous step:', error);
      setErrors([{ field: 'general', message: 'Failed to load previous step' }]);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !currentStep) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Initializing Setup</h2>
          <p className="text-gray-600 mt-2">Please wait while we prepare the wizard...</p>
        </div>
      </div>
    );
  }

  if (!currentStep) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Setup Failed</h2>
          <p className="text-gray-600 mt-2">Unable to load the setup wizard. Please try again.</p>
        </div>
      </div>
    );
  }

  const currentValues = stepValues[currentStep.id] || {};
  const currentOrder = currentStep.order || 1;
  const progressPercentage = (completedSteps.length / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src="/crmt-icon-512.png"
              alt="CRMT Logo"
              className="w-16 h-16 rounded-lg shadow-lg"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Setup Wizard</h1>
          <p className="text-gray-600 mt-2">
            Step {currentOrder} of {totalSteps}: {currentStep.title}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8 bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-sm font-medium text-gray-700">
              Progress: {progressPercentage.toFixed(0)}%
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Main Form */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Step Info */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{currentStep.title}</h2>
            <p className="text-gray-600 mt-2">{currentStep.description}</p>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded">
              {errors.map((error, idx) => (
                <p key={idx} className="text-red-700 text-sm mb-1">
                  <strong>{error.field}:</strong> {error.message}
                </p>
              ))}
            </div>
          )}

          {/* Form Fields */}
          <form className="space-y-6">
            {currentStep.fields
              .filter((field) => !field.conditional || field.conditional(currentValues))
              .map((field) => (
                <div key={field.name}>
                  {field.type === 'checkbox' ? (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentValues[field.name] || false}
                        onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 font-medium">{field.label}</span>
                    </label>
                  ) : field.type === 'select' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        value={currentValues[field.name] || ''}
                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="">Select {field.label}</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : field.type === 'textarea' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        value={currentValues[field.name] || ''}
                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        rows={4}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type={field.type}
                        value={currentValues[field.name] || ''}
                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  )}
                </div>
              ))}
          </form>

          {/* Navigation Buttons */}
          <div className="mt-8 flex justify-between gap-4">
            <button
              onClick={handlePreviousStep}
              disabled={currentOrder === 1 || submitting}
              className="flex items-center gap-2 px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <button
              onClick={handleNextStep}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : currentOrder === totalSteps ? (
                <>
                  <Check className="w-4 h-4" />
                  Complete
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="mt-8 flex justify-center gap-2 flex-wrap">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`w-3 h-3 rounded-full transition-all ${
                idx < currentOrder - 1
                  ? 'bg-green-500'
                  : idx === currentOrder - 1
                    ? 'bg-indigo-600'
                    : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
