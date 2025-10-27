// controllers/CountryController.js
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pool } from '../db.js';
// @ts-ignore
import { createCanvas, registerFont } from 'canvas'; // npm install canvas

// const SUMMARY_IMAGE_PATH = path.join(process.cwd(), 'cache', 'summary.png');


function randMultiplier() {
  // inclusive 1000..2000
  return Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
}

async function fetchCountries() {
  const url = 'https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies';
  const resp = await axios.get(url, { timeout: 15000 });
  return resp.data;
}

async function fetchExchangeRates() {
  const url = 'https://open.er-api.com/v6/latest/USD';
  const resp = await axios.get(url, { timeout: 15000 });
  return resp.data; // structure has 'rates' object
}

async function saveMetadata(conn, key, value) {
  await conn.query(
    `INSERT INTO metadata (\`k\`, \`v\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`v\` = VALUES(\`v\`)`,
    [key, String(value)]
  );
}

async function getMetadata(conn, key) {
  const [rows] = await conn.query('SELECT v FROM metadata WHERE `k` = ? LIMIT 1', [key]);
  return rows.length ? rows[0].v : null;
}

async function generateSummaryImage(total, top5, timestampIso) {
  // Ensure cache dir exists
  // const cacheDir = path.dirname(SUMMARY_IMAGE_PATH);
  // if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px Sans';
  ctx.fillText('Country Currency Summary', 40, 60);

  ctx.font = '20px Sans';
  ctx.fillText(`Total countries: ${total}`, 40, 100);
  ctx.fillText(`Last refreshed: ${timestampIso}`, 40, 130);

  ctx.font = '24px Sans';
  ctx.fillText('Top 5 Countries by Estimated GDP', 40, 180);

  ctx.font = '18px Sans';
  let y = 220;
  for (const c of top5) {
    const line = `${c.name} — ${c.estimated_gdp === null ? 'N/A' : Number(c.estimated_gdp).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    ctx.fillText(line, 60, y);
    y += 34;
  }

  const buffer = canvas.toBuffer('image/png');

  return buffer;
  // fs.writeFileSync(SUMMARY_IMAGE_PATH, buffer);
}

const CountryController = {
  // @ts-ignore
  async refreshCountry(req, res) {
    try {
      // fetch external APIs first (don't touch DB until both succeed)
      let countriesData;
      let exchangeData;
      try {
        [countriesData, exchangeData] = await Promise.all([fetchCountries(), fetchExchangeRates()]);
      } catch (err) {
        console.error('External API fetch error', err && err.message ? err.message : err);
        res.status(503).json({
          error: 'External data source unavailable',
          details: 'Could not fetch data from countries or exchange rates API'
        });
        return;
      }

      if (!exchangeData || !exchangeData.rates) {
        res.status(503).json({
          error: 'External data source unavailable',
          details: 'Could not fetch data from exchange rates API'
        });
        return;
      }
      const rates = exchangeData.rates;

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const now = new Date();
        const isoNow = now.toISOString().slice(0, 19).replace('T', ' ');

        // First, fetch all existing countries in ONE query
        const [existingCountries] = await conn.query(
          'SELECT id, LOWER(name) as name_lower FROM countries'
        );

        // Create a map for O(1) lookups
        const existingMap = new Map();
        // @ts-ignore
        existingCountries.forEach(row => {
          existingMap.set(row.name_lower, row.id);
        });

        const toInsert = [];
        const toUpdate = [];
        const processedCountries = [];

        // Process all countries (no DB queries in loop!)
        for (const c of countriesData) {
          const name = c.name || null;
          const population = (typeof c.population === 'number') ? c.population : null;
          const capital = c.capital || null;
          const region = c.region || null;
          const flag_url = c.flag || null;
          let currency_code = null;
          let exchange_rate = null;
          let estimated_gdp = null;

          // currency handling
          if (Array.isArray(c.currencies) && c.currencies.length > 0 && c.currencies[0] && c.currencies[0].code) {
            currency_code = c.currencies[0].code;
            if (currency_code in rates) {
              exchange_rate = Number(rates[currency_code]);
              const mult = randMultiplier();
              if (population !== null && exchange_rate !== 0) {
                estimated_gdp = (population * mult) / exchange_rate;
              }
            }
          }

          // Validate required fields
          if (!name || population === null || Number.isNaN(population)) {
            console.warn(`Skipping invalid country: ${name}`);
            continue;
          }

          const countryData = {
            name,
            capital,
            region,
            population,
            currency_code,
            exchange_rate,
            estimated_gdp,
            flag_url,
            last_refreshed_at: isoNow,
          };

          const existingId = existingMap.get(name.toLowerCase());

          if (existingId) {
            toUpdate.push({ ...countryData, id: existingId });
          } else {
            toInsert.push(countryData);
          }

          processedCountries.push(countryData);
        }

        console.log(toInsert.length);

        // Batch INSERT
        if (toInsert.length > 0) {
          const insertValues = toInsert.map(c => [
            c.name, c.capital, c.region, c.population,
            c.currency_code, c.exchange_rate, c.estimated_gdp,
            c.flag_url, c.last_refreshed_at
          ]);

          await conn.query(
            `INSERT INTO countries 
             (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at) 
             VALUES ?`,
            [insertValues]
          );
          console.log(`✅ Inserted ${toInsert.length} new countries`);
        }

        console.log(toUpdate.length);

        // Batch UPDATE
        if (toUpdate.length > 0) {
          const ids = toUpdate.map(c => c.id);
          const capitalCase = toUpdate.map(c => `WHEN ${c.id} THEN ${conn.escape(c.capital)}`).join(' ');
          const regionCase = toUpdate.map(c => `WHEN ${c.id} THEN ${conn.escape(c.region)}`).join(' ');
          const populationCase = toUpdate.map(c => `WHEN ${c.id} THEN ${c.population}`).join(' ');
          const currencyCase = toUpdate.map(c => `WHEN ${c.id} THEN ${conn.escape(c.currency_code)}`).join(' ');
          const exchangeCase = toUpdate.map(c => `WHEN ${c.id} THEN ${c.exchange_rate}`).join(' ');
          const gdpCase = toUpdate.map(c => `WHEN ${c.id} THEN ${c.estimated_gdp}`).join(' ');
          const flagCase = toUpdate.map(c => `WHEN ${c.id} THEN ${conn.escape(c.flag_url)}`).join(' ');
          const timestampCase = toUpdate.map(c => `WHEN ${c.id} THEN ${conn.escape(c.last_refreshed_at)}`).join(' ');
        
          await conn.query(`
            UPDATE countries
            SET 
              capital = CASE id ${capitalCase} END,
              region = CASE id ${regionCase} END,
              population = CASE id ${populationCase} END,
              currency_code = CASE id ${currencyCase} END,
              exchange_rate = CASE id ${exchangeCase} END,
              estimated_gdp = CASE id ${gdpCase} END,
              flag_url = CASE id ${flagCase} END,
              last_refreshed_at = CASE id ${timestampCase} END
            WHERE id IN (${ids.join(',')})
          `);
          console.log(`✅ Updated ${toUpdate.length} existing countries`);
        }

        // update metadata
        await saveMetadata(conn, 'last_refreshed_at', (new Date()).toISOString());

        // commit transaction
        await conn.commit();

        console.log("DONE");

        res.status(200).json({
          success: true,
          total_processed: processedCountries.length,
          last_refreshed_at: (new Date()).toISOString()
        });

      } catch (dbErr) {
        await conn.rollback();
        console.error('DB transaction failed, rolled back', dbErr);
        throw dbErr;
      } finally {
        conn.release();
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getAllCountries(req, res) {
    try {
      const region = req.query.region;
      const currency = req.query.currency;
      const sort = req.query.sort; // e.g. gdp_desc

      const params = [];
      let where = 'WHERE 1=1';
      if (region) {
        where += ' AND region = ?';
        params.push(region);
      }
      if (currency) {
        where += ' AND currency_code = ?';
        params.push(currency);
      }

      let orderBy = 'ORDER BY name ASC';
      if (sort === 'gdp_desc') {
        orderBy = 'ORDER BY estimated_gdp DESC';
      } else if (sort === 'gdp_asc') {
        orderBy = 'ORDER BY estimated_gdp ASC';
      } else if (sort === 'population_desc') {
        orderBy = 'ORDER BY population DESC';
      }

      const sql = `SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries ${where} ${orderBy}`;
      const [rows] = await pool.query(sql, params);
      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getCountryByName(req, res) {
    try {
      const name = req.params.name;
      if (!name) {
        res.status(400).json({ error: 'Validation failed', details: { name: 'is required' } })

        return;
      };

      const [rows] = await pool.query('SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
      // @ts-ignore
      if (!rows.length) {
        res.status(404).json({ error: 'Country not found' });

        return;
      }
      res.json(rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteCountryByName(req, res) {
    try {
      const name = req.params.name;
      if (!name) {
        res.status(400).json({ error: 'Validation failed', details: { name: 'is required' } });

        return
      }

      const [result] = await pool.query('DELETE FROM countries WHERE LOWER(name) = LOWER(?)', [name]);
      // @ts-ignore
      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Country not found' });

        return
      }
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // @ts-ignore
  async getSummaryImage(req, res) {
    const conn = await pool.getConnection();
    try {
      const [countRows] = await conn.query('SELECT COUNT(*) as cnt FROM countries');
      const total = countRows[0].cnt || 0;
      const [topRows] = await conn.query(
        'SELECT name, estimated_gdp FROM countries ORDER BY estimated_gdp IS NULL, estimated_gdp DESC LIMIT 5'
      );

      // Generate image and get buffer
      const imageBuffer = await generateSummaryImage(total, topRows, (new Date()).toISOString());

      // Send image as response
      res.set('Content-Type', 'image/png');
      res.send(imageBuffer);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      conn.release();
    }
  },

  // @ts-ignore
  async countryStatus(req, res) {
    try {
      const [countRows] = await pool.query('SELECT COUNT(*) as cnt FROM countries');
      const total = countRows[0].cnt || 0;

      const conn = await pool.getConnection();
      try {
        const last = await getMetadata(conn, 'last_refreshed_at');
        conn.release();
        res.json({ total_countries: total, last_refreshed_at: last });
      } catch (err) {
        conn.release();
        console.error(err);
        res.json({ total_countries: total, last_refreshed_at: null });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

export default CountryController