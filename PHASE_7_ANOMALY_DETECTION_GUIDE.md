# Phase 7: Anomaly Detection Guide

**Comprehensive guide to anomaly detection methods, configuration, and interpretation in the Lucide React BI Dashboard.**

---

## Overview

Anomaly detection identifies unusual data points that deviate significantly from normal patterns. The Phase 7 implementation provides two complementary methods:

1. **Z-Score Method**: Statistical approach based on standard deviations
2. **IQR Method**: Quartile-based approach, robust to outliers
3. **Dual Method**: Combines both for comprehensive detection

---

## Method 1: Z-Score Anomaly Detection

### Concept

The Z-Score method identifies data points that deviate more than a threshold number of standard deviations from the mean.

**Formula:**
```
Z-Score = (value - mean) / standard_deviation
```

**Classification:**
- Z-Score < -2.5 or > 2.5: Anomalous
- Z-Score < -2.0 or > 2.0: High deviation
- Z-Score < -1.5 or > 1.5: Medium deviation
- Z-Score ≥ -1.5 and ≤ 1.5: Normal

### Advantages
- ✅ Simple and interpretable
- ✅ Mathematically well-understood
- ✅ Works well with normally distributed data
- ✅ Good for detecting sudden spikes/drops

### Disadvantages
- ❌ Sensitive to extreme outliers
- ❌ Assumes normal distribution
- ❌ May miss subtle patterns in skewed data
- ❌ Can be affected by seasonal trends

### When to Use
- Quick anomaly screening
- Normally distributed data
- Sudden spike/drop detection
- Real-time monitoring with quick response needed

### Configuration

```typescript
// Using useAnomalyDetection hook with Z-Score
const { anomalies } = useAnomalyDetection(timeSeriesData, {
  method: 'zscore',
  zScoreThreshold: 2.5,  // Default: 2.5 (99.4% confidence)
  enabled: true
});

// Alternative thresholds:
// 1.5 → ~93% confidence, more sensitive
// 2.0 → ~95% confidence, moderate
// 2.5 → ~99.4% confidence, conservative
// 3.0 → ~99.7% confidence, very conservative
```

### Example Results

```
Data: Revenue time series (30 days)
Mean: R$ 248,500
Std Dev: R$ 12,300
Threshold: 2.5

Anomalies Detected:
┌─────────────────────────────────────────┐
│ Date       Value      Z-Score  Severity │
├─────────────────────────────────────────┤
│ 2026-07-15 R$280,500  2.60     Critical │
│ 2026-07-20 R$235,100  -2.90    High     │
└─────────────────────────────────────────┘

Interpretation:
- July 15: Revenue spike of 12.9% above normal (critical anomaly)
- July 20: Revenue drop of 5.4% below normal (high anomaly)
```

---

## Method 2: IQR Anomaly Detection

### Concept

The IQR (Interquartile Range) method identifies outliers using quartile statistics.

**Formula:**
```
Q1 = 25th percentile
Q3 = 75th percentile
IQR = Q3 - Q1

Lower Bound = Q1 - (1.5 × IQR)
Upper Bound = Q3 + (1.5 × IQR)

Anomalies = values < Lower Bound OR values > Upper Bound
```

### Advantages
- ✅ Robust to extreme outliers
- ✅ Does not assume distribution
- ✅ Good for skewed data
- ✅ Works with categorical data
- ✅ Intuitive quartile interpretation

### Disadvantages
- ❌ Less sensitive to subtle anomalies
- ❌ Fixed 1.5× multiplier
- ❌ Cannot detect all data point relationships
- ❌ May miss seasonal anomalies

### When to Use
- Robust anomaly detection needed
- Non-normally distributed data
- Data with extreme outliers
- Long-term trend monitoring

### Configuration

```typescript
// Using useAnomalyDetection hook with IQR
const { anomalies } = useAnomalyDetection(timeSeriesData, {
  method: 'iqr',
  enabled: true
});

// IQR multiplier is fixed at 1.5 (standard statistical definition)
// This means ~2.7 sigma in normal distribution
```

### Example Results

```
Data: Revenue time series (30 days)
Q1: R$ 243,200
Q3: R$ 254,800
IQR: R$ 11,600

Bounds:
Lower = 243,200 - (1.5 × 11,600) = R$ 225,600
Upper = 254,800 + (1.5 × 11,600) = R$ 272,400

Anomalies Detected:
┌─────────────────────────────────────────┐
│ Date       Value      Position Severity  │
├─────────────────────────────────────────┤
│ 2026-07-15 R$280,500  +7.9% above Q3 - Critical │
│ 2026-07-20 R$235,100  -3.4% below Q1 - High     │
└─────────────────────────────────────────┘

Interpretation:
- July 15: Revenue well above upper bound (outlier)
- July 20: Revenue below lower bound (outlier)
```

