const client = require('prom-client');

/**
 * MetricsCollector - Singleton class for managing Prometheus metrics
 *
 * Collects and exposes:
 * - Default Node.js metrics (memory, CPU, event loop, GC)
 * - HTTP request metrics (duration, count by method/route/status)
 * - Database operation metrics (duration, count by operation type)
 * - Application-specific metrics (learning items by status)
 * - Database connection pool metrics
 */
class MetricsCollector {
  constructor() {
    this.register = new client.Registry();

    // Initialize all metric types
    this.collectDefaultMetrics();
    this.initHttpMetrics();
    this.initDatabaseMetrics();
    this.initApplicationMetrics();
  }

  /**
   * Collect default Node.js metrics
   * Includes: memory usage, CPU usage, event loop lag, garbage collection
   */
  collectDefaultMetrics() {
    client.collectDefaultMetrics({
      register: this.register,
      prefix: 'learning_tracker_nodejs_'
    });
  }

  /**
   * Initialize HTTP request metrics
   */
  initHttpMetrics() {
    // Histogram for request duration with labels for method, route, and status
    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5], // 1ms to 5s
      registers: [this.register]
    });

    // Counter for total requests
    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.register]
    });
  }

  /**
   * Initialize database operation metrics
   */
  initDatabaseMetrics() {
    // Histogram for database operation duration
    this.dbOperationDuration = new client.Histogram({
      name: 'db_operation_duration_seconds',
      help: 'Database operation duration in seconds',
      labelNames: ['operation', 'method'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1], // 1ms to 1s
      registers: [this.register]
    });

    // Counter for database operations
    this.dbOperationsTotal = new client.Counter({
      name: 'db_operations_total',
      help: 'Total number of database operations',
      labelNames: ['operation', 'method', 'success'],
      registers: [this.register]
    });

    // Gauges for connection pool metrics
    this.dbPoolSize = new client.Gauge({
      name: 'db_connection_pool_size',
      help: 'Current database connection pool size',
      registers: [this.register]
    });

    this.dbPoolIdle = new client.Gauge({
      name: 'db_connection_pool_idle',
      help: 'Number of idle database connections',
      registers: [this.register]
    });

    this.dbPoolActive = new client.Gauge({
      name: 'db_connection_pool_active',
      help: 'Number of active database connections',
      registers: [this.register]
    });
  }

  /**
   * Initialize application-specific metrics
   */
  initApplicationMetrics() {
    // Gauge for learning items by status
    this.itemsByStatus = new client.Gauge({
      name: 'learning_items_by_status',
      help: 'Number of learning items by status',
      labelNames: ['status'],
      registers: [this.register]
    });
  }

  /**
   * Record an HTTP request
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} route - Normalized route path
   * @param {number} statusCode - HTTP status code
   * @param {number} durationSeconds - Request duration in seconds
   */
  recordHttpRequest(method, route, statusCode, durationSeconds) {
    const labels = {
      method,
      route,
      status: String(statusCode)
    };

    this.httpRequestDuration.observe(labels, durationSeconds);
    this.httpRequestsTotal.inc(labels);
  }

  /**
   * Record a database operation
   * @param {string} operation - CRUD operation type (create, read, update, delete)
   * @param {string} method - Database method name
   * @param {number} durationSeconds - Operation duration in seconds
   * @param {boolean} success - Whether the operation succeeded
   */
  recordDbOperation(operation, method, durationSeconds, success) {
    const labels = { operation, method };

    this.dbOperationDuration.observe(labels, durationSeconds);
    this.dbOperationsTotal.inc({
      ...labels,
      success: success ? 'true' : 'false'
    });
  }

  /**
   * Update learning items count by status
   * @param {Object} db - Database instance
   */
  async updateItemsByStatus(db) {
    try {
      const items = await db.getAllLearningItems();
      const statusCounts = { todo: 0, progress: 0, completed: 0 };

      items.forEach(item => {
        if (statusCounts[item.status] !== undefined) {
          statusCounts[item.status]++;
        }
      });

      this.itemsByStatus.set({ status: 'todo' }, statusCounts.todo);
      this.itemsByStatus.set({ status: 'progress' }, statusCounts.progress);
      this.itemsByStatus.set({ status: 'completed' }, statusCounts.completed);
    } catch (error) {
      // Silently fail - metrics update should not break the app
      console.error('Error updating items by status metric:', error.message);
    }
  }

  /**
   * Update database connection pool metrics
   * @param {Object} sequelize - Sequelize instance
   */
  updatePoolMetrics(sequelize) {
    try {
      const pool = sequelize.connectionManager.pool;
      if (pool) {
        this.dbPoolSize.set(pool.size || 0);
        this.dbPoolIdle.set(pool.available || 0);
        this.dbPoolActive.set(pool.using || 0);
      }
    } catch (error) {
      // Silently fail - metrics update should not break the app
      console.error('Error updating pool metrics:', error.message);
    }
  }

  /**
   * Get all metrics in Prometheus text format
   * @returns {Promise<string>} Metrics in Prometheus format
   */
  async getMetrics() {
    return this.register.metrics();
  }
}

// Export singleton instance
const metricsCollector = new MetricsCollector();
module.exports = metricsCollector;
