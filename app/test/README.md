# Database Tests

This directory contains tests for the database layer of the learning tracker application.

## Running Tests

### SQLite (Default)
```bash
npm test
```

SQLite tests use an in-memory database and don't require any external setup.

### MySQL Tests
To test with MySQL, you need a running MySQL server:

```bash
# Start MySQL with Docker
docker run -d --name mysql-test \
  -e MYSQL_ROOT_PASSWORD=testpass \
  -e MYSQL_DATABASE=learning_test \
  -p 3306:3306 \
  mysql:8

# Run tests
TEST_MYSQL=true \
MYSQL_HOST=localhost \
MYSQL_PORT=3306 \
MYSQL_DATABASE=learning_test \
MYSQL_USER=root \
MYSQL_PASSWORD=testpass \
npm test

# Clean up
docker stop mysql-test && docker rm mysql-test
```

### PostgreSQL Tests
To test with PostgreSQL, you need a running PostgreSQL server:

```bash
# Start PostgreSQL with Docker
docker run -d --name postgres-test \
  -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=learning_test \
  -p 5432:5432 \
  postgres:15

# Run tests
TEST_POSTGRESQL=true \
POSTGRES_HOST=localhost \
POSTGRES_PORT=5432 \
POSTGRES_DATABASE=learning_test \
POSTGRES_USER=postgres \
POSTGRES_PASSWORD=testpass \
npm test

# Clean up
docker stop postgres-test && docker rm postgres-test
```

### Test All Databases
```bash
# Start all database containers
docker-compose -f docker-compose.test.yml up -d

# Run all tests
npm run test:all

# Clean up
docker-compose -f docker-compose.test.yml down
```

## Test Coverage

The tests cover:
- Database initialization and connection
- Schema creation
- CRUD operations (Create, Read, Update, Delete)
- Item ordering and reordering
- Status updates (todo, progress, completed)
- Resolve/unresolve functionality
- Status-based ordering in queries

## Test Environment Variables

### SQLite
- `TEST_SQLITE` - Set to `true` to enable SQLite tests (default: true)

### MySQL
- `TEST_MYSQL` - Set to `true` to enable MySQL tests (default: false)
- `MYSQL_HOST` - MySQL host (default: localhost)
- `MYSQL_PORT` - MySQL port (default: 3306)
- `MYSQL_DATABASE` - MySQL database name (default: learning_test)
- `MYSQL_USER` - MySQL username (default: root)
- `MYSQL_PASSWORD` - MySQL password (default: empty)

### PostgreSQL
- `TEST_POSTGRESQL` - Set to `true` to enable PostgreSQL tests (default: false)
- `POSTGRES_HOST` - PostgreSQL host (default: localhost)
- `POSTGRES_PORT` - PostgreSQL port (default: 5432)
- `POSTGRES_DATABASE` - PostgreSQL database name (default: learning_test)
- `POSTGRES_USER` - PostgreSQL username (default: postgres)
- `POSTGRES_PASSWORD` - PostgreSQL password (default: postgres)

## Notes

- SQLite uses an in-memory database (`:memory:`) for fast, isolated tests
- MySQL and PostgreSQL tests require actual database servers
- Tests clean up after themselves by deleting created test data
- Boolean values in SQLite are returned as 0/1, while MySQL and PostgreSQL return true/false
