# 📊 Fase 7: Advanced Analytics & Anomaly Detection - Planning

**Status**: 🔄 PLANNING (Pre-Implementation)  
**Date**: 2026-07-23  
**Target Duration**: 6-8 hours  
**Branch**: `claude/rental-listing-sync-k0rlwe`

---

## 🎯 Phase 7 Objectives

Implement advanced analytics capabilities with anomaly detection and trend forecasting:

1. **Anomaly Detection**
   - [ ] Statistical anomaly detection (Z-score, IQR method)
   - [ ] Machine learning-based detection (Isolation Forest)
   - [ ] Visual anomaly highlighting
   - [ ] Anomaly history tracking

2. **Trend Forecasting**
   - [ ] Linear regression forecasting
   - [ ] Exponential smoothing (Holt-Winters)
   - [ ] Prophet-style forecasting
   - [ ] Confidence intervals visualization

3. **Advanced Metrics**
   - [ ] Variance analysis
   - [ ] Trend strength calculation
   - [ ] Seasonality detection
   - [ ] Volatility metrics

4. **UI/UX Components**
   - [ ] AnomalyIndicator component
   - [ ] ForecastChart component
   - [ ] AlertBanner component
   - [ ] MetricsPanel component

---

## 📋 Implementation Plan

### Phase 7.1: Analytics Utilities (2-3 hours)

**File**: `frontend/src/utils/analyticsEngine.ts`

```typescript
// Anomaly Detection Algorithms
- calculateZScore(): number[]
- calculateIQR(): { Q1, Q3, IQR }
- detectAnomaliesZScore(threshold: number): AnomalyPoint[]
- detectAnomaliesIQR(): AnomalyPoint[]
- detectAnomaliesIsolationForest(): AnomalyPoint[]

// Trend Forecasting
- forecastLinear(data: number[], periods: number): Forecast
- forecastExponentialSmoothing(data: number[], periods: number): Forecast
- forecastHoltWinters(data: number[], periods: number, seasonality: number): Forecast
- calculateTrendStrength(data: number[]): number
- calculateVolatility(data: number[]): number

// Time Series Analysis
- detectSeasonality(data: number[]): SeasonalityInfo
- calculateVariance(data: number[]): number
- calculateAutoCorrelation(data: number[], lag: number): number
- calculateMovingAverage(data: number[], window: number): number[]
- calculateExponentialAverage(data: number[], alpha: number): number[]
```

### Phase 7.2: Hooks (1.5 hours)

**File**: `frontend/src/hooks/useAnomalyDetection.ts`

```typescript
export const useAnomalyDetection = (data: KPIData[], method: 'zscore' | 'iqr' | 'ml' = 'zscore') => {
  const anomalies = detectAnomalies(data, method);
  const statistics = calculateStatistics(data);
  const alerts = generateAlerts(anomalies);
  
  return { anomalies, statistics, alerts };
}
```

**File**: `frontend/src/hooks/useForecastingEngine.ts`

```typescript
export const useForecastingEngine = (
  data: KPIData[],
  periods: number = 7,
  method: 'linear' | 'exponential' | 'holt' = 'exponential'
) => {
  const forecast = generateForecast(data, periods, method);
  const confidence = calculateConfidenceInterval(forecast);
  const accuracy = assessAccuracy(forecast);
  
  return { forecast, confidence, accuracy };
}
```

### Phase 7.3: Components (1.5 hours)

**Files**:
- `frontend/src/components/modern/AnomalyIndicator.tsx`
- `frontend/src/components/modern/ForecastChart.tsx`
- `frontend/src/components/modern/AlertBanner.tsx`
- `frontend/src/components/modern/MetricsPanel.tsx`

```tsx
// AnomalyIndicator: Shows anomaly score, severity, info
<AnomalyIndicator 
  anomalies={anomalies}
  severity="high"
  onDismiss={() => {}}
/>

// ForecastChart: Line chart with forecast + confidence bands
<ForecastChart
  actual={actualData}
  forecast={forecastData}
  confidence95={confidenceData}
/>

// AlertBanner: Top-of-page notification for critical anomalies
<AlertBanner
  alerts={alerts}
  onClose={() => {}}
/>

// MetricsPanel: Shows statistics, trend strength, volatility
<MetricsPanel
  data={kpiData}
  showForecast={true}
  showVolatility={true}
/>
```

### Phase 7.4: Dashboard Integration (1-1.5 hours)

**File**: `frontend/src/components/bi/dashboard/KPIDashboard.tsx`

```tsx
// Add to KPIDashboard:
1. Anomaly detection section
2. Forecast visualization
3. Alert banner at top
4. Metrics panel in KPI cards
5. Anomaly history in detail view
```

### Phase 7.5: Testing & Documentation (1 hour)

- Manual testing of anomaly detection
- Verification of forecast accuracy
- Performance testing
- Documentation updates

---

## 🔧 Technology Stack

### Libraries to Install:
```bash
npm install simple-statistics
npm install ml (optional, for advanced ML algorithms)
npm install date-fns (already installed)
```

### Algorithms:
- **Z-Score Anomaly**: Built-in (simple-statistics)
- **IQR Method**: Built-in
- **Linear Forecast**: simple-statistics.linearRegression()
- **Exponential Smoothing**: Custom implementation
- **Holt-Winters**: Custom implementation

---

## 📊 Data Structures

### AnomalyPoint
```typescript
interface AnomalyPoint {
  date: Date;
  value: number;
  zScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'outlier' | 'sudden_spike' | 'sudden_drop' | 'trend_break';
  explanation?: string;
}
```

