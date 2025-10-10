# Learning Tracker

A twelve-factor application designed for learning and demonstrating cloud-native development practices, container deployments, and microservices architecture.

## Features

- ✅ Track learning goals and progress
- 📊 Organize goals by status (Todo, In Progress, Completed)
- 🎯 Drag and drop functionality for easy management
- 🔄 RESTful API for integration
- 🚀 Multiple deployment modes for flexible architecture
- 🐳 Container-ready with Docker support
- ☸️ Kubernetes deployment examples

## Quick Start

### All-in-One Mode (Default)

```bash
cd app
npm install
npm start
```

Visit `http://localhost:3000` to use the application.

## Deployment Modes

The Learning Tracker supports three deployment modes to fit different architectural needs:

### 1. **All-in-One Mode** (Default)
Single process serving both frontend and API with database access.
- Best for: Development, simple deployments, small-scale applications
- Command: `npm start` or `npm run start:all-in-one`

### 2. **API Mode**
Backend-only service exposing RESTful APIs with database access.
- Best for: Microservices architecture, separate frontend deployments
- Command: `APP_MODE=api npm start` or `npm run start:api`
- Endpoints: `/api/items`, `/api/items/:id`, etc.

### 3. **Frontend Mode**
Frontend-only service that connects to a separate API backend.
- Best for: Independent frontend scaling, CDN deployments, edge locations
- Command: `APP_MODE=frontend API_BASE_URL=http://api:3000 npm start`
- Requires: `API_BASE_URL` environment variable

See [DEPLOYMENT_MODES.md](./DEPLOYMENT_MODES.md) for detailed documentation.

## Environment Variables

| Variable | Description | Default | Modes |
|----------|-------------|---------|-------|
| `APP_MODE` | Deployment mode: `all-in-one`, `api`, or `frontend` | `all-in-one` | All |
| `API_BASE_URL` | API server URL (required in frontend mode) | `http://localhost:3000` | frontend |
| `PORT` | Server port | `3000` | All |
| `DB_TYPE` | Database type: `sqlite` or `mysql` | `sqlite` | api, all-in-one |
| `DB_HOST` | Database host | `localhost` | api, all-in-one |
| `DB_PORT` | Database port | `3306` | api, all-in-one |
| `DB_NAME` | Database name/path | `learning.db` | api, all-in-one |
| `DB_USER` | Database username | `root` | api, all-in-one |
| `DB_PASSWORD` | Database password | `` | api, all-in-one |
| `LOG_LEVEL` | Logging level | `info` | All |
| `LOG_OUTPUT` | Log destination: `file` or `console` | `file` | All |

## API Endpoints

When running in `api` or `all-in-one` mode:

- `GET /api/items` - Get all learning items
- `POST /api/items` - Create a new item
- `DELETE /api/items/:id` - Delete an item
- `POST /api/items/:id/status` - Update item status
- `POST /api/items/:id/resolve` - Mark item as resolved
- `POST /api/items/:id/unresolve` - Mark item as unresolved
- `POST /api/items/reorder` - Reorder items
- `GET /health` - Health check endpoint

## Docker Deployment

### Building Images

```bash
# All-in-one mode (default)
docker build -t learning-tracker .

# API mode
docker build -f Dockerfile.api -t learning-tracker:api .

# Frontend mode
docker build -f Dockerfile.frontend -t learning-tracker:frontend .
```

### Running Containers

```bash
# All-in-one mode (default)
docker run -p 3000:3000 learning-tracker

# API mode
docker run -p 3000:3000 -e DB_TYPE=sqlite learning-tracker:api

# Frontend mode (requires API running)
docker run -p 8080:8080 -e API_BASE_URL=http://api:3000 learning-tracker:frontend
```

## Kubernetes Deployment

Example manifests are provided for:
- All-in-one deployment: `learning-tracker-deployment.yaml`
- Database: `mariadb-deployment.yaml`
- Pod example: `learning-tracker-pod.yaml`

### Multi-Replica Deployments

When deploying with multiple API replicas (horizontal scaling), be aware of the following considerations:

#### Database Selection

**⚠️ SQLite Mode:**
- **Single-replica deployments only** (development/testing)
- SQLite uses file-based storage with a single-writer limitation
- Multiple replicas writing to the same SQLite file will cause write conflicts and data corruption
- Not suitable for Kubernetes deployments with `replicas > 1`

**✅ MySQL/MariaDB Mode (Recommended for Production):**
- Supports multiple concurrent connections from different replicas
- Connection pooling enabled (10 connections per replica)
- Handles concurrent writes safely with proper locking
- Recommended for production deployments with horizontal scaling

#### Configuration Example

```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: learning-tracker-api
spec:
  replicas: 3  # Multiple replicas supported with MySQL
  template:
    spec:
      containers:
      - name: api
        image: ghcr.io/tsclabs-eu/learning-tracker-api:latest
        env:
        - name: APP_MODE
          value: "api"
        - name: DB_TYPE
          value: "mysql"  # Use MySQL for multi-replica
        - name: DB_HOST
          value: "mariadb-service"
        - name: DB_NAME
          value: "learning_tracker"
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
```

#### Schema Migrations

The application automatically creates the database schema on startup using `CREATE TABLE IF NOT EXISTS` logic. This is safe for multi-replica deployments because:
- Schema creation is idempotent
- MySQL handles concurrent DDL operations safely
- Column additions use error handling to ignore if already exists

For production environments, consider using an init container or migration job to ensure schema is created before API replicas start.

## Development

### Running Tests

```bash
cd app
npm test
```

### Running in Development Mode

```bash
cd app
npm run dev
```

### Testing Different Modes

```bash
# Test API mode
APP_MODE=api npm start

# In another terminal, test frontend mode
APP_MODE=frontend API_BASE_URL=http://localhost:3000 PORT=8080 npm start
```

## Architecture

The application follows the twelve-factor app methodology:

1. **Codebase** - Single codebase tracked in Git
2. **Dependencies** - Explicitly declared in package.json
3. **Config** - Environment-based configuration
4. **Backing Services** - Database treated as attached resource
5. **Build, Release, Run** - Strictly separated stages
6. **Processes** - Stateless, share-nothing processes
7. **Port Binding** - Self-contained with Express server
8. **Concurrency** - Scale via process model (multiple modes)
9. **Disposability** - Fast startup and graceful shutdown
10. **Dev/Prod Parity** - Keep environments similar
11. **Logs** - Treat logs as event streams
12. **Admin Processes** - Run as one-off processes

## Technology Stack

- **Backend**: Node.js with Express
- **Frontend**: EJS templates with vanilla JavaScript
- **Databases**: SQLite (default) or MySQL/MariaDB
- **Logging**: Winston
- **HTTP Client**: Axios (for frontend mode)

## Contributing

This is an educational project. Feel free to fork, experiment, and learn!

## License

Apache-2.0 - See [LICENSE](./LICENSE) for details.

## Disclaimer

⚠️ **This application is built for educational and demonstration purposes only.**
It's designed to help learn about containers, cloud-native development, and twelve-factor app principles.
**Do not use in production environments.**

---

© 2025 TSC Labs e.U.