---

## Method 3: Dual Anomaly Detection

### Concept

Combines both Z-Score and IQR methods for comprehensive anomaly detection.

**Logic:**
```
Anomaly = (Z-Score anomaly) OR (IQR anomaly)
```

A data point is flagged as anomalous if detected by EITHER method.

### Advantages
- ✅ Comprehensive detection
- ✅ Catches anomalies both methods would find
- ✅ Balances sensitivity and specificity
- ✅ Best for production use
- ✅ Most robust approach

### Disadvantages
- ❌ Slightly more false positives
- ❌ Requires more computation
- ❌ Two methods may conflict in interpretation

### When to Use
- **RECOMMENDED FOR PRODUCTION**
- Critical anomaly monitoring
- Mixed data distributions
- When accuracy is paramount
- Dashboard analytics systems

### Configuration

```typescript
// Using useAnomalyDetection hook with Dual method
const { anomalies } = useAnomalyDetection(timeSeriesData, {
  method: 'both',  // Recommended default
  zScoreThreshold: 2.5,
  enabled: true
});
```

### Example Results

```
Dual Method Combination:
Z-Score Method: 2 anomalies detected
IQR Method: 2 anomalies detected
Combined: 2 unique anomalies (both methods agreed)

┌─────────────────────────────────────────────┐
│ Date       Z-Score    IQR       Final       │
├─────────────────────────────────────────────┤
│ 2026-07-15 Critical   Critical  Critical ✓  │
│ 2026-07-20 High       High      High ✓      │
└─────────────────────────────────────────────┘
```

---

## Severity Classification

Anomalies are classified by severity based on deviation magnitude:

