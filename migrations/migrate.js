import fs from 'fs';
import { pool } from '../db.js';

const sql = fs.readFileSync('./migrations/create_tables.sql', 'utf8');

(async () => {
  await pool.query(sql);
  console.log('Schema applied successfully');
  process.exit(0);
})();
