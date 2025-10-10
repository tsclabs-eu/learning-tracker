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
