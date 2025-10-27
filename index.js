import dotenv from "dotenv";

dotenv.config();

import express from "express";
import { pinoLogger } from "./config/pino.config.js";
import useRoutes from "./routes/routes.js";

import fs from 'fs';
import { pool } from './db.js';

const sql = fs.readFileSync('./migrations/create_tables.sql', 'utf8');


const app = express();

app.use(express.json());

app.set('trust proxy', 1);

app.use(pinoLogger);

const PORT = process.env.PORT || 3000;

useRoutes(app);

app.listen(PORT, async () => {
  console.log(`Listening on http://localhost:${PORT}`);

  await pool.query(sql);
  console.log('Schema applied successfully');
})