/**
 * App Error Boundary - Phase 22.9
 * Catches unhandled errors in the entire application
 */

import React, { ErrorInfo, ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { logger } from '@/utils/logger';
import { ErrorHandler } from '@/utils/errorHandler';
import { ERROR_CODES } from '@/constants/errors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error info
    this.setState({ errorInfo });

    // Log error details
    logger.fatal('App Error Boundary triggered', error, 'AppErrorBoundary');

    const errorContext = ErrorHandler.classifyError(error, 'AppErrorBoundary');
    logger.error(
      'Detailed error information',
      {
        category: errorContext.category,
        code: errorContext.code,
        componentStack: errorInfo.componentStack,
      },
      'AppErrorBoundary'
    );

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Send error report (in production)
    if (!__DEV__) {
      this.reportError(error, errorInfo);
    }
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // Send to error tracking service (Sentry, etc.)
    const report = ErrorHandler.createErrorReport(error, 'App', 'AppErrorBoundary');
    report.componentStack = errorInfo.componentStack;
    logger.debug('Error report created', report, 'AppErrorBoundary');
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Oops! Algo deu errado</Text>
              <Text style={styles.headerSubtitle}>
                Um erro inesperado ocorreu. Estamos trabalhando para corrigi-lo.
              </Text>
            </View>

            {/* Error Details (Dev Mode Only) */}
            {__DEV__ && (
              <View style={styles.detailsSection}>
                <Text style={styles.sectionTitle}>Detalhes do Erro</Text>

                {this.state.error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorName}>{this.state.error.name}</Text>
                    <Text style={styles.errorMessage}>{this.state.error.message}</Text>
                  </View>
                )}

                {this.state.error?.stack && (
                  <View style={styles.stackTraceBox}>
                    <Text style={styles.stackTraceTitle}>Stack Trace:</Text>
                    <Text style={styles.stackTrace}>
                      {this.state.error.stack}
                    </Text>
                  </View>
                )}

                {this.state.errorInfo?.componentStack && (
                  <View style={styles.componentStackBox}>
                    <Text style={styles.stackTraceTitle}>Component Stack:</Text>
                    <Text style={styles.componentStack}>
                      {this.state.errorInfo.componentStack}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={this.handleReset}
              >
                <Text style={styles.primaryButtonText}>Tentar Novamente</Text>
              </TouchableOpacity>

              {__DEV__ && (
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={() => {
                    logger.printSummary();
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Ver Logs</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 24,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  detailsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  errorBox: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#d32f2f',
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
  errorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d32f2f',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  stackTraceBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
  componentStackBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
  stackTraceTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  stackTrace: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  componentStack: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'column',
    gap: 12,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#1976d2',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  secondaryButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
  },
});
