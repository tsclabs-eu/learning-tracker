const express = require('express');
const path = require('path');
const winston = require('winston');
const axios = require('axios');
const Database = require('./database');
const metricsCollector = require('./metrics');

// Configuration with defaults and environment variable support
const config = {
  mode: process.env.APP_MODE || 'all-in-one', // 'all-in-one', 'frontend', 'api'
  version: process.env.APP_VERSION || 'dev', // Application version from build
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000', // Used in frontend mode
  port: parseInt(process.env.PORT || 3000, 10),
  metricsPort: process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : null, // Separate metrics port (optional)
  database: {
    type: process.env.DB_TYPE || 'sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || ((process.env.DB_TYPE === 'postgresql') ? 5432 : 3306),
    database: process.env.DB_NAME || 'learning.db',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    output: process.env.LOG_OUTPUT || 'file' // 'file' or 'console'
  }
};

// Validate mode
const validModes = ['all-in-one', 'frontend', 'api'];
if (!validModes.includes(config.mode)) {
  console.error(`Invalid APP_MODE: ${config.mode}. Must be one of: ${validModes.join(', ')}`);
  process.exit(1);
}

// Logger configuration
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports = [];
if (config.logging.output === 'console') {
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
} else {
  transports.push(new winston.transports.File({
    filename: 'app.log',
    format: logFormat
  }));
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: transports
});

const app = express();

// Initialize database only in API and all-in-one modes
let db = null;
if (config.mode === 'api' || config.mode === 'all-in-one') {
  db = new Database(config.database, logger);
  // Wrap database methods for metrics tracking
  db = instrumentDatabase(db, metricsCollector);
}

// API client for frontend mode
const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Metrics tracking middleware - track all HTTP requests
app.use((req, res, next) => {
  const startTime = process.hrtime.bigint();

  // Capture response finish event
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;

    // Normalize route for better cardinality
    const route = normalizeRoute(req.route?.path || req.path);

    metricsCollector.recordHttpRequest(
      req.method,
      route,
      res.statusCode,
      durationSeconds
    );
  });

  next();
});

// Helper function to normalize routes
function normalizeRoute(path) {
  // Replace numeric IDs with :id to avoid unbounded cardinality
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/\d+\//g, '/:id/');
}

// Database instrumentation wrapper
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

// CORS middleware for API mode
if (config.mode === 'api') {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  });
}

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Frontend Routes (served in 'frontend' and 'all-in-one' modes)
if (config.mode === 'frontend' || config.mode === 'all-in-one') {
  app.get('/', async (req, res) => {
    try {
      let items;
      let backendHostname = null;
      
      if (config.mode === 'frontend') {
        // In frontend mode, fetch from API backend
        try {
          const response = await apiClient.get('/api/items');
          items = response.data;
          // Get backend hostname from health check
          try {
            const healthResponse = await apiClient.get('/health');
            backendHostname = healthResponse.data.hostname || config.apiBaseUrl;
          } catch (e) {
            backendHostname = config.apiBaseUrl;
          }
        } catch (error) {
          logger.error('Error fetching items from API backend:', error.message);
          items = [];
          backendHostname = config.apiBaseUrl;
        }
      } else {
        // In all-in-one mode, use local database
        items = await db.getAllLearningItems();
      }
      
      res.render('index', { 
        items, 
        error: null,
        frontendHostname: require('os').hostname(),
        backendHostname: backendHostname,
        mode: config.mode
      });
    } catch (error) {
      logger.error('Error fetching learning items:', error);
      res.render('index', { 
        items: [], 
        error: 'Failed to load learning items',
        frontendHostname: require('os').hostname(),
        backendHostname: null,
        mode: config.mode
      });
    }
  });
  
  // Proxy API endpoints in frontend mode
  if (config.mode === 'frontend') {
    // Health check for backend API - return backend's health data directly
    app.get('/api/health', async (req, res) => {
      try {
        const response = await apiClient.get('/health');
        res.json(response.data);
      } catch (error) {
        logger.error('Backend health check failed:', error.message);
        res.status(503).json({ 
          status: 'unhealthy',
          error: error.message,
          backend: 'unreachable'
        });
      }
    });
    
    // Get all items
    app.get('/api/items', async (req, res) => {
      try {
        const response = await apiClient.get('/api/items');
        res.json(response.data);
      } catch (error) {
        logger.error('Error proxying get items:', error);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
      }
    });
    
    // Add item
    app.post('/api/items', async (req, res) => {
      try {
        const response = await apiClient.post('/api/items', req.body);
        res.json(response.data);
      } catch (error) {
        logger.error('Error proxying add item:', error);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
      }
    });
    
    // Delete item
    app.delete('/api/items/:id', async (req, res) => {
      try {
        const response = await apiClient.delete(`/api/items/${req.params.id}`);
        res.json(response.data);
      } catch (error) {
        logger.error('Error proxying delete item:', error);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
      }
    });
    
    // Update item status
    app.post('/api/items/:id/status', async (req, res) => {
      try {
        const response = await apiClient.post(`/api/items/${req.params.id}/status`, req.body);
        res.json(response.data);
      } catch (error) {
        logger.error('Error proxying update status:', error);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
      }
    });
    
    // Resolve item
    app.post('/api/items/:id/resolve', async (req, res) => {
      try {
        const response = await apiClient.post(`/api/items/${req.params.id}/resolve`, req.body);
        res.json(response.data);
      } catch (error) {
        logger.error('Error proxying resolve item:', error);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
      }
    });
    
    // Unresolve item
    app.post('/api/items/:id/unresolve', async (req, res) => {
      try {
        const response = await apiClient.post(`/api/items/${req.params.id}/unresolve`, req.body);
        res.json(response.data);
      } catch (error) {
        logger.error('Error proxying unresolve item:', error);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
      }
    });
    
    // Reorder items
    app.post('/api/items/reorder', async (req, res) => {
      try {
        const response = await apiClient.post('/api/items/reorder', req.body);
        res.json(response.data);
      } catch (error) {
        logger.error('Error proxying reorder items:', error);
        res.status(error.response?.status || 500).json({ success: false, error: error.message });
      }
    });
  }
}

