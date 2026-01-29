const Database = require('../database');
const winston = require('winston');

// Create a simple logger for tests
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.json(),
  transports: [new winston.transports.Console({ silent: true })]
});

// Test configuration for different database types
const configs = {
  sqlite: {
    type: 'sqlite',
    database: ':memory:' // Use in-memory database for testing
  },
  mysql: {
    type: 'mysql',
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    database: process.env.MYSQL_DATABASE || 'learning_test',
    username: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || ''
  },
  postgresql: {
    type: 'postgresql',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'learning_test',
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
  }
};

// Determine which databases to test based on environment
const databasesToTest = [];
if (process.env.TEST_SQLITE !== 'false') {
  databasesToTest.push('sqlite');
}
if (process.env.TEST_MYSQL === 'true') {
  databasesToTest.push('mysql');
}
if (process.env.TEST_POSTGRESQL === 'true') {
  databasesToTest.push('postgresql');
}

// If no specific tests are enabled, default to SQLite only
if (databasesToTest.length === 0) {
  databasesToTest.push('sqlite');
}

console.log(`Testing databases: ${databasesToTest.join(', ')}`);

// Run tests for each configured database
databasesToTest.forEach((dbType) => {
  describe(`Database tests - ${dbType}`, () => {
    let db;

    beforeAll(async () => {
      db = new Database(configs[dbType], logger);
      await db.initialize();
    });

    afterAll(async () => {
      // Clean up test data
      if (dbType === 'mysql' || dbType === 'postgresql') {
        try {
          const items = await db.getAllLearningItems();
          for (const item of items) {
            await db.deleteLearningItem(item.id);
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('should initialize database successfully', async () => {
      expect(db.sequelize).toBeTruthy();
      expect(db.LearningItem).toBeTruthy();
    });

    test('should add a learning item', async () => {
      const id = await db.addLearningItem('Test Item', 'Test Description');
      expect(id).toBeTruthy();
      expect(typeof id === 'number').toBe(true);
    });

    test('should get all learning items', async () => {
      await db.addLearningItem('Item 1', 'Description 1');
      await db.addLearningItem('Item 2', 'Description 2');

      const items = await db.getAllLearningItems();
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);

      // Verify item structure
      const item = items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('resolved');
      expect(item).toHaveProperty('order_index');
      expect(item).toHaveProperty('created_at');
    });

    test('should update item status', async () => {
      const id = await db.addLearningItem('Status Test', 'Status Description');

      await db.updateItemStatus(id, 'progress');
      const items = await db.getAllLearningItems();
      const item = items.find(i => i.id === id);

      expect(item.status).toBe('progress');
      // SQLite returns 0/1 for boolean, others return true/false
      expect(item.resolved).toBeFalsy();
    });

    test('should resolve an item', async () => {
      const id = await db.addLearningItem('Resolve Test', 'Resolve Description');

      await db.resolveItem(id);
      const items = await db.getAllLearningItems();
      const item = items.find(i => i.id === id);

      // SQLite returns 0/1 for boolean, others return true/false
      expect(item.resolved).toBeTruthy();
      expect(item.status).toBe('completed');
    });

    test('should unresolve an item', async () => {
      const id = await db.addLearningItem('Unresolve Test', 'Unresolve Description');

      await db.resolveItem(id);
      await db.unresolveItem(id);
      const items = await db.getAllLearningItems();
      const item = items.find(i => i.id === id);

      // SQLite returns 0/1 for boolean, others return true/false
      expect(item.resolved).toBeFalsy();
      expect(item.status).toBe('todo');
    });

    test('should update item order', async () => {
      const id = await db.addLearningItem('Order Test', 'Order Description');

      await db.updateItemOrder(id, 5);
      const items = await db.getAllLearningItems();
      const item = items.find(i => i.id === id);

      expect(item.order_index).toBe(5);
    });

    test('should reorder items', async () => {
      const id1 = await db.addLearningItem('Order Test 1', 'Description 1');
      const id2 = await db.addLearningItem('Order Test 2', 'Description 2');
      const id3 = await db.addLearningItem('Order Test 3', 'Description 3');

      // Reorder: move id1 to position of id3
      await db.reorderItems(id1, id3);

      const items = await db.getAllLearningItems();
      const item1 = items.find(i => i.id === id1);
      const item2 = items.find(i => i.id === id2);
      const item3 = items.find(i => i.id === id3);

      // Verify order changed
      expect(item1.order_index).not.toBe(item2.order_index);
    });

    test('should delete a learning item', async () => {
      const id = await db.addLearningItem('Delete Test', 'Delete Description');

      const beforeDelete = await db.getAllLearningItems();
      const beforeCount = beforeDelete.length;

      await db.deleteLearningItem(id);

      const afterDelete = await db.getAllLearningItems();
      const afterCount = afterDelete.length;

      expect(afterCount).toBe(beforeCount - 1);
      expect(afterDelete.find(i => i.id === id)).toBeUndefined();
    });

    test('should handle status ordering correctly', async () => {
      const todoId = await db.addLearningItem('Todo Item', 'Todo Description');
      const progressId = await db.addLearningItem('Progress Item', 'Progress Description');
      const completedId = await db.addLearningItem('Completed Item', 'Completed Description');

      await db.updateItemStatus(todoId, 'todo');
      await db.updateItemStatus(progressId, 'progress');
      await db.updateItemStatus(completedId, 'completed');

      const items = await db.getAllLearningItems();

      // Find the positions of our test items
      const todoIndex = items.findIndex(i => i.id === todoId);
      const progressIndex = items.findIndex(i => i.id === progressId);
      const completedIndex = items.findIndex(i => i.id === completedId);

      // Verify ordering: todo < progress < completed
      expect(todoIndex).toBeLessThan(progressIndex);
      expect(progressIndex).toBeLessThan(completedIndex);
    });
  });
});
