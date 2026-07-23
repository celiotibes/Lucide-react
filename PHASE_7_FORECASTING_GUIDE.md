# Phase 7: Forecasting Guide

**Comprehensive guide to trend forecasting, confidence intervals, and forecast interpretation in the Lucide React BI Dashboard.**

---

## Overview

Forecasting predicts future data points based on historical trends. The Phase 7 implementation provides two complementary methods:

1. **Linear Regression**: Best for consistent trends
2. **Exponential Smoothing**: Best for responsive, weighted predictions
3. **Auto Method**: Automatically selects based on data characteristics

---

## Method 1: Linear Regression Forecasting

### Concept

Linear regression fits a straight line to historical data and projects it forward.

**Formula:**
```
y = mx + b

where:
- y = predicted value
- m = slope (trend direction and strength)
- x = time period
- b = y-intercept (baseline value)
```

### Characteristics

- **Best for**: Consistent, monotonic trends
- **Accuracy**: Excellent when data follows linear pattern
- **Responsiveness**: Captures long-term trend well
- **Sensitivity**: May lag real-time changes

### Advantages
- ✅ Simple and interpretable
- ✅ Excellent for steady trends
- ✅ Captures long-term direction
- ✅ Low computational cost
- ✅ Well-established statistical method

### Disadvantages
- ❌ Poor with non-linear patterns
- ❌ May miss recent accelerations
- ❌ Oversimplifies complex trends
- ❌ Can extrapolate unrealistically

### When to Use
- Consistent upward/downward trends
- Long-term forecasting
- Trend analysis over noise
- When simplicity is important

### Example Results

```
Data: Revenue over 30 days
Pattern: Steady 0.5% daily growth

Linear Regression Results:
Slope: 1,200 (R$ 1,200 increase per day)
Intercept: 247,200
R² Score: 0.92 (92% variance explained)

7-Day Forecast:
Day 1 (Jul 24): R$ 248,400 (projected)
Day 2 (Jul 25): R$ 249,600
Day 3 (Jul 26): R$ 250,800
...
Day 7 (Jul 30): R$ 255,000

Interpretation:
- Strong linear trend detected
- Model explains 92% of variance
- Expects ~R$ 1,200/day consistent growth
- Forecast confidence: High (0.88)
```

### Configuration

```typescript
import { useForecastingEngine } from '@/hooks';

const { forecast } = useForecastingEngine(timeSeriesData, {
  periods: 7,           // Forecast 7 days ahead
  method: 'linear',     // Use linear regression
  enabled: true
});
```

---

## Method 2: Exponential Smoothing Forecasting

### Concept

Exponential smoothing assigns higher weights to recent data points, making it responsive to changes.

**Formula:**
```
Forecast[t+1] = α × Value[t] + (1-α) × Forecast[t]

where:
- α = smoothing coefficient (0 to 1)
- Higher α = more weight to recent data
- Lower α = more weight to historical average
```

### Characteristics

- **Best for**: Data with recent changes and trends
- **Accuracy**: Excellent at following recent patterns
- **Responsiveness**: Quickly adapts to changes
- **Sensitivity**: Very responsive to recent data

### Advantages
- ✅ Responsive to recent changes
- ✅ Adapts to trend shifts
- ✅ Good with non-linear data
- ✅ Captures momentum well
- ✅ Naturally handles decay

### Disadvantages
- ❌ May overreact to noise
- ❌ Overshoots on sudden spikes
- ❌ Less good at steady-state prediction
- ❌ Requires tuning of α parameter

### When to Use
- Data with recent trends
- Responsive forecasting needed
- Non-linear patterns present
- Shorter-term predictions
- When quick adaptation needed

### Example Results

