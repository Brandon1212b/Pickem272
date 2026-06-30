# 🏈 Pickem272 - NFL Pick'em Fantasy League

An interactive web application where football fans predict the winner of every NFL game across an entire season (272 games total), track their standings on a leaderboard, and compete with friends.

**Live Demo:** [Pickem272 on Replit](https://pickem272.brandon1212b.repl.co)

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development](#development)
- [How to Play](#how-to-play)
- [Contributing](#contributing)

---

## ✨ Features

### 🎮 Game Picking
- **Pick all 272 NFL games** organized by week
- **Point spread display** for each matchup (Vegas odds)
- **Team-based filtering** to browse picks by individual NFL team
- **Autofill tools** for quick picking:
  - Home teams
  - Away teams
  - Vegas spread favorites
  - Random selections
- **Countdown timer** showing when picks lock at season start
- **Locked/submitted view** with pick summary and team records

### 📊 Leaderboard & Tracking
- **Real-time standings** with current scores and win-loss records
- **Leaderboard trends** visualization over the season
- **Weekly performance** charts and statistics
- **Badge system** for achievements (Perfect Week, League Leader, etc.)
- **Team records** - shows how each NFL team performs based on user picks

### 💬 Social Features
- **Smack talk chat** on the dashboard for friendly competition
- **User avatars** with automatic color assignment
- **User profiles** with join date tracking

### 🛠️ Admin Tools
- **Set match results** from completed games
- **ESPN live score integration** - fetch real scores automatically
- **Season mode management** (pre-season/in-season transitions)
- **Pick data management** and user administration

---

## 🛠️ Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** - fast build tool and dev server
- **Wouter** - lightweight client-side router
- **TanStack React Query** - data fetching, caching, and mutations
- **React Hook Form + Zod** - form validation
- **Radix UI** - accessible UI component primitives
- **Tailwind CSS v4** - utility-first styling with custom themes
- **Framer Motion** - smooth animations
- **Recharts** - data visualization for leaderboards
- **Sonner** - toast notifications
- **Lucide React** - icon library
- **Custom team logos & colors system**

### Backend
- **Express.js v5.2.1** - REST API server
- **Node.js** with TypeScript
- **PostgreSQL** - relational database
- **Drizzle ORM** - type-safe database queries
- **Zod** - runtime type validation
- **Pino** - structured logging with HTTP middleware
- **CORS middleware** for cross-origin requests

### Database Schema
```sql
-- Users
users (id, name, avatar, createdAt)

-- NFL Matches
matches (id, week, homeTeam, awayTeam, winner, isCompleted, pointSpread, injuryWeatherFlags, gameTime)

-- User Picks
picks (id, userId, matchId, selectedTeam, isLock, pointsEarned, updatedAt)

-- Smack Messages
smackMessages (id, userId, week, message, createdAt)
```

### Architecture
Monorepo using **pnpm workspaces**:
- `artifacts/nfl-pickem/` - React frontend application
- `artifacts/api-server/` - Express REST API server
- `artifacts/mockup-sandbox/` - UI component preview environment
- `lib/db/` - Database schemas and Drizzle ORM setup
- `lib/api-zod/` - Shared type definitions with Zod
- `lib/api-client-react/` - Auto-generated React Query hooks
- `scripts/` - Utility scripts for seeding and data management

---

## 📁 Project Structure

```
Pickem272/
├── artifacts/
│   ├── nfl-pickem/              # React frontend app
│   │   ├── src/
│   │   │   ├── pages/           # Route pages (picks, leaderboard, admin, etc.)
│   │   │   ├── components/      # Reusable UI components
│   │   │   ├── lib/             # Utilities (auth, team logos, colors)
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   └── vite.config.ts
│   ├── api-server/              # Express backend API
│   │   ├── src/
│   │   │   ├── app.ts           # Express app setup
│   │   │   ├── index.ts         # Server entry point
│   │   │   └── lib/
│   │   └── build.mjs
│   └── mockup-sandbox/          # Component preview environment
├── lib/
│   ├── db/                      # Database layer
│   │   ├── src/
│   │   │   ├── index.ts         # Drizzle setup
│   │   │   └── schema/          # Table definitions
│   │   └── tsconfig.json
│   ├── api-zod/                 # Shared type definitions
│   └── api-client-react/        # Generated API hooks
├── scripts/
│   ├── src/
│   │   ├── hello.ts
│   │   └── seed-schedule.ts     # Data seeding script
│   └── package.json
├── package.json                 # Workspace root
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ (or use the provided Replit environment)
- **pnpm** package manager
- **PostgreSQL** database (create via Replit databases or locally)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Brandon1212b/Pickem272.git
   cd Pickem272
   ```

2. **Install dependencies using pnpm**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/pickem272
   PORT=3000
   NODE_ENV=development
   ```

4. **Set up the database**
   ```bash
   # Run migrations (if applicable)
   cd lib/db
   pnpm run migrate
   ```

5. **Seed initial data** (optional)
   ```bash
   pnpm run seed-schedule
   ```

### Development

**Start the dev environment:**
```bash
pnpm run dev
```

This will run:
- Backend API server on `http://localhost:3000`
- Frontend development server (configured in Vite)

**Type checking across workspaces:**
```bash
pnpm run typecheck
```

**Build for production:**
```bash
pnpm run build
```

---

## 🎮 How to Play

1. **Login** with your name to join the league
2. **Pick winners** for all 272 NFL games before the season starts
   - Browse by week or filter by team
   - Use autofill tools to quickly complete your picks
3. **Submit all picks** before the season opener (countdown timer shown)
4. **Watch results** - the commissioner enters game results as the season progresses
5. **Check leaderboard** to track your standing against other players
6. **Earn points** - 1 point per correct pick, no penalties for wrong picks

### Scoring
- ✅ **Correct pick** = +1 point
- ❌ **Wrong pick** = 0 points
- No negative points

---

## 🔧 Development Guide

### Key Technologies to Understand

**Frontend Data Flow:**
1. React Query handles all API caching and synchronization
2. Wouter provides client-side routing
3. Zod validates form inputs before sending to server
4. Framer Motion adds smooth animations for UX

**Backend API:**
- Express.js routes handle HTTP requests
- Drizzle ORM manages PostgreSQL queries
- Pino logging captures request/response data
- All responses validated with Zod schemas

**Database:**
- Drizzle ORM generates type-safe query builders
- Schemas defined in `lib/db/src/schema/`
- Use connection pool from `lib/db/src/index.ts`

### Adding a New Feature

1. Define database schema in `lib/db/src/schema/`
2. Create API endpoint in `artifacts/api-server/src/`
3. Generate React Query hooks (auto-generated via monorepo setup)
4. Build UI component in `artifacts/nfl-pickem/src/components/` or pages
5. Update types in `lib/api-zod/`

### Code Quality

```bash
# Type check
pnpm run typecheck

# Build
pnpm run build

# Format (if configured)
pnpm run format
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes** and test thoroughly
4. **Commit with clear messages** (`git commit -m 'Add amazing feature'`)
5. **Push to your branch** (`git push origin feature/amazing-feature`)
6. **Open a Pull Request** with a description of your changes

### Development Ideas
- Real-time game updates with WebSockets
- Multi-season support and historical tracking
- Stat-based pick suggestions (team form, head-to-head)
- Mobile app (React Native)
- Pick pools and tournament brackets
- Injury/weather-based pick recommendations
- Prediction confidence levels
- Social sharing features

---

## 📝 License

This project is licensed under the MIT License — see the LICENSE file for details.

---

## 🙋 Questions & Support

- **Issues?** Open a [GitHub Issue](https://github.com/Brandon1212b/Pickem272/issues)
- **Suggestions?** Create a [GitHub Discussion](https://github.com/Brandon1212b/Pickem272/discussions)
- **Questions?** Check the Help page in the app for rules and gameplay details

---

## 📊 Project Stats

- **Languages:** TypeScript, React, Node.js
- **Database:** PostgreSQL
- **Framework:** React + Express
- **Deployment:** Replit
- **Total Games:** 272 (18 weeks × 16 games)
- **Total Teams:** 32 NFL teams

---

**Built with ❤️ by Brandon1212b**

Happy picking! 🏈
