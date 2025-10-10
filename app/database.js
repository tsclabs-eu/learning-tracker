const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');

class Database {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.connection = null;
    }

    async initialize() {
        if (this.config.type === 'sqlite') {
            await this.initializeSQLite();
        } else if (this.config.type === 'mysql') {
            await this.initializeMySQL();
        } else {
            throw new Error(`Unsupported database type: ${this.config.type}`);
        }

        await this.createSchema();
    }

    async initializeSQLite() {
        return new Promise((resolve, reject) => {
            this.connection = new sqlite3.Database(this.config.database, (err) => {
                if (err) {
                    this.logger.error('Failed to connect to SQLite database:', err);
                    reject(err);
                } else {
                    this.logger.info('Connected to SQLite database');
                    resolve();
                }
            });
        });
    }

    async initializeMySQL() {
        try {
            // Use connection pool for better performance with multiple replicas
            this.connection = mysql.createPool({
                host: this.config.host,
                port: this.config.port,
                user: this.config.username,
                password: this.config.password,
                database: this.config.database,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
            });
            // Test the connection
            await this.connection.query('SELECT 1');
            this.logger.info('Connected to MySQL database with connection pool');
        } catch (error) {
            this.logger.error('Failed to connect to MySQL database:', error);
            throw error;
        }
    }

    async createSchema() {
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS learning_items (
        id INTEGER PRIMARY KEY ${this.config.type === 'mysql' ? 'AUTO_INCREMENT' : 'AUTOINCREMENT'},
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'todo',
        resolved BOOLEAN DEFAULT FALSE,
        order_index INTEGER DEFAULT 0,
        created_at ${this.config.type === 'mysql' ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP'}
      )
    `;

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.run(createTableSQL, (err) => {
                    if (err) {
                        this.logger.error('Failed to create table:', err);
                        reject(err);
                    } else {
                        this.logger.info('Database schema created successfully');
                        // Add columns if they don't exist (for existing databases)
                        this.addMissingColumns().then(resolve).catch(reject);
                    }
                });
            });
        } else {
            try {
                await this.connection.execute(createTableSQL);
                this.logger.info('Database schema created successfully');
                await this.addMissingColumns();
            } catch (error) {
                this.logger.error('Failed to create table:', error);
                throw error;
            }
        }
    }

    async addMissingColumns() {
        // Add resolved column if it doesn't exist
        const addResolvedSQL = `ALTER TABLE learning_items ADD COLUMN resolved BOOLEAN DEFAULT FALSE`;
        const addOrderSQL = `ALTER TABLE learning_items ADD COLUMN order_index INTEGER DEFAULT 0`;
        const addStatusSQL = `ALTER TABLE learning_items ADD COLUMN status VARCHAR(20) DEFAULT 'todo'`;

        if (this.config.type === 'sqlite') {
            return new Promise((resolve) => {
                this.connection.run(addResolvedSQL, () => {
                    // Ignore error if column already exists
                    this.connection.run(addOrderSQL, () => {
                        // Ignore error if column already exists
                        this.connection.run(addStatusSQL, () => {
                            // Ignore error if column already exists
                            resolve();
                        });
                    });
                });
            });
        } else {
            try {
                await this.connection.execute(addResolvedSQL);
            } catch (error) {
                // Ignore error if column already exists
            }
            try {
                await this.connection.execute(addOrderSQL);
            } catch (error) {
                // Ignore error if column already exists
            }
            try {
                await this.connection.execute(addStatusSQL);
            } catch (error) {
                // Ignore error if column already exists
            }
        }
    }

    async getAllLearningItems() {
        const selectSQL = `
            SELECT
                id,
                title,
                description,
                status,
                resolved,
                order_index,
                created_at
            FROM
                learning_items
            ORDER BY
                CASE
                    WHEN status = "todo" THEN 1
                    WHEN status = "progress" THEN 2
                    WHEN status = "completed" THEN 3
                    ELSE 4
                END,
                order_index ASC,
                created_at DESC
        `;

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.all(selectSQL, [], (err, rows) => {
                    if (err) {
                        this.logger.error('Failed to fetch learning items:', err);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        } else {
            try {
                const [rows] = await this.connection.execute(selectSQL);
                return rows;
            } catch (error) {
                this.logger.error('Failed to fetch learning items:', error);
                throw error;
            }
        }
    }

    async addLearningItem(title, description) {
        const insertSQL = 'INSERT INTO learning_items (title, description) VALUES (?, ?)';

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.run(insertSQL, [title, description], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
            });
        } else {
            try {
                const [result] = await this.connection.execute(insertSQL, [title, description]);
                return result.insertId;
            } catch (error) {
                throw error;
            }
        }
    }

    async deleteLearningItem(id) {
        const deleteSQL = 'DELETE FROM learning_items WHERE id = ?';

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.run(deleteSQL, [id], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });
        } else {
            try {
                const [result] = await this.connection.execute(deleteSQL, [id]);
                return result.affectedRows;
            } catch (error) {
                throw error;
            }
        }
    }

    async resolveItem(id) {
        const updateSQL = 'UPDATE learning_items SET resolved = TRUE, status = "completed" WHERE id = ?';

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.run(updateSQL, [id], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });
        } else {
            try {
                const [result] = await this.connection.execute(updateSQL, [id]);
                return result.affectedRows;
            } catch (error) {
                throw error;
            }
        }
    }

    async unresolveItem(id) {
        const updateSQL = 'UPDATE learning_items SET resolved = FALSE, status = "todo" WHERE id = ?';

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.run(updateSQL, [id], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });
        } else {
            try {
                const [result] = await this.connection.execute(updateSQL, [id]);
                return result.affectedRows;
            } catch (error) {
                throw error;
            }
        }
    }

    async updateItemStatus(id, status) {
        const updateSQL = 'UPDATE learning_items SET status = ?, resolved = ? WHERE id = ?';
        const resolved = status === 'completed';

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.run(updateSQL, [status, resolved, id], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });
        } else {
            try {
                const [result] = await this.connection.execute(updateSQL, [status, resolved, id]);
                return result.affectedRows;
            } catch (error) {
                throw error;
            }
        }
    }

    async updateItemOrder(id, orderIndex) {
        const updateSQL = 'UPDATE learning_items SET order_index = ? WHERE id = ?';

        if (this.config.type === 'sqlite') {
            return new Promise((resolve, reject) => {
                this.connection.run(updateSQL, [orderIndex, id], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });
        } else {
            try {
                const [result] = await this.connection.execute(updateSQL, [orderIndex, id]);
                return result.affectedRows;
            } catch (error) {
                throw error;
            }
        }
    }

    async reorderItems(draggedId, targetId) {
        try {
            // Get all items
            const items = await this.getAllLearningItems();

            // Find the dragged and target items
            const draggedItem = items.find(item => item.id === draggedId);
            const targetItem = items.find(item => item.id === targetId);

            if (!draggedItem || !targetItem) {
                throw new Error('Item not found');
            }

            // Remove dragged item from the list
            const filteredItems = items.filter(item => item.id !== draggedId);

            // Find the target index
            const targetIndex = filteredItems.findIndex(item => item.id === targetId);

            // Insert dragged item at the target position
            filteredItems.splice(targetIndex, 0, draggedItem);

            // Update order_index for all items
            for (let i = 0; i < filteredItems.length; i++) {
                await this.updateItemOrder(filteredItems[i].id, i);
            }

            return true;
        } catch (error) {
            this.logger.error('Error reordering items:', error);
            throw error;
        }
    }
}

module.exports = Database;
