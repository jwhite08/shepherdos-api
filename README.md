# ShepherdOS API — Setup Guide

This is the backend for ShepherdOS. It runs alongside your existing
frontend (shepherdos-app) and handles all database operations.

---

## What This Does

- Connects to a local PostgreSQL database
- Exposes a REST API your React frontend can call
- Handles member and family CRUD operations
- Enforces multi-tenant data isolation (each church only sees their data)
- Handles login and authentication with JWT tokens

---

## Folder Structure

```
shepherdos-api/
├── prisma/
│   ├── schema.prisma     ← Database table definitions
│   └── seed.js           ← Sample data for development
├── src/
│   ├── index.js          ← Express app entry point
│   ├── lib/
│   │   └── prisma.js     ← Database client
│   ├── middleware/
│   │   └── auth.js       ← JWT authentication
│   ├── routes/
│   │   ├── auth.js       ← Login endpoint
│   │   ├── members.js    ← Member routes
│   │   ├── families.js   ← Family routes
│   │   └── dashboard.js  ← Dashboard stats
│   └── controllers/
│       └── members.controller.js
├── .env.example          ← Environment variable template
├── .gitignore
└── package.json
```

---

## Step 1: Install PostgreSQL

PostgreSQL is the database that stores all ShepherdOS data.

### Windows

1. Go to: https://www.postgresql.org/download/windows/
2. Click **Download the installer** (choose the latest version, e.g. 16.x)
3. Run the installer. When prompted:
   - Accept the default installation directory
   - **Set a password for the `postgres` user** — write this down, you'll need it
   - Leave the port as **5432** (default)
   - Leave the locale as default
4. Finish the installation. You do NOT need to install Stack Builder — click Skip.
5. Open the **pgAdmin 4** app that was installed (search for it in the Start menu)
   to confirm PostgreSQL is running.

### Mac

The easiest option on Mac is Postgres.app:
1. Go to: https://postgresapp.com
2. Download and drag it to your Applications folder
3. Open it and click **Initialize**
4. Click the elephant icon in your menu bar → it should say "Running"

---

## Step 2: Create the Database

Once PostgreSQL is installed, you need to create a database called `shepherdos_dev`.

### Option A: Using pgAdmin (Windows — easier)
1. Open pgAdmin 4
2. In the left panel, expand Servers → PostgreSQL → right-click **Databases**
3. Click **Create → Database**
4. Name it: `shepherdos_dev`
5. Click **Save**

### Option B: Using the terminal (Mac or Windows)
Open your terminal and run:

```bash
psql -U postgres
```

It will prompt for your password (the one you set during installation). Then run:

```sql
CREATE DATABASE shepherdos_dev;
\q
```

---

## Step 3: Set Up Environment Variables

1. In the `shepherdos-api` folder, copy the example file:

```bash
# Mac/Linux:
cp .env.example .env

# Windows (Command Prompt):
copy .env.example .env
```

2. Open `.env` in your code editor and update the `DATABASE_URL` line:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/shepherdos_dev"
```

Replace `YOUR_PASSWORD` with the password you set when installing PostgreSQL.

3. Also update the `JWT_SECRET` line with any long random string:

```
JWT_SECRET="some-long-random-string-you-made-up-change-this"
```

---

## Step 4: Install Dependencies

In your terminal, navigate to the `shepherdos-api` folder:

```bash
cd shepherdos-api
npm install
```

This installs Express, Prisma, and all other dependencies. It may take a minute.

---

## Step 5: Run Database Migrations

This creates all the tables in your database based on the schema:

```bash
npm run db:migrate
```

When prompted for a migration name, type something like: `initial_schema`

You should see output confirming each table was created.

---

## Step 6: Seed the Database

This loads sample data (Praise Cathedral, families, members, contributions):

```bash
npm run db:seed
```

You should see:
```
✓ Organization: Praise Cathedral
✓ Admin user: admin@praisecathedral.org (password: admin1234)
✓ Ministries & sub-departments created
✓ X members across X families
✓ Department assignments created
✓ X contributions seeded
✅ Seed complete!
```

---

## Step 7: Start the API Server

```bash
npm run dev
```

You should see:
```
🚀 ShepherdOS API running on http://localhost:4000
   Health: http://localhost:4000/health
```

Open http://localhost:4000/health in your browser to confirm it's running.
You should see: `{"status":"ok","service":"ShepherdOS API",...}`

---

## Step 8: Test the API (Optional but Recommended)

You can test the API using a tool like Postman or just your browser/terminal.

**Login:**
```
POST http://localhost:4000/api/auth/login
Body: { "email": "admin@praisecathedral.org", "password": "admin1234" }
```

This returns a token. Use that token in subsequent requests:
```
GET http://localhost:4000/api/members
Headers: Authorization: Bearer YOUR_TOKEN_HERE
```

---

## Useful Commands

| Command               | What it does                                          |
|-----------------------|-------------------------------------------------------|
| `npm run dev`         | Start the API server with auto-reload                 |
| `npm run db:migrate`  | Apply schema changes to the database                  |
| `npm run db:seed`     | Load sample data                                      |
| `npm run db:studio`   | Open Prisma Studio (visual database browser)          |
| `npm run db:reset`    | Wipe the database and re-run migrations + seed        |

**Prisma Studio** is especially helpful — run `npm run db:studio` and it opens
a visual browser at http://localhost:5555 where you can see and edit your
database records directly.

---

## Running Both Frontend and API at the Same Time

You'll need two terminal windows:

**Terminal 1 (API):**
```bash
cd shepherdos-api
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd shepherdos-app
npm run dev
```

The frontend runs on http://localhost:3000
The API runs on http://localhost:4000

---

## Deploying to the Cloud (When Ready)

When you're ready to go live:

- **Database:** AWS RDS for PostgreSQL or Google Cloud SQL for PostgreSQL
  - Both offer free tiers to start
  - You'll swap your `DATABASE_URL` in `.env` for the cloud connection string
- **API:** Railway (easiest), AWS Elastic Beanstalk, or Google Cloud Run
- **Frontend:** Vercel or Netlify (both free, one-click deploys from GitHub)

The code doesn't change — just the environment variables.
