import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  cameraContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraPlaceholder: {
    flex: 1,
    width: '100%',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  captureButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  captureButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  previewContainer: {
    flex: 1,
  },
  imageWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  capturedImage: {
    width: '100%',
    height: 400,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  processingContainer: {
    padding: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
  },
  processingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  dataContainer: {
    padding: 16,
    borderRadius: 8,
    marginVertical: 16,
  },
  dataTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  dataItem: {
    fontSize: 14,
    marginVertical: 4,
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retakeButton: {
    backgroundColor: '#9ca3af',
  },
  processButton: {
    backgroundColor: '#10b981',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  lightTheme: {
    container: {
      backgroundColor: '#ffffff',
    },
    cameraPlaceholder: {
      backgroundColor: '#f9fafb',
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
    text: {
      color: '#1f2937',
    },
    errorContainer: {
      backgroundColor: '#fee2e2',
    },
    errorText: {
      color: '#991b1b',
    },
    processingContainer: {
      backgroundColor: '#f0f9ff',
    },
    processingText: {
      color: '#1e40af',
    },
    progressBar: {
      backgroundColor: '#dbeafe',
    },
    dataContainer: {
      backgroundColor: '#f9fafb',
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
  },
  darkTheme: {
    container: {
      backgroundColor: '#1f2937',
    },
    cameraPlaceholder: {
      backgroundColor: '#111827',
      borderWidth: 1,
      borderColor: '#374151',
    },
    text: {
      color: '#f3f4f6',
    },
    errorContainer: {
      backgroundColor: 'rgba(220, 38, 38, 0.1)',
    },
    errorText: {
      color: '#fca5a5',
    },
    processingContainer: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    processingText: {
      color: '#93c5fd',
    },
    progressBar: {
      backgroundColor: '#1e3a8a',
    },
    dataContainer: {
      backgroundColor: '#111827',
      borderWidth: 1,
      borderColor: '#374151',
    },
  },
});
