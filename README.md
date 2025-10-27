# 🌍 Country Summary Service

## Project Overview
A RESTful API service that fetches and stores global country data — including population, currency, exchange rates, estimated GDP, and flag information — from the REST Countries API and ExchangeRate API. It caches this data in a MySQL database for efficient retrieval and analysis.

## ✨ Features
* Fetch and cache country data with automatic refresh
* Retrieve all countries or a single country by name
* Automatically estimate GDP using live exchange rates
* Generate a summary image (`summary.png`) with top-level metrics
* Supports refreshing cached data
* MySQL storage for persistent data
* Hosted and deployed on Railway

## 🧰 Tech Stack
* **Runtime:** Node.js / Express.js
* **Database:** MySQL (via Railway)
* **Libraries:** `axios`, `mysql2/promise`, `canvas`, `dotenv`, `fs`, `path`
* **External APIs:**
  * REST Countries API
  * ExchangeRate API

## ⚙️ Prerequisites
Before you begin, ensure you have:
* Node.js v18+
* Git
* MySQL Database with a public connection URL
* npm or yarn package manager

## 🧩 Installation

### Step 1: Clone the Repository
```bash
git clone https://github.com/JuszJo/hng-13-backend-2.git
cd hng-13-backend-2
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create a `.env` file in the project root:
```env
MYSQL_HOST=<your-mysql-host>
MYSQL_USER=<your-mysql-user>
MYSQL_PASSWORD=<your-mysql-password>
MYSQL_DATABASE=<your-mysql-database>
```

You can find these values in your Railway MySQL public connection string.

## 🧱 Database Setup
If you haven't created the required table yet, run:
```bash
node scripts/migrate.js
```

This creates the `countries` table if it doesn't exist.  
Safe to re-run anytime — uses `CREATE TABLE IF NOT EXISTS`.

## 🚀 Running Locally

### Development Mode
```bash
npm start
```

### Production Mode
```bash
npm run prod
```

By default, the server runs on http://localhost:3000.

## 🌐 API Endpoints

### GET /countries
Fetch all cached countries.

**Response (200 OK):**
```json
{
  "count": 250,
  "data": [
    {
      "name": "Nigeria",
      "capital": "Abuja",
      "region": "Africa",
      "population": 206139589,
      "currency_code": "NGN",
      "exchange_rate": 1635.52,
      "estimated_gdp": 337100000000,
      "flag_url": "https://flagcdn.com/ng.svg"
    }
  ]
}
```

### GET /countries/:name
Fetch a single country by name.

**Example:** `/countries/Nigeria`

**Response (200 OK):**
```json
{
  "name": "Nigeria",
  "population": 206139589,
  "currency_code": "NGN",
  "exchange_rate": 1635.52,
  "estimated_gdp": 337100000000,
  "flag_url": "https://flagcdn.com/ng.svg"
}
```

### POST /refresh
Refetch all data from the APIs and update the local cache.

**Response (200 OK):**
```json
{
  "message": "Data successfully refreshed."
}
```

## ☁️ Deployment (Railway)
1. Push your code to GitHub.
2. On Railway:
   * Create a new project.
   * Add a MySQL database service.
   * Create a Node.js service and link your repo.
   * In Variables, set your `.env` values.
3. Deploy — Railway will build and start your app automatically.

**Live endpoint example:**
```
https://hng-13-backend-2-production.up.railway.app
```

## 🧾 License
This project is open-sourced for HNG Backend Stage 2. Built with ❤️ by the Backend Wizards team.