### Forecast
```typescript
interface Forecast {
  date: Date;
  predicted: number;
  lower: number;    // 95% confidence interval lower
  upper: number;    // 95% confidence interval upper
  confidence: number; // 0-1 (e.g., 0.95)
  rmse?: number;    // Root mean square error
}
```

### AnomalyStats
```typescript
interface AnomalyStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  outlierCount: number;
  outlierPercentage: number;
}
```

---

## 🎨 UI/UX Design

### Anomaly Indicator
```
┌─────────────────────────────────┐
│ ⚠️ Anomalia Detectada            │ ← Warning icon + label
├─────────────────────────────────┤
│ Valor: R$ 350.000               │
│ Esperado: R$ 250.000            │
│ Desvio: +40% (Z-score: 2.5)     │
│                                 │
│ [Investigar] [Descartar]        │ ← Actions
└─────────────────────────────────┘
```

### Forecast Chart
```
└─────────────────────────────────────────────┐
  │                                           │
  │     Histórico    Previsão (7 dias)       │
  │        ╱╲        ╱──────────╱╲           │
  │       ╱  ╲      ╱            ╲ ╲         │
  │      ╱    ╲    ╱              ╲ ╲        │
  │─────┴──────┴───┴────────────────┴─┴──────│
  │                                           │
  │    ─── Actual  ─── Forecast  ░░░ 95% CI │
  └─────────────────────────────────────────┘
```

### Alert Banner
```
╔═════════════════════════════════════════════════════════╗
║ 🚨 CRÍTICO: Custos aumentaram 45% comparado ao normal │  ← Color coded
║    Possível causa: Aumento de fornecedor               │  ← Context
║                                        [Investigar] [X] │  ← Actions
╚═════════════════════════════════════════════════════════╝
```

---

## 🧪 Testing Strategy

### Unit Tests:
```typescript
// Anomaly Detection
- testZScoreDetection()
- testIQRDetection()
- testAnomalyThreshold()

// Forecasting
- testLinearForecast()
- testExponentialSmoothing()
- testConfidenceInterval()

// Metrics
- testVarianceCalculation()
- testTrendStrength()
- testVolatility()
```

### Integration Tests:
```typescript
// Dashboard Integration
- testAnomalyDisplayOnDashboard()
- testForecastVisualization()
- testAlertBannerDisplay()

// Performance
- testAnomalyDetectionPerformance()
- testForecastGenerationTime()
```

### Manual Testing:
```
Scenario 1: Normal data (no anomalies)
→ Should not trigger alerts

Scenario 2: Single outlier
→ Should detect Z-score spike

Scenario 3: Trend break
→ Should detect trend change

Scenario 4: Seasonal data
→ Should forecast with seasonality
```

---

## 📈 Performance Targets

```
Anomaly Detection:     < 200ms (per KPI)
Forecast Generation:   < 500ms (per KPI)
Dashboard Render:      < 1000ms (total)
Memory Impact:         < 10MB (per dashboard)
```

---

## 📚 References & Algorithms

### Z-Score Method
```
Z = (value - mean) / std_dev
Anomaly if: |Z| > 2.5 or 3.0
```

### IQR Method
```
Q1 = 25th percentile
Q3 = 75th percentile
IQR = Q3 - Q1
Lower bound = Q1 - 1.5*IQR
Upper bound = Q3 + 1.5*IQR
```

### Exponential Smoothing
```
S_t = α*Y_t + (1-α)*S_t-1
where α = smoothing factor (0.1-0.3)
```

### Linear Regression Forecast
```
y = mx + b
m = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
b = ȳ - m*x̄
```

---

## 🚀 Deployment Strategy

1. **Phase 7.1-7.3**: Develop utilities, hooks, and components
2. **Phase 7.4**: Integrate into dashboard
3. **Phase 7.5**: Test and document
4. **Phase 7.6**: Deploy to staging
5. **Phase 7.7**: Production rollout

---

## 📝 Documentation to Create

1. **PHASE_7_ANALYTICS.md** - Core analytics implementation
2. **PHASE_7_ANOMALY.md** - Anomaly detection guide
3. **PHASE_7_FORECAST.md** - Forecasting guide
4. **PHASE_7_COMPLETION.md** - Phase summary

---

## ⚠️ Known Limitations

1. **Small Datasets**: Anomaly detection requires minimum 10-20 data points
2. **Seasonality**: May miss patterns in short time ranges
3. **Forecast Accuracy**: Linear forecast accuracy decreases for longer periods
4. **Computational**: ML-based detection (Isolation Forest) requires more computation

---

## 🔮 Future Enhancements

### Phase 8:
- [ ] Real-time anomaly notifications
- [ ] WebSocket integration for live updates
- [ ] LSTM neural networks for forecasting
- [ ] Multi-variate anomaly detection
- [ ] Anomaly root cause analysis

### Phase 9:
- [ ] Machine learning model training
- [ ] Custom anomaly thresholds per KPI
- [ ] Collaborative anomaly review
- [ ] Anomaly prediction confidence scores

---

## ✅ Ready to Implement

Phase 7 is well-defined and ready for implementation. Next step: Begin Phase 7.1

**Estimated Timeline**: 
- Phase 7.1: 2.5-3 hours
- Phase 7.2: 1-1.5 hours  
- Phase 7.3: 1.5-2 hours
- Phase 7.4: 1-1.5 hours
- Phase 7.5: 1 hour
- **Total**: 7-9 hours

---

**Next Action**: Begin Phase 7.1 - Analytics Engine Implementation

Desenvolvido com ❤️ para Lucide React BI Dashboard
