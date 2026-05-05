# IP Dashboard
A simple, modern IP address monitoring dashboard with bulk scan, port scan, and auto network detection!

## Features
- Dashboard overview with total/online/offline counts
- Auto network range auto-detect (with adapter prioritization)
- Bulk IP scan (CIDR/start-end range support)
- Port scan on responsive devices
- Hostname lookup
- Watchlist with custom intervals
- Docker support

## Quick Start

### Development
```bash
npm install
npm run dev
```
Frontend: http://localhost:3000
Backend API: http://localhost:3001

### Docker
```bash
docker-compose up -d
```
Access at http://localhost:3001

### Production Build
```bash
npm run build
npm start
```

## Tech Stack
- Backend: Node.js + Express + SQLite
- Frontend: Vue 3 + Vite + Tailwind CSS

## License
MIT