```
Data: Revenue over 30 days
Pattern: Variable with recent uptick

Exponential Smoothing Results:
Alpha (α): 0.3 (auto-selected)
Recent Trend: +2.5% (accelerating)
Momentum: Positive

7-Day Forecast:
Day 1 (Jul 24): R$ 252,100 (responsive to recent gains)
Day 2 (Jul 25): R$ 254,300
Day 3 (Jul 26): R$ 255,800
...
Day 7 (Jul 30): R$ 259,200

Interpretation:
- Model detected recent acceleration
- Forecast reflects recent momentum
- Predicts continuation of trend
- Forecast confidence: Medium (0.75)
```

### Configuration

```typescript
const { forecast } = useForecastingEngine(timeSeriesData, {
  periods: 7,
  method: 'exponential',
  alpha: 0.3,           // Smoothing coefficient
  enabled: true
});

// Alpha guidance:
// 0.1-0.2: Very smooth, stable
// 0.3-0.4: Balanced (default)
// 0.5-0.7: Responsive
// 0.8-0.9: Very responsive to recent changes
```

---

## Method 3: Auto Method Selection

### Concept

Analyzes data characteristics and automatically selects the best forecasting method.

**Selection Logic:**
```
if (trend_strength > 0.6) {
  use Linear Regression  // Strong consistent trend
} else if (recent_acceleration > 0.03) {
  use Exponential Smoothing  // Recent momentum
} else if (volatility > 0.3) {
  use Exponential Smoothing  // Variable data
} else {
  use Linear Regression  // Stable or weak trend
}
```

### Advantages
- ✅ **RECOMMENDED FOR PRODUCTION**
- ✅ Adapts to data characteristics
- ✅ Best performance on unknown data
- ✅ No tuning required
- ✅ Handles mixed patterns

### When to Use
- **RECOMMENDED FOR PRODUCTION DASHBOARDS**
- Unknown data patterns
- Mixed data types
- When accuracy is paramount
- Dashboard analytics systems

### Configuration

```typescript
// Auto method (recommended)
const { forecast } = useForecastingEngine(timeSeriesData, {
  periods: 7,
  method: 'auto',       // Automatically select best method
  enabled: true
});

// Returns which method was selected:
// forecast.metadata.method === 'linear' or 'exponential'
```

---

## Confidence Intervals

### Concept

Confidence intervals provide bounds around predictions, indicating forecast uncertainty.

**95% Confidence Interval:**
```
Prediction ± (1.96 × Standard Error)

Meaning: 95% probability the actual value falls within bounds
```

### Visualization

```
Upper Bound (95% CI):    ----+----
                           /    \
Predicted Value:      ----/------\----
                     /            \
Lower Bound (95% CI): ----+----

Confidence Band Width:
- Narrow = high confidence (low uncertainty)
- Wide = low confidence (high uncertainty)
```

### Example

```
7-Day Forecast with 95% Confidence Intervals:

Day 1: Predicted R$ 252,300
       Lower R$ 240,100 (95%)
       Upper R$ 264,500
       Band: R$ 24,400 (±4.8%)

Day 7: Predicted R$ 259,800
       Lower R$ 239,900 (95%)
       Upper R$ 279,700
       Band: R$ 39,800 (±7.7%)

Interpretation:
- Early forecasts have narrow confidence (high confidence)
- Later forecasts have wider confidence (increasing uncertainty)
- Band expands as forecasting further ahead
```

### Confidence Calculation

```typescript
// Confidence interval metadata
forecast[0] = {
  date: new Date('2026-07-24'),
  predicted: 252300,
  lower: 240100,        // 95% lower bound
  upper: 264500,        // 95% upper bound
  confidence: 0.95,     // 95% confidence level
  rmse: 1250            // Root mean square error
};
```

---

## Forecast Metrics

### Trend Strength (0 to 1)

**Measure of how strong the underlying trend is.**

```
Trend Strength Interpretation:
0.0-0.2: No clear trend (random/noise)
0.2-0.4: Weak trend (variable behavior)
0.4-0.6: Moderate trend (some direction)
0.6-0.8: Strong trend (clear direction)
0.8-1.0: Very strong trend (dominant pattern)
```

