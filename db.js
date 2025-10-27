import mysql from "mysql2/promise";

import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || '127.0.0.1',
  port: process.env.MYSQLPORT ? Number(process.env.MYSQLPORT) : 3306,
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'country_cache',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export { pool }
