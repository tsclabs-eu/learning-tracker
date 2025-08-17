const express = require('express');
const path = require('path');
const winston = require('winston');
const Database = require('./database');

// Configuration with defaults and environment variable support
const config = {
  port: process.env.PORT || 3000,
  database: {
    type: process.env.DB_TYPE || 'sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'learning.db',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    output: process.env.LOG_OUTPUT || 'file' // 'file' or 'console'
  }
};

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
const db = new Database(config.database, logger);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', async (req, res) => {
  try {
    const items = await db.getAllLearningItems();
    res.render('index', { items, error: null });
  } catch (error) {
    logger.error('Error fetching learning items:', error);
    res.render('index', { items: [], error: 'Failed to load learning items' });
  }
});

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    config: {
      port: config.port,
      database_type: config.database.type,
      log_output: config.logging.output
    }
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await db.initialize();
    logger.info('Database initialized successfully');

    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Database type: ${config.database.type}`);
      logger.info(`Logging to: ${config.logging.output}`);
      console.log(`Server running on http://localhost:${config.port}`);
    });
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