**Example:**
```
Steadily increasing revenue: 0.92 (very strong)
Variable revenue with slight growth: 0.45 (moderate)
Random revenue fluctuations: 0.15 (weak)
```

### Volatility (0 to 1)

**Measure of data variability around the trend.**

```
Volatility Interpretation:
0.0-0.1: Very stable (low variance)
0.1-0.2: Stable (predictable variation)
0.2-0.4: Moderate (normal business variation)
0.4-0.6: High (significant fluctuation)
0.6+:    Very high (unstable/unreliable)
```

**Example:**
```
Stable revenue pattern: 0.08 (very stable)
Normal business variation: 0.25 (moderate)
Volatile market conditions: 0.55 (high)
Chaotic data pattern: 0.78 (very high)
```

### RMSE (Root Mean Square Error)

**Measure of forecast accuracy - how far predictions were from actuals in training.**

```
Lower RMSE = More accurate historical fit
RMSE of 1,250 on data averaging 250,000 = 0.5% error
```

**Interpretation:**
```
Typical forecast error ≈ RMSE value
95% of errors fall within ±2 × RMSE
```

---

## Forecast Reliability

### Reliability Assessment

The system provides a `isReliable` boolean indicating forecast quality:

**Reliable (true) when:**
- ✅ Trend strength ≥ 0.4
- ✅ Volatility ≤ 0.4
- ✅ Sufficient data points (≥10)
- ✅ RMSE acceptable relative to mean
- ✅ No extreme anomalies in training data

**Unreliable (false) when:**
- ❌ Trend strength < 0.4 (no clear pattern)
- ❌ Volatility > 0.4 (too variable)
- ❌ Insufficient data (<10 points)
- ❌ Anomalies detected in training data
- ❌ Recent trend shift detected

### Example

```
Reliable Forecast Example:
- Trend Strength: 0.78 (strong) ✓
- Volatility: 0.18 (low) ✓
- Data Points: 30 ✓
- Anomalies: None ✓
- isReliable: TRUE → Display with confidence

Unreliable Forecast Example:
- Trend Strength: 0.32 (weak) ✗
- Volatility: 0.62 (high) ✗
- Data Points: 5 ✗
- Anomalies: 2 detected ✗
- isReliable: FALSE → Display with caution warning
```

---

## Using the useForecastingEngine Hook

### Basic Usage

```typescript
import { useForecastingEngine } from '@/hooks';

export function MyComponent() {
  const timeSeriesData = [
    { date: new Date('2026-07-01'), value: 248000 },
    { date: new Date('2026-07-02'), value: 251000 },
    // ... 30 days of data
  ];

  const { 
    forecast, 
    metrics, 
    isReliable, 
    isLoading, 
    error 
  } = useForecastingEngine(timeSeriesData, {
    periods: 7,
    method: 'auto',
    enabled: true
  });

  if (isLoading) return <div>Forecasting...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>7-Day Forecast {isReliable ? '✓' : '⚠'}</h3>
      <p>Reliability: {isReliable ? 'High' : 'Low'}</p>
      <p>Trend Strength: {(metrics.trendStrength * 100).toFixed(1)}%</p>
      <p>Volatility: {(metrics.volatility * 100).toFixed(1)}%</p>

      {forecast.map((point, idx) => (
        <div key={idx}>
          <p>{point.date.toLocaleDateString('pt-BR')}</p>
          <p>Predicted: R$ {point.predicted.toLocaleString('pt-BR')}</p>
          <p>Range: R$ {point.lower.toLocaleString('pt-BR')} - R$ {point.upper.toLocaleString('pt-BR')}</p>
          <p>Confidence: {(point.confidence * 100).toFixed(0)}%</p>
        </div>
      ))}
    </div>
  );
}
```

### Advanced Configuration