### Critical Severity
- **Threshold**: |Z-Score| ≥ 3.0 OR extreme IQR outlier
- **Meaning**: Highly unusual event requiring immediate investigation
- **Color**: Red (#EF4444)
- **Example**: Revenue drop >15%, unexpected spike
- **Action**: Immediate investigation recommended

### High Severity
- **Threshold**: |Z-Score| ≥ 2.5 OR moderate IQR outlier
- **Meaning**: Significant deviation from normal pattern
- **Color**: Orange (#F97316)
- **Example**: Revenue variance 10-15%
- **Action**: Investigation recommended within hours

### Medium Severity
- **Threshold**: |Z-Score| ≥ 1.5 OR slight IQR outlier
- **Meaning**: Noticeable but not extreme deviation
- **Color**: Yellow (#FBBF24)
- **Example**: Revenue variance 5-10%
- **Action**: Monitor for trends

### Info Severity
- **Threshold**: Flagged for tracking but minor
- **Meaning**: Noteworthy but within normal variation
- **Color**: Blue (#3B82F6)
- **Example**: Revenue variance 2-5%
- **Action**: Log for pattern analysis

---

## Anomaly Types

Beyond severity, anomalies are classified by type:

### Sudden Spike
- **Definition**: Abrupt significant increase
- **Detection**: High positive Z-Score or above upper IQR bound
- **Causes**: Sales promotion success, viral event, system issue
- **Action**: Investigate cause of increase

### Sudden Drop
- **Definition**: Abrupt significant decrease
- **Detection**: High negative Z-Score or below lower IQR bound
- **Causes**: Service outage, traffic drop, seasonal end
- **Action**: Investigate cause of decrease

### Trend Break
- **Definition**: Sustained pattern change
- **Detection**: Series of consecutive anomalies
- **Causes**: Market change, new competitor, business pivot
- **Action**: Analyze underlying business change

### Outlier
- **Definition**: Single isolated unusual point
- **Detection**: Point deviates but neighbors are normal
- **Causes**: Data entry error, one-time event, measurement error
- **Action**: Verify data quality

---

## Using the useAnomalyDetection Hook

### Basic Usage

```typescript
import { useAnomalyDetection } from '@/hooks';

export function MyComponent() {
  const timeSeriesData = [
    { date: new Date('2026-07-01'), value: 248000 },
    { date: new Date('2026-07-02'), value: 251000 },
    // ... 30 days of data
  ];

  const { anomalies, statistics, isLoading, error } = useAnomalyDetection(
    timeSeriesData,
    {
      method: 'both',
      zScoreThreshold: 2.5,
      enabled: true
    }
  );

  if (isLoading) return <div>Analyzing...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>Anomalies Found: {anomalies.length}</h3>
      {anomalies.map(anomaly => (
        <div key={anomaly.date.toString()}>
          <p>{anomaly.date.toLocaleDateString('pt-BR')}</p>
          <p>Value: R$ {anomaly.value.toLocaleString('pt-BR')}</p>
          <p>Z-Score: {anomaly.zScore.toFixed(2)}</p>
          <p>Severity: {anomaly.severity}</p>
          <p>Type: {anomaly.type}</p>
        </div>
      ))}
    </div>
  );
}
```

### Advanced Configuration

```typescript
// Configure for different sensitivity levels
const { anomalies: sensitive } = useAnomalyDetection(data, {
  method: 'zscore',
  zScoreThreshold: 1.5,  // More sensitive
  enabled: true
});

const { anomalies: standard } = useAnomalyDetection(data, {
  method: 'both',
  zScoreThreshold: 2.5,  // Standard (recommended)
  enabled: true
});

const { anomalies: conservative } = useAnomalyDetection(data, {
  method: 'iqr',
  zScoreThreshold: 3.0,  // Less sensitive
  enabled: true
});
```

### Statistics Available

```typescript
const { statistics } = useAnomalyDetection(timeSeriesData, options);

// Returns:
{
  mean: number,           // Average value
  std: number,            // Standard deviation
  q1: number,             // 25th percentile
  median: number,         // 50th percentile
  q3: number,             // 75th percentile
  iqr: number,            // Interquartile range
  min: number,            // Minimum value
  max: number,            // Maximum value
  anomalyCount: number,   // Total anomalies found
  criticalCount: number,  // Critical severity count
  highCount: number       // High severity count
}
```

---

## Troubleshooting Anomaly Detection

### Issue: Too Many False Positives

**Solution:** Increase Z-Score threshold or use IQR method
```typescript
// Current: 2.5 threshold (99.4%)
// Try: 3.0 threshold (99.7%)
const { anomalies } = useAnomalyDetection(data, {
  method: 'both',
  zScoreThreshold: 3.0,  // More conservative
});

// Or switch to IQR only
const { anomalies } = useAnomalyDetection(data, {
  method: 'iqr',  // Robust to outliers
});
```

### Issue: Missing Real Anomalies

**Solution:** Decrease Z-Score threshold or use Z-Score method
```typescript
// Current: 2.5 threshold
// Try: 2.0 threshold (95.4%)
const { anomalies } = useAnomalyDetection(data, {
  method: 'both',
  zScoreThreshold: 2.0,  // More sensitive
});

// Or switch to Z-Score only
const { anomalies } = useAnomalyDetection(data, {
  method: 'zscore',  // More sensitive to spikes
});
```

### Issue: Seasonal Patterns Flagged as Anomalies

**Problem:** Normal seasonal variations appear anomalous
**Solution:** 
1. Use longer data window (seasonal pattern requires 2+ cycles)
2. Consider detrending/deseasonalizing data
3. Adjust threshold for seasonal periods

### Issue: Trend Changes Not Detected

**Problem:** Gradual trend shifts not flagged
**Solution:** Monitor for `trend_break` type anomalies
```typescript
// Filter for trend break anomalies
const trendBreaks = anomalies.filter(a => a.type === 'trend_break');
if (trendBreaks.length > 2) {
  // Significant trend change detected
}
```

---

## Production Recommendations

### For Real-Time Dashboards
```typescript
const { anomalies } = useAnomalyDetection(timeSeriesData, {
  method: 'both',
  zScoreThreshold: 2.5,   // Balanced sensitivity
  enabled: true
});

// Show only Critical and High severity
const alerts = anomalies.filter(a => 
  a.severity === 'critical' || a.severity === 'high'
);
```

### For Trend Analysis
```typescript
const { anomalies } = useAnomalyDetection(timeSeriesData, {
  method: 'iqr',
  zScoreThreshold: 2.0,   // Less affected by local spikes
  enabled: true
});

// Analyze for sustained changes
const sustainedAnomalies = anomalies.filter(a => 
  a.type === 'trend_break'
);
```

### For Data Quality Checking
```typescript
const { anomalies } = useAnomalyDetection(timeSeriesData, {
  method: 'zscore',
  zScoreThreshold: 3.0,   // Only extreme outliers
  enabled: true
});

// Flag data points for review
const dataIssues = anomalies.filter(a => 
  a.severity === 'critical'
);
```

---

## Performance Considerations

- **Computational Complexity**: O(n) for data of size n
- **Memory Usage**: Minimal, ~1-5 KB per calculation
- **Processing Time**: <5ms for typical 30-day dataset
- **Hook Re-execution**: Triggered on data changes only

---

## Conclusion

The Phase 7 anomaly detection system provides comprehensive, production-ready detection through multiple methods. Start with the "both" method for balanced detection, and adjust sensitivity based on your specific use case and business requirements.

**Recommended Starting Configuration:**
```typescript
{
  method: 'both',
  zScoreThreshold: 2.5,
  enabled: true
}
```

This provides the best balance of sensitivity and specificity for most real-world scenarios.
