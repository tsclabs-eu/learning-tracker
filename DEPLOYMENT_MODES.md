# Learning Tracker - Deployment Modes

The Learning Tracker application can be deployed in three different modes to support various architectural patterns.

## Available Modes

### 1. All-in-One Mode (Default)
Runs both the frontend and API in a single process with direct database access.

**Use Case:** Simple deployments, development, small-scale applications

**Configuration:**
```bash
APP_MODE=all-in-one
PORT=3000
# ... other database config
```

**Start Command:**
```bash
npm start
# or
npm run start:all-in-one
```

**Features:**
- Single process handles both frontend and API
- Direct database connections
- Legacy endpoints (`/add`, `/delete/:id`, etc.) remain functional
- RESTful API endpoints (`/api/items`, etc.) also available
- Lowest latency, simplest deployment

---

### 2. API Mode
Runs only the API server with database access. No frontend is served.

**Use Case:** Microservices architecture, separate frontend deployment, mobile app backend

**Configuration:**
```bash
APP_MODE=api
PORT=3000
# ... database config required
```

**Start Command:**
```bash
npm run start:api
```

**Features:**
- Only serves API endpoints under `/api/*`
- Direct database access
- Health check available at `/health`
- No static files or views served
- Suitable for backend-only deployments

**API Endpoints:**
- `GET /api/items` - Get all learning items
- `POST /api/items` - Create new item
- `DELETE /api/items/:id` - Delete item
- `POST /api/items/:id/status` - Update item status
- `POST /api/items/:id/resolve` - Mark item as resolved
- `POST /api/items/:id/unresolve` - Mark item as unresolved
- `POST /api/items/reorder` - Reorder items
- `GET /health` - Health check

---

### 3. Frontend Mode
Runs only the frontend server. All API calls are proxied to an external API service.

**Use Case:** Separate frontend/backend deployments, CDN-hosted frontends, scaling frontend independently

**Configuration:**
```bash
APP_MODE=frontend
PORT=8080
API_BASE_URL=http://api-server:3000  # Required: URL of the API server
```

**Start Command:**
```bash
# Set API_BASE_URL to point to your API server
API_BASE_URL=http://localhost:3000 npm run start:frontend
```

**Features:**
- Serves only the web UI (HTML, CSS, JS)
- No database connection required
- All data operations proxied to external API via `API_BASE_URL`
- Can be scaled independently from the backend
- Suitable for edge deployments or CDN scenarios

---

## Environment Variables

| Variable | Description | Default | Required In |
|----------|-------------|---------|-------------|
| `APP_MODE` | Application mode: `all-in-one`, `frontend`, or `api` | `all-in-one` | All modes |
| `API_BASE_URL` | Base URL for API server (used in frontend mode) | `http://localhost:3000` | **frontend mode** |
| `PORT` | Server port | `3000` | All modes |
| `DB_TYPE` | Database type: `sqlite` or `mysql` | `sqlite` | api, all-in-one |
| `DB_HOST` | Database host | `localhost` | api, all-in-one (mysql) |
| `DB_PORT` | Database port | `3306` | api, all-in-one (mysql) |
| `DB_NAME` | Database name | `learning.db` | api, all-in-one |
| `DB_USER` | Database username | `root` | api, all-in-one (mysql) |
| `DB_PASSWORD` | Database password | `` | api, all-in-one (mysql) |
| `LOG_LEVEL` | Logging level | `info` | All modes |
| `LOG_OUTPUT` | Log output: `file` or `console` | `file` | All modes |

---

## Example Deployments

### Docker - All-in-One

```bash
# Build and run
docker build -t learning-tracker .
docker run -p 3000:3000 learning-tracker
```

### Docker - Separate Frontend and API

```bash
# Build images
docker build -f Dockerfile.api -t learning-tracker:api .
docker build -f Dockerfile.frontend -t learning-tracker:frontend .

# Start database
docker run -d --name db \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=learning \
  mariadb:latest

# Start API
docker run -d --name api \
  -e APP_MODE=api \
  -e DB_TYPE=mysql \
  -e DB_HOST=db \
  -e DB_NAME=learning \
  -e DB_USER=root \
  -e DB_PASSWORD=secret \
  -p 3000:3000 \
  --link db:db \
  learning-tracker:api

# Start frontend
docker run -d --name frontend \
  -e APP_MODE=frontend \
  -e API_BASE_URL=http://api:3000 \
  -p 8080:8080 \
  --link api:api \
  learning-tracker:frontend
```

### Kubernetes - Separate Deployments

```yaml
# API Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: learning-tracker-api
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: api
        image: learning-tracker:latest
        env:
        - name: APP_MODE
          value: "api"
        - name: DB_TYPE
          value: "mysql"
        # ... other DB config
        ports:
        - containerPort: 3000

---
# Frontend Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: learning-tracker-frontend
spec:
  replicas: 3  # Scale frontend independently
  template:
    spec:
      containers:
      - name: frontend
        image: learning-tracker:latest
        env:
        - name: APP_MODE
          value: "frontend"
        - name: API_BASE_URL
          value: "http://learning-tracker-api:3000"
        ports:
        - containerPort: 8080
```

---

## Health Checks

All modes expose a `/health` endpoint:

**All-in-One Mode:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-10T12:00:00.000Z",
  "config": {
    "mode": "all-in-one",
    "port": 3000,
    "database_type": "sqlite",
    "log_output": "file",
    "api_base_url": "N/A"
  }
}
```

**Frontend Mode:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-10T12:00:00.000Z",
  "config": {
    "mode": "frontend",
    "port": 8080,
    "database_type": "N/A",
    "log_output": "console",
    "api_base_url": "http://api-server:3000"
  }
}
```

---

## Migration Guide

### From Legacy Single-Mode to Multi-Mode

If you're upgrading from a previous version:

1. **No changes required for default behavior** - The app defaults to `all-in-one` mode
2. **Legacy endpoints still work** in `all-in-one` mode for backwards compatibility
3. **To split your deployment:**
   - Set `APP_MODE=api` on backend instances
   - Set `APP_MODE=frontend` and `API_BASE_URL` on frontend instances
   - Remove frontend instances from backend load balancer (or use path-based routing)

### Testing Your Deployment

```bash
# Test API mode
APP_MODE=api npm start
curl http://localhost:3000/api/items

# Test Frontend mode (in separate terminals)
APP_MODE=api npm start
APP_MODE=frontend API_BASE_URL=http://localhost:3000 PORT=8080 npm start

# Test All-in-One mode
npm start
```