```typescript
// For consistent trends
const { forecast: steadyForecast } = useForecastingEngine(data, {
  periods: 14,           // Longer forecast
  method: 'linear',      // Linear for steady state
  enabled: true
});

// For variable data
const { forecast: adaptiveForecast } = useForecastingEngine(data, {
  periods: 7,            // Shorter forecast
  method: 'exponential', // Exponential for volatility
  alpha: 0.4,            // Slightly responsive
  enabled: true
});

// For production dashboards (recommended)
const { forecast: productionForecast } = useForecastingEngine(data, {
  periods: 7,
  method: 'auto',        // Auto-select
  enabled: true          // Will only forecast if reliable
});
```

---

## Interpreting Forecast Charts

### Chart Components

**ForecastChart displays:**
- Blue line: Actual historical data
- Green dashed line: Predicted values
- Green shaded area: 95% confidence interval
- X-axis: Time (dates)
- Y-axis: Values (in currency)

### Reading the Chart

```
Chart: Revenue Forecast

250k │     actual ____
240k │    ╱_____╲  
230k │___╱       \___        ← Confidence band widens
220k │     │ predicted  │
210k │     └──────────┘
     └─────────────────────
     Jun 24  Jul 01  Jul 08
            (historical)  (forecast)
```

### Pattern Interpretation

**Upward Trend:**
```
Chart shows: Predicted line going up
Interpretation: Revenue expected to increase
Action: Monitor for opportunity to capitalize
```

**Downward Trend:**
```
Chart shows: Predicted line going down
Interpretation: Revenue expected to decrease
Action: Investigate potential issues
```

**Flat Forecast:**
```
Chart shows: Predicted line stays flat
Interpretation: Revenue expected to stabilize
Action: Continue current strategy
```

**Wide Confidence Band:**
```
Chart shows: Green band is wide
Interpretation: High uncertainty
Caution: Don't rely solely on point forecast
Recommendation: Prepare for multiple scenarios
```

---

## Forecast Scenarios

### Scenario 1: Strong Uptrend

```
Data: 30-day revenue showing 2% daily growth
Metrics: Trend=0.88, Volatility=0.12, isReliable=TRUE

Forecast:
- 7-day prediction: 12% growth
- Method selected: Linear regression
- Confidence: 95%, narrow bands
- RMSE: 1,200

Recommendation:
- High confidence in growth prediction
- Plan for increased capacity
- Consider acceleration strategies
```

### Scenario 2: High Volatility

```
Data: 30-day revenue with ±8% swings
Metrics: Trend=0.35, Volatility=0.52, isReliable=FALSE

Forecast:
- 7-day prediction: ±3% variation
- Method selected: Exponential smoothing
- Confidence: 60%, wide bands
- RMSE: 4,500

Recommendation:
- Lower confidence due to variability
- Plan for multiple scenarios
- Increase safety margin
- Wait for pattern stabilization
```

### Scenario 3: Recent Acceleration

```
Data: Last 10 days show acceleration
Metrics: Trend=0.65, Volatility=0.22, isReliable=TRUE

Forecast:
- 7-day prediction: 8% growth (accelerating)
- Method selected: Exponential smoothing
- Confidence: 85%, moderate bands
- RMSE: 2,100

Recommendation:
- Good confidence in near-term trend
- Monitor for continued acceleration
- Be ready to adjust strategy
- Watch for sustainability
```

### Scenario 4: Data Too Short

```
Data: Only 5 days of data
Metrics: Trend=undefined, Volatility=undefined, isReliable=FALSE

Forecast:
- 7-day prediction: Not generated
- Reason: Insufficient data
- Minimum required: 10 data points

Recommendation:
- Collect more historical data
- Return when 10+ data points available
- Consider manual forecasting in interim
```

---

## Best Practices

### 1. Minimum Data Requirements
```typescript
// Always check data length
if (timeSeriesData.length < 10) {
  // Don't display forecast
  return <p>Insufficient data (need 10+ points)</p>;
}
```