// API Routes (served in 'api' and 'all-in-one' modes)
if (config.mode === 'api' || config.mode === 'all-in-one') {
  // Get all items
  app.get('/api/items', async (req, res) => {
    try {
      const items = await db.getAllLearningItems();
      res.json(items);
    } catch (error) {
      logger.error('Error fetching learning items:', error);
      res.status(500).json({ success: false, error: 'Failed to load learning items' });
    }
  });

  // Add item
  app.post('/api/items', async (req, res) => {
    const { title, description } = req.body;

    if (!title || !description || title.trim() === '' || description.trim() === '') {
      return res.status(400).json({ success: false, error: 'Title and description are required' });
    }

    try {
      await db.addLearningItem(title, description);
      logger.info(`Added new learning item: ${title}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error adding learning item:', error);
      res.status(500).json({ success: false, error: 'Failed to add learning item' });
    }
  });

  // Delete item
  app.delete('/api/items/:id', async (req, res) => {
    const { id } = req.params;

    try {
      await db.deleteLearningItem(id);
      logger.info(`Deleted learning item with id: ${id}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting learning item:', error);
      res.status(500).json({ success: false, error: 'Failed to delete item' });
    }
  });

  // Resolve item
  app.post('/api/items/:id/resolve', async (req, res) => {
    const { id } = req.params;

    try {
      await db.resolveItem(id);
      logger.info(`Resolved learning item with id: ${id}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error resolving learning item:', error);
      res.status(500).json({ success: false, error: 'Failed to resolve item' });
    }
  });

  // Unresolve item
  app.post('/api/items/:id/unresolve', async (req, res) => {
    const { id } = req.params;

    try {
      await db.unresolveItem(id);
      logger.info(`Unresolved learning item with id: ${id}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error unresolving learning item:', error);
      res.status(500).json({ success: false, error: 'Failed to unresolve item' });
    }
  });

  // Update item status
  app.post('/api/items/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    logger.info(`Received status update request: ID=${id}, Status=${status}`);

    try {
      await db.updateItemStatus(id, status);
      logger.info(`Updated status of item ${id} to ${status}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating item status:', error);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  });

  // Reorder items
  app.post('/api/items/reorder', async (req, res) => {
    const { draggedId, targetId } = req.body;

    try {
      await db.reorderItems(draggedId, targetId);
      logger.info(`Reordered items: ${draggedId} -> ${targetId}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error reordering learning items:', error);
      res.status(500).json({ success: false, error: 'Failed to reorder items' });
    }
  });
}

// Legacy routes for backwards compatibility in all-in-one mode
if (config.mode === 'all-in-one') {
  app.post('/add', async (req, res) => {
    const { title, description } = req.body;

    if (!title || !description || title.trim() === '' || description.trim() === '') {
      const items = await db.getAllLearningItems();
      return res.render('index', {
        items,
        error: 'Title and description are required'
      });
    }

    try {
      await db.addLearningItem(title, description);
      logger.info(`Added new learning item: ${title}`);
      res.redirect('/');
    } catch (error) {
      logger.error('Error adding learning item:', error);
      const items = await db.getAllLearningItems();
      res.render('index', {
        items,
        error: 'Failed to add learning item'
      });
    }
  });

  app.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;

    try {
      await db.deleteLearningItem(id);
      logger.info(`Deleted learning item with id: ${id}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting learning item:', error);
      res.status(500).json({ success: false, error: 'Failed to delete item' });
    }
  });

  app.post('/resolve/:id', async (req, res) => {
    const { id } = req.params;

    try {
      await db.resolveItem(id);
      logger.info(`Resolved learning item with id: ${id}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error resolving learning item:', error);
      res.status(500).json({ success: false, error: 'Failed to resolve item' });
    }
  });

  app.post('/unresolve/:id', async (req, res) => {
    const { id } = req.params;

    try {
      await db.unresolveItem(id);
      logger.info(`Unresolved learning item with id: ${id}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error unresolving learning item:', error);
      res.status(500).json({ success: false, error: 'Failed to unresolve item' });
    }
  });

  app.post('/reorder', async (req, res) => {
    const { draggedId, targetId } = req.body;

    try {
      await db.reorderItems(draggedId, targetId);
      logger.info(`Reordered items: ${draggedId} -> ${targetId}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error reordering learning items:', error);
      res.status(500).json({ success: false, error: 'Failed to reorder items' });
    }
  });

  app.post('/status/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    logger.info(`Received status update request: ID=${id}, Status=${status}`);

    try {
      await db.updateItemStatus(id, status);
      logger.info(`Updated status of item ${id} to ${status}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating item status:', error);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  });
}

// Health check endpoints (available in all modes)
app.get('/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    hostname: require('os').hostname(),
    version: config.version,
    config: {
      mode: config.mode,
      port: config.port,
      database_type: config.mode !== 'frontend' ? config.database.type : 'N/A',
      log_output: config.logging.output,
      api_base_url: config.mode === 'frontend' ? config.apiBaseUrl : 'N/A'
    }
  };
  
  // Add database host information if not in frontend mode
  if (config.mode !== 'frontend') {
    if (config.database.type === 'sqlite') {
      healthData.config.database_host = 'local';
      healthData.config.database_name = config.database.database;
    } else {
      healthData.config.database_host = config.database.host;
      healthData.config.database_name = config.database.database;
    }
  }
  
  res.json(healthData);
});

// Alias for consistency with frontend expectations
app.get('/api/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    hostname: require('os').hostname(),
    version: config.version,
    mode: config.mode,
    config: {
      database_type: config.mode !== 'frontend' ? config.database.type : 'N/A'
    }
  };
  
  // Add database host information if not in frontend mode
  if (config.mode !== 'frontend') {
    if (config.database.type === 'sqlite') {
      healthData.config.database_host = 'local';
      healthData.config.database_name = config.database.database;
    } else {
      healthData.config.database_host = config.database.host;
      healthData.config.database_name = config.database.database;
    }
  }
  
  res.json(healthData);
});

// Metrics endpoint handler (reusable)
async function metricsHandler(req, res) {
  try {
    // Update application-specific metrics before serving
    if (db) {
      try {
        await metricsCollector.updateItemsByStatus(db);
        metricsCollector.updatePoolMetrics(db.sequelize);
      } catch (error) {
        logger.error('Error updating metrics:', error);
      }
    }

    res.set('Content-Type', metricsCollector.register.contentType);
    const metrics = await metricsCollector.getMetrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Error serving metrics:', error);
    res.status(500).end('Error generating metrics');
  }
}

// Metrics endpoint on main app (available when METRICS_PORT is not set)
if (!config.metricsPort) {
  app.get('/metrics', metricsHandler);
}

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database only in API and all-in-one modes
    if (db) {
      await db.initialize();
      logger.info('Database initialized successfully');

      // Start periodic metrics update (every 30 seconds)
      setInterval(async () => {
        try {
          await metricsCollector.updateItemsByStatus(db);
          metricsCollector.updatePoolMetrics(db.sequelize);
        } catch (error) {
          logger.error('Error updating periodic metrics:', error);
        }
      }, 30000);
    } else {
      logger.info('Running in frontend-only mode, no database initialization');
    }

    app.listen(config.port, () => {
      logger.info(`Server running in ${config.mode} mode on port ${config.port}`);
      if (db) {
        logger.info(`Database type: ${config.database.type}`);
      }
      if (config.mode === 'frontend') {
        logger.info(`API base URL: ${config.apiBaseUrl}`);
      }
      logger.info(`Logging to: ${config.logging.output}`);
      console.log(`Server running in ${config.mode} mode on http://localhost:${config.port}`);
      if (config.mode === 'frontend') {
        console.log(`Connecting to API at: ${config.apiBaseUrl}`);
      }
    });

    // Start separate metrics server if METRICS_PORT is configured
    if (config.metricsPort) {
      const metricsApp = express();
      metricsApp.get('/metrics', metricsHandler);

      // Health check on metrics port
      metricsApp.get('/health', (req, res) => {
        res.json({ status: 'healthy', service: 'metrics' });
      });

      metricsApp.listen(config.metricsPort, () => {
        logger.info(`Metrics server running on port ${config.metricsPort}`);
        console.log(`Metrics available at http://localhost:${config.metricsPort}/metrics`);
      });
    } else {
      console.log(`Metrics available at http://localhost:${config.port}/metrics`);
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
