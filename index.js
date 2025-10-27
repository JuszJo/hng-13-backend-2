import dotenv from "dotenv";

dotenv.config();

import express from "express";
import { pinoLogger } from "./config/pino.config.js";
import useRoutes from "./routes/routes.js";

const app = express();

app.use(express.json());

app.set('trust proxy', 1);

app.use(pinoLogger);

const PORT = process.env.PORT || 3000;

useRoutes(app);

app.listen(PORT, async () => {
  console.log(`Listening on http://localhost:${PORT}`);
})