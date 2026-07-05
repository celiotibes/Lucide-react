-- Phase 18: Automatic Recommendations & Predictions Tables

-- Create predictions table
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  prediction_type VARCHAR(50) NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.0,
  predicted_outcome VARCHAR(100),
  predicted_deadline TIMESTAMP,
  success_probability DECIMAL(3,2),
  risk_level VARCHAR(20),
  prediction_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_predictions_user_id ON predictions(user_id);
CREATE INDEX idx_predictions_case_id ON predictions(case_id);
CREATE INDEX idx_predictions_type ON predictions(prediction_type);
CREATE INDEX idx_predictions_confidence ON predictions(confidence);
CREATE INDEX idx_predictions_created_at ON predictions(created_at);

-- Create recommendations table
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  recommendation_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL,
  action_text TEXT NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.0,
  based_on_prediction_id UUID,
  accepted BOOLEAN DEFAULT FALSE,
  implemented BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  implemented_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (based_on_prediction_id) REFERENCES predictions(id) ON DELETE SET NULL
);

CREATE INDEX idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX idx_recommendations_case_id ON recommendations(case_id);
CREATE INDEX idx_recommendations_type ON recommendations(recommendation_type);
CREATE INDEX idx_recommendations_priority ON recommendations(priority);
CREATE INDEX idx_recommendations_accepted ON recommendations(accepted);
CREATE INDEX idx_recommendations_implemented ON recommendations(implemented);
CREATE INDEX idx_recommendations_created_at ON recommendations(created_at);

-- Create prediction cache table (for performance optimization)
CREATE TABLE IF NOT EXISTS prediction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  cache_key VARCHAR(255) NOT NULL,
  cache_data JSONB,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, cache_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_prediction_cache_user_id ON prediction_cache(user_id);
CREATE INDEX idx_prediction_cache_expires_at ON prediction_cache(expires_at);

-- Create recommendation feedback table (for improving recommendations)
CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  feedback_type VARCHAR(50) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
);

CREATE INDEX idx_recommendation_feedback_user_id ON recommendation_feedback(user_id);
CREATE INDEX idx_recommendation_feedback_recommendation_id ON recommendation_feedback(recommendation_id);
CREATE INDEX idx_recommendation_feedback_type ON recommendation_feedback(feedback_type);

-- Create trigger to update predictions.updated_at
CREATE OR REPLACE FUNCTION update_predictions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_updated_at_trigger
BEFORE UPDATE ON predictions
FOR EACH ROW
EXECUTE FUNCTION update_predictions_timestamp();

-- Create trigger to auto-cleanup expired prediction cache
CREATE OR REPLACE FUNCTION cleanup_expired_prediction_cache()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM prediction_cache
  WHERE expires_at < CURRENT_TIMESTAMP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prediction_cache_cleanup_trigger
AFTER INSERT ON prediction_cache
FOR EACH ROW
EXECUTE FUNCTION cleanup_expired_prediction_cache();