### 2. Check Reliability Before Acting
```typescript
if (!isReliable) {
  // Show warning to user
  <AlertBanner 
    severity="warning"
    message="Forecast reliability is low. Use with caution."
  />
}
```

### 3. Use Confidence Intervals
```typescript
// Don't just show predicted value
// Show: Predicted ± Confidence bands
<p>Forecast: {predicted} (range: {lower}-{upper})</p>
```

### 4. Monitor Forecast Accuracy
```typescript
// Track actual vs predicted
const forecastAccuracy = Math.abs(actual - predicted) / predicted;
if (forecastAccuracy > 0.10) {
  // 10%+ error, review forecast
}
```

### 5. Adjust Forecasting Frequency
```typescript
// Re-forecast regularly with new data
// Daily updates for responsive systems
// Weekly updates for stable trends
useEffect(() => {
  const interval = setInterval(() => {
    // Recalculate forecast with updated data
  }, 24 * 60 * 60 * 1000); // Daily
  return () => clearInterval(interval);
}, [timeSeriesData]);
```

---

## Troubleshooting

### Issue: Forecast seems unrealistic

**Check 1: Data quality**
```typescript
// Verify data has no anomalies
if (anomalies.length > 5) {
  // Too many anomalies, data quality issue
}
```

**Check 2: Confidence intervals**
```typescript
// Wide bands = high uncertainty
const confidence = Math.abs(upper - lower) / predicted;
if (confidence > 0.2) {
  // >20% uncertainty, low confidence
}
```

**Check 3: Trend strength**
```typescript
// Weak trend = unreliable forecast
if (trendStrength < 0.4) {
  // No clear trend, forecast unreliable
}
```

### Issue: Forecast keeps changing significantly

**Possible cause:** Recent anomalies in data
**Solution:** Wait for pattern stabilization

**Possible cause:** High volatility
**Solution:** Use exponential smoothing (more stable)

### Issue: Forecast misses direction changes

**Possible cause:** Not enough recent data weight
**Solution:** Use exponential smoothing with higher α

**Possible cause:** Trend actually changed
**Solution:** Forecast based on new trend, not old data

---

## Production Deployment

### Recommended Configuration

```typescript
export const FORECAST_CONFIG = {
  periods: 7,           // 7-day forecast
  method: 'auto' as const,  // Auto-select best method
  alpha: 0.3,          // Standard smoothing
  enabled: true,
  minDataPoints: 10,   // Require 10+ points
  confidenceLevel: 0.95,
  displayReliabilityBadge: true
};

// Usage
const { forecast, isReliable, metrics } = useForecastingEngine(
  timeSeriesData,
  FORECAST_CONFIG
);
```

### Error Handling

```typescript
// Only display if reliable
{isReliable && (
  <ForecastChart 
    forecast={forecast}
    actualData={timeSeriesData}
    showConfidence={true}
  />
)}

// Show warning if unreliable
{!isReliable && timeSeriesData.length >= 10 && (
  <AlertBanner severity="warning">
    Forecast reliability is low due to high volatility.
    Use only for planning scenarios.
  </AlertBanner>
)}

// Show error if insufficient data
{timeSeriesData.length < 10 && (
  <AlertBanner severity="info">
    Need {10 - timeSeriesData.length} more data points
    to generate forecast.
  </AlertBanner>
)}
```

---

## Conclusion

The Phase 7 forecasting system provides production-ready trend prediction through intelligent method selection. Start with the "auto" method, monitor forecast accuracy, and adjust based on business needs.

**Recommended Starting Configuration:**
```typescript
{
  periods: 7,
  method: 'auto',
  enabled: true
}
```

This provides the best balance of accuracy and responsiveness for most real-world scenarios.

**Key Takeaway:** Use forecasts for planning and scenarios, not as certainties. Always consider confidence intervals and reliability status.
