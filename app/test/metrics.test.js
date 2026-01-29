const request = require('supertest');
const express = require('express');
const metricsCollector = require('../metrics');
const Database = require('../database');
const winston = require('winston');

// Test logger (silent)
const logger = winston.createLogger({
  level: 'error',
  transports: [new winston.transports.Console({ silent: true })]
});

// Database instrumentation wrapper (same as in app.js)
function instrumentDatabase(db, metrics) {
  const originalMethods = {
    getAllLearningItems: db.getAllLearningItems.bind(db),
    addLearningItem: db.addLearningItem.bind(db),
    deleteLearningItem: db.deleteLearningItem.bind(db),
    resolveItem: db.resolveItem.bind(db),
    unresolveItem: db.unresolveItem.bind(db),
    updateItemStatus: db.updateItemStatus.bind(db),
    updateItemOrder: db.updateItemOrder.bind(db),
    reorderItems: db.reorderItems.bind(db)
  };

  // Map methods to CRUD operations
  const operationMap = {
    getAllLearningItems: 'read',
    addLearningItem: 'create',
    deleteLearningItem: 'delete',
    resolveItem: 'update',
    unresolveItem: 'update',
    updateItemStatus: 'update',
    updateItemOrder: 'update',
    reorderItems: 'update'
  };

  // Wrap each method with metrics tracking
  Object.keys(originalMethods).forEach(methodName => {
    db[methodName] = async function(...args) {
      const startTime = process.hrtime.bigint();
      let success = true;

      try {
        const result = await originalMethods[methodName](...args);
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const endTime = process.hrtime.bigint();
        const durationSeconds = Number(endTime - startTime) / 1e9;

        metrics.recordDbOperation(
          operationMap[methodName],
          methodName,
          durationSeconds,
          success
        );
      }
    };
  });

  return db;
}

describe('Metrics endpoint tests', () => {
  let app;
  let db;

  beforeAll(async () => {
    // Setup minimal Express app with metrics
    app = express();

    // Initialize in-memory SQLite database
    db = new Database({
      type: 'sqlite',
      database: ':memory:'
    }, logger);
    await db.initialize();

    // Add metrics endpoint
    app.get('/metrics', async (req, res) => {
      await metricsCollector.updateItemsByStatus(db);
      metricsCollector.updatePoolMetrics(db.sequelize);

      res.set('Content-Type', metricsCollector.register.contentType);
      const metrics = await metricsCollector.getMetrics();
      res.end(metrics);
    });
  });

  afterAll(async () => {
    // Cleanup
    if (db) {
      await db.sequelize.close();
    }
  });

  test('metrics endpoint should return 200', async () => {
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
  });

  test('metrics should include default Node.js metrics', async () => {
    const response = await request(app).get('/metrics');
    const metrics = response.text;

    // Check for default metrics (using actual metric names from prom-client)
    expect(metrics).toMatch(/learning_tracker_nodejs_process_cpu_user_seconds_total/);
    expect(metrics).toMatch(/learning_tracker_nodejs_process_resident_memory_bytes/);
    expect(metrics).toMatch(/learning_tracker_nodejs_nodejs_eventloop_lag_seconds/);
  });

  test('metrics should track learning items by status', async () => {
    // Add test items
    await db.addLearningItem('Test Todo', 'Description');
    await db.addLearningItem('Test Progress', 'Description');
    const completedId = await db.addLearningItem('Test Completed', 'Description');
    await db.updateItemStatus(completedId, 'completed');

    const response = await request(app).get('/metrics');
    const metrics = response.text;

    // Check for items by status
    expect(metrics).toMatch(/learning_items_by_status\{status="todo"\}/);
    expect(metrics).toMatch(/learning_items_by_status\{status="progress"\}/);
    expect(metrics).toMatch(/learning_items_by_status\{status="completed"\}/);
  });

  test('metrics should include database operation metrics', async () => {
    // Perform some database operations
    await db.addLearningItem('Metric Test', 'Description');
    await db.getAllLearningItems();

    const response = await request(app).get('/metrics');
    const metrics = response.text;

    // Check for database metrics
    expect(metrics).toMatch(/db_operations_total/);
    expect(metrics).toMatch(/db_operation_duration_seconds/);
  });

  test('metrics should include connection pool metrics', async () => {
    const response = await request(app).get('/metrics');
    const metrics = response.text;

    expect(metrics).toMatch(/db_connection_pool_size/);
    expect(metrics).toMatch(/db_connection_pool_idle/);
    expect(metrics).toMatch(/db_connection_pool_active/);
  });
});

describe('HTTP metrics tracking tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Add HTTP tracking middleware
    app.use((req, res, next) => {
      const startTime = process.hrtime.bigint();

      res.on('finish', () => {
        const endTime = process.hrtime.bigint();
        const durationSeconds = Number(endTime - startTime) / 1e9;
        const route = req.route?.path || req.path;

        metricsCollector.recordHttpRequest(
          req.method,
          route,
          res.statusCode,
          durationSeconds
        );
      });

      next();
    });

    // Test routes
    app.get('/test', (req, res) => res.json({ success: true }));
    app.post('/test', (req, res) => res.status(201).json({ success: true }));
    app.get('/error', (req, res) => res.status(500).json({ error: true }));

    app.get('/metrics', async (req, res) => {
      res.set('Content-Type', metricsCollector.register.contentType);
      res.end(await metricsCollector.getMetrics());
    });
  });

  test('should track successful GET requests', async () => {
    await request(app).get('/test');

    const response = await request(app).get('/metrics');
    const metrics = response.text;

    expect(metrics).toMatch(/http_requests_total\{.*method="GET".*route="\/test".*status="200".*\}/);
    expect(metrics).toMatch(/http_request_duration_seconds_bucket\{.*method="GET".*route="\/test".*status="200".*\}/);
  });

  test('should track POST requests with 201 status', async () => {
    await request(app).post('/test').send({});

    const response = await request(app).get('/metrics');
    const metrics = response.text;

    expect(metrics).toMatch(/http_requests_total\{.*method="POST".*route="\/test".*status="201".*\}/);
  });

  test('should track error responses', async () => {
    await request(app).get('/error');

    const response = await request(app).get('/metrics');
    const metrics = response.text;

    expect(metrics).toMatch(/http_requests_total\{.*method="GET".*route="\/error".*status="500".*\}/);
  });
});

