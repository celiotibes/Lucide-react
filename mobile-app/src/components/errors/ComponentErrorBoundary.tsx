/**
 * Component Error Boundary - Phase 22.9
 * Catches errors in individual components while keeping the rest of the app functional
 */

import React, { ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
  componentName?: string;
  fallback?: ReactNode | ((error: Error) => ReactNode);
  showError?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ComponentErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const componentName = this.props.componentName || 'Unknown Component';

    logger.warn(
      `Error in component: ${componentName}`,
      error,
      'ComponentErrorBoundary'
    );
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error!);
        }
        return this.props.fallback;
      }

      // Default fallback UI
      if (this.props.showError !== false) {
        return (
          <View style={styles.container}>
            <Text style={styles.message}>
              Erro ao carregar {this.props.componentName || 'componente'}
            </Text>
            {__DEV__ && this.state.error && (
              <Text style={styles.debugText}>{this.state.error.message}</Text>
            )}
          </View>
        );
      }

      // Silent error (no UI)
      return null;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  message: {
    fontSize: 13,
    color: '#856404',
    fontWeight: '500',
  },
  debugText: {
    fontSize: 11,
    color: '#856404',
    marginTop: 4,
    fontFamily: 'monospace',
  },
});
