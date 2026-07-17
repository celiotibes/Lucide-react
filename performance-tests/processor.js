/**
 * Artillery Processor Script
 * Handles setup and teardown for load tests
 */

module.exports = {
  setup: function(context, ee, next) {
    console.log('🚀 Performance test starting...');
    console.log(`Target: ${context.vars.target}`);
    context.vars.testStartTime = Date.now();
    next();
  },

  teardown: function(context, ee, next) {
    const duration = Date.now() - context.vars.testStartTime;
    console.log(`\n✅ Performance test completed in ${(duration / 1000).toFixed(2)}s`);
    next();
  },

  generateToken: function(requestParams, context, ee, next) {
    // In production, fetch real JWT token
    context.vars.token = 'test-token-' + Math.random().toString(36).substring(7);
    return next();
  },

  beforeRequest: function(requestParams, context, ee, next) {
    requestParams.headers['X-Test-ID'] = context.vars.testStartTime;
    return next();
  },

  afterResponse: function(requestParams, responseParams, context, ee, next) {
    const statusCode = responseParams.statusCode;
    const responseTime = responseParams.responseTime;
    
    // Track metrics
    if (responseTime > 1000) {
      console.warn(`⚠️  Slow response: ${requestParams.url} took ${responseTime}ms`);
    }
    
    if (statusCode >= 400) {
      console.error(`❌ Error: ${requestParams.url} returned ${statusCode}`);
    }
    
    return next();
  }
};