describe('Database instrumentation tests', () => {
  let db;

  beforeAll(async () => {
    db = new Database({
      type: 'sqlite',
      database: ':memory:'
    }, logger);
    await db.initialize();

    // Apply instrumentation wrapper
    db = instrumentDatabase(db, metricsCollector);
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  test('should track database create operations', async () => {
    await db.addLearningItem('Test Item', 'Description');

    const metrics = await metricsCollector.getMetrics();

    expect(metrics).toMatch(/db_operations_total\{.*operation="create".*method="addLearningItem".*success="true".*\}/);
  });

  test('should track database read operations', async () => {
    await db.getAllLearningItems();

    const metrics = await metricsCollector.getMetrics();

    expect(metrics).toMatch(/db_operations_total\{.*operation="read".*method="getAllLearningItems".*\}/);
    expect(metrics).toMatch(/db_operation_duration_seconds_bucket\{.*operation="read".*method="getAllLearningItems".*\}/);
  });

  test('should track database update operations', async () => {
    const id = await db.addLearningItem('Update Test', 'Description');
    await db.updateItemStatus(id, 'progress');

    const metrics = await metricsCollector.getMetrics();

    expect(metrics).toMatch(/db_operations_total\{.*operation="update".*method="updateItemStatus".*\}/);
  });

  test('should track database delete operations', async () => {
    const id = await db.addLearningItem('Delete Test', 'Description');
    await db.deleteLearningItem(id);

    const metrics = await metricsCollector.getMetrics();

    expect(metrics).toMatch(/db_operations_total\{.*operation="delete".*method="deleteLearningItem".*\}/);
  });

  test('should track resolve operations', async () => {
    const id = await db.addLearningItem('Resolve Test', 'Description');
    await db.resolveItem(id);

    const metrics = await metricsCollector.getMetrics();

    expect(metrics).toMatch(/db_operations_total\{.*operation="update".*method="resolveItem".*\}/);
  });

  test('should track unresolve operations', async () => {
    const id = await db.addLearningItem('Unresolve Test', 'Description');
    await db.resolveItem(id);
    await db.unresolveItem(id);

    const metrics = await metricsCollector.getMetrics();

    expect(metrics).toMatch(/db_operations_total\{.*operation="update".*method="unresolveItem".*\}/);
  });

  test('should track reorder operations', async () => {
    const id1 = await db.addLearningItem('Item 1', 'Description');
    const id2 = await db.addLearningItem('Item 2', 'Description');
    await db.reorderItems(id1, id2);

    const metrics = await metricsCollector.getMetrics();

    expect(metrics).toMatch(/db_operations_total\{.*operation="update".*method="reorderItems".*\}/);
  });
});

describe('Metrics format validation', () => {
  let app;
  let db;

  beforeAll(async () => {
    app = express();

    db = new Database({
      type: 'sqlite',
      database: ':memory:'
    }, logger);
    await db.initialize();

    app.get('/metrics', async (req, res) => {
      await metricsCollector.updateItemsByStatus(db);
      metricsCollector.updatePoolMetrics(db.sequelize);

      res.set('Content-Type', metricsCollector.register.contentType);
      const metrics = await metricsCollector.getMetrics();
      res.end(metrics);
    });
  });

  afterAll(async () => {
    if (db) {
      await db.sequelize.close();
    }
  });

  test('metrics should be in Prometheus text format', async () => {
    const response = await request(app).get('/metrics');

    // Verify Prometheus format characteristics
    const lines = response.text.split('\n');

    // Should have HELP and TYPE declarations
    const helpLines = lines.filter(line => line.startsWith('# HELP'));
    const typeLines = lines.filter(line => line.startsWith('# TYPE'));

    expect(helpLines.length).toBeGreaterThan(0);
    expect(typeLines.length).toBeGreaterThan(0);
  });

  test('metrics should have valid metric names', async () => {
    const response = await request(app).get('/metrics');
    const metrics = response.text;

    // Check for all expected metric types
    expect(metrics).toMatch(/http_request_duration_seconds/);
    expect(metrics).toMatch(/http_requests_total/);
    expect(metrics).toMatch(/db_operation_duration_seconds/);
    expect(metrics).toMatch(/db_operations_total/);
    expect(metrics).toMatch(/learning_items_by_status/);
  });
});

describe('Separate metrics port functionality', () => {
  test('metrics handler should work on separate Express app', async () => {
    // Simulate separate metrics server
    const metricsApp = express();
    const db = new Database({
      type: 'sqlite',
      database: ':memory:'
    }, logger);
    await db.initialize();

    metricsApp.get('/metrics', async (req, res) => {
      await metricsCollector.updateItemsByStatus(db);
      metricsCollector.updatePoolMetrics(db.sequelize);

      res.set('Content-Type', metricsCollector.register.contentType);
      const metrics = await metricsCollector.getMetrics();
      res.end(metrics);
    });

    metricsApp.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'metrics' });
    });

    const response = await request(metricsApp).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);

    const healthResponse = await request(metricsApp).get('/health');
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toEqual({ status: 'healthy', service: 'metrics' });

    await db.sequelize.close();
  });
});
