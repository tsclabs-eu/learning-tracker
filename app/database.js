const { Sequelize, DataTypes } = require('sequelize');

class Database {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;

        // Map database type to Sequelize dialect
        const dialect = config.type === 'postgresql' ? 'postgres' : config.type;

        // Configure Sequelize connection
        const sequelizeConfig = {
            dialect: dialect,
            logging: (msg) => logger.debug(msg),
            pool: {
                max: 10,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        };

        // Add connection details based on database type
        if (config.type === 'sqlite') {
            sequelizeConfig.storage = config.database;
        } else {
            sequelizeConfig.host = config.host;
            sequelizeConfig.port = config.port;
            sequelizeConfig.database = config.database;
            sequelizeConfig.username = config.username;
            sequelizeConfig.password = config.password;
        }

        this.sequelize = new Sequelize(sequelizeConfig);

        // Define the LearningItem model
        this.LearningItem = this.sequelize.define('learning_item', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            title: {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            status: {
                type: DataTypes.STRING(20),
                defaultValue: 'todo'
            },
            resolved: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            order_index: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW,
                field: 'created_at'
            }
        }, {
            tableName: 'learning_items',
            timestamps: false,
            underscored: true
        });
    }

    async initialize() {
        try {
            // Test the connection
            await this.sequelize.authenticate();
            this.logger.info(`Connected to ${this.config.type} database with Sequelize`);

            // Create tables if they don't exist
            await this.sequelize.sync();
            this.logger.info('Database schema synchronized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize database:', error);
            throw error;
        }
    }

    async getAllLearningItems() {
        try {
            const items = await this.LearningItem.findAll({
                order: [
                    [
                        this.sequelize.literal(`
                            CASE
                                WHEN status = 'todo' THEN 1
                                WHEN status = 'progress' THEN 2
                                WHEN status = 'completed' THEN 3
                                ELSE 4
                            END
                        `),
                        'ASC'
                    ],
                    ['order_index', 'ASC'],
                    ['created_at', 'DESC']
                ],
                raw: true
            });
            return items;
        } catch (error) {
            this.logger.error('Failed to fetch learning items:', error);
            throw error;
        }
    }

    async addLearningItem(title, description) {
        try {
            const item = await this.LearningItem.create({
                title,
                description
            });
            return item.id;
        } catch (error) {
            this.logger.error('Failed to add learning item:', error);
            throw error;
        }
    }

    async deleteLearningItem(id) {
        try {
            const result = await this.LearningItem.destroy({
                where: { id }
            });
            return result;
        } catch (error) {
            this.logger.error('Failed to delete learning item:', error);
            throw error;
        }
    }

    async resolveItem(id) {
        try {
            const result = await this.LearningItem.update(
                {
                    resolved: true,
                    status: 'completed'
                },
                {
                    where: { id }
                }
            );
            return result[0]; // Returns number of affected rows
        } catch (error) {
            this.logger.error('Failed to resolve learning item:', error);
            throw error;
        }
    }

    async unresolveItem(id) {
        try {
            const result = await this.LearningItem.update(
                {
                    resolved: false,
                    status: 'todo'
                },
                {
                    where: { id }
                }
            );
            return result[0]; // Returns number of affected rows
        } catch (error) {
            this.logger.error('Failed to unresolve learning item:', error);
            throw error;
        }
    }

    async updateItemStatus(id, status) {
        try {
            const resolved = status === 'completed';
            const result = await this.LearningItem.update(
                {
                    status,
                    resolved
                },
                {
                    where: { id }
                }
            );
            return result[0]; // Returns number of affected rows
        } catch (error) {
            this.logger.error('Failed to update item status:', error);
            throw error;
        }
    }

    async updateItemOrder(id, orderIndex) {
        try {
            const result = await this.LearningItem.update(
                {
                    order_index: orderIndex
                },
                {
                    where: { id }
                }
            );
            return result[0]; // Returns number of affected rows
        } catch (error) {
            this.logger.error('Failed to update item order:', error);
            throw error;
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
