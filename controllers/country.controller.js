// // controllers/CountryController.js
// import fs from 'fs';
// import path from 'path';
// import axios from 'axios';
// import { pool } from '../db.js';
// // @ts-ignore
// import { createCanvas, registerFont } from 'canvas'; // npm install canvas

// const SUMMARY_IMAGE_PATH = path.join(process.cwd(), 'cache', 'summary.png');


// function randMultiplier() {
//   // inclusive 1000..2000
//   return Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
// }

// async function fetchCountries() {
//   const url = 'https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies';
//   const resp = await axios.get(url, { timeout: 15000 });
//   return resp.data;
// }

// async function fetchExchangeRates() {
//   const url = 'https://open.er-api.com/v6/latest/USD';
//   const resp = await axios.get(url, { timeout: 15000 });
//   return resp.data; // structure has 'rates' object
// }

// async function saveMetadata(conn, key, value) {
//   await conn.query(
//     `INSERT INTO metadata (\`k\`, \`v\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`v\` = VALUES(\`v\`)`,
//     [key, String(value)]
//   );
// }

// async function getMetadata(conn, key) {
//   const [rows] = await conn.query('SELECT v FROM metadata WHERE `k` = ? LIMIT 1', [key]);
//   return rows.length ? rows[0].v : null;
// }

// async function generateSummaryImage(total, top5, timestampIso) {
//   // Ensure cache dir exists
//   const cacheDir = path.dirname(SUMMARY_IMAGE_PATH);
//   if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

//   const width = 1200;
//   const height = 630;
//   const canvas = createCanvas(width, height);
//   const ctx = canvas.getContext('2d');

//   // Background
//   ctx.fillStyle = '#ffffff';
//   ctx.fillRect(0, 0, width, height);

//   // Title
//   ctx.fillStyle = '#111827';
//   ctx.font = 'bold 36px Sans';
//   ctx.fillText('Country Currency Summary', 40, 60);

//   ctx.font = '20px Sans';
//   ctx.fillText(`Total countries: ${total}`, 40, 100);
//   ctx.fillText(`Last refreshed: ${timestampIso}`, 40, 130);

//   ctx.font = '24px Sans';
//   ctx.fillText('Top 5 Countries by Estimated GDP', 40, 180);

//   ctx.font = '18px Sans';
//   let y = 220;
//   for (const c of top5) {
//     const line = `${c.name} — ${c.estimated_gdp === null ? 'N/A' : Number(c.estimated_gdp).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
//     ctx.fillText(line, 60, y);
//     y += 34;
//   }

//   const buffer = canvas.toBuffer('image/png');
//   fs.writeFileSync(SUMMARY_IMAGE_PATH, buffer);
// }

// const CountryController = {
//   // @ts-ignore
//   async refreshCountry(req, res) {
//     try {
//       // fetch external APIs first (don't touch DB until both succeed)
//       let countriesData;
//       let exchangeData;
//       try {
//         [countriesData, exchangeData] = await Promise.all([fetchCountries(), fetchExchangeRates()]);
//       } catch (err) {
//         console.error('External API fetch error', err && err.message ? err.message : err);
//         return res.status(503).json({ error: 'External data source unavailable', details: 'Could not fetch data from countries or exchange rates API' });
//       }

//       if (!exchangeData || !exchangeData.rates) {
//         return res.status(503).json({ error: 'External data source unavailable', details: 'Could not fetch data from exchange rates API' });
//       }
//       const rates = exchangeData.rates; // map currencyCode -> rate (1 USD = ? currency); docs say based on USD

//       const conn = await pool.getConnection();
//       try {
//         await conn.beginTransaction();

//         const now = new Date();
//         const isoNow = now.toISOString();

//         // We'll collect rows for image generation later
//         const processedCountries = [];

//         for (const c of countriesData) {
//           const name = c.name || null;
//           const population = (typeof c.population === 'number') ? c.population : null;
//           const capital = c.capital || null;
//           const region = c.region || null;
//           const flag_url = c.flag || null;
//           let currency_code = null;
//           let exchange_rate = null;
//           let estimated_gdp = null;

//           // currency handling: pick first currency code if available
//           if (Array.isArray(c.currencies) && c.currencies.length > 0 && c.currencies[0] && c.currencies[0].code) {
//             currency_code = c.currencies[0].code;
//             // match against exchange rates
//             if (currency_code in rates) {
//               // Note: exchange API is latest/USD meaning 1 USD = rates[code] ??? 
//               // The spec expects exchange_rate like NGN -> 1600, so we'll use rates[currency_code]
//               exchange_rate = Number(rates[currency_code]);
//               // compute estimated_gdp = population × random(1000–2000) ÷ exchange_rate.
//               const mult = randMultiplier();
//               if (population !== null && exchange_rate !== 0) {
//                 estimated_gdp = (population * mult) / exchange_rate;
//               } else {
//                 estimated_gdp = null;
//               }
//             } else {
//               // currency_code not found in exchange rates API
//               exchange_rate = null;
//               estimated_gdp = null;
//             }
//           } else {
//             // currencies empty
//             currency_code = null;
//             exchange_rate = null;
//             estimated_gdp = 0;
//           }

//           // Validate required fields: name and population required by DB. If missing, skip the record
//           if (!name || population === null || Number.isNaN(population)) {
//             // skip this country (or we could store a partial). Spec says name and population required => return 400 for invalid or missing data.
//             // But during refresh, spec didn't instruct to abort on a single bad country. We'll skip invalid entries and continue.
//             console.warn(`Skipping invalid country entry (missing name/population): ${JSON.stringify({ name, population })}`);
//             continue;
//           }

//           // Upsert: match by name case-insensitive
//           // Check existing
//           const [existingRows] = await conn.query('SELECT id FROM countries WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
//           // @ts-ignore
//           if (existingRows.length) {
//             // update
//             await conn.query(
//               `UPDATE countries SET capital = ?, region = ?, population = ?, currency_code = ?, exchange_rate = ?, estimated_gdp = ?, flag_url = ?, last_refreshed_at = ? WHERE id = ?`,
//               [capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, isoNow, existingRows[0].id]
//             );
//           } else {
//             await conn.query(
//               `INSERT INTO countries (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//               [name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, isoNow]
//             );
//           }

//           processedCountries.push({
//             name,
//             capital,
//             region,
//             population,
//             currency_code,
//             exchange_rate,
//             estimated_gdp,
//             flag_url,
//             last_refreshed_at: isoNow,
//           });
//         } // end for

//         // update global last_refreshed_at in metadata
//         await saveMetadata(conn, 'last_refreshed_at', (new Date()).toISOString());

//         // commit transaction
//         await conn.commit();

//         // generate summary image (do this after commit; if it fails, DB is already updated — acceptable)
//         try {
//           // Need total countries count and top 5 by estimated_gdp (desc), ignoring null and zero? spec: top 5 by estimated GDP. We'll sort by estimated_gdp desc with nulls last.
//           const [countRows] = await conn.query('SELECT COUNT(*) as cnt FROM countries');
//           const total = countRows[0].cnt || 0;
//           const [topRows] = await conn.query('SELECT name, estimated_gdp FROM countries ORDER BY estimated_gdp IS NULL, estimated_gdp DESC LIMIT 5');
//           await generateSummaryImage(total, topRows, (new Date()).toISOString());
//         } catch (imgErr) {
//           console.error('Failed to generate summary image', imgErr);
//           // Do not fail the whole request; return success but note image generation failed? Spec: after saving countries generate image. If generation fails, we can still return success. Not specified to fail refresh if image gen fails.
//         } finally {
//           conn.release();
//         }

//         return res.json({ success: true, total_processed: processedCountries.length, last_refreshed_at: (new Date()).toISOString() });
//       } catch (dbErr) {
//         await conn.rollback();
//         conn.release();
//         console.error('DB transaction failed, rolled back', dbErr);
//         return res.status(500).json({ error: 'Internal server error' });
//       }
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ error: 'Internal server error' });
//     }
//   },

//   async getAllCountries(req, res) {
//     try {
//       const region = req.query.region;
//       const currency = req.query.currency;
//       const sort = req.query.sort; // e.g. gdp_desc

//       const params = [];
//       let where = 'WHERE 1=1';
//       if (region) {
//         where += ' AND region = ?';
//         params.push(region);
//       }
//       if (currency) {
//         where += ' AND currency_code = ?';
//         params.push(currency);
//       }

//       let orderBy = 'ORDER BY name ASC';
//       if (sort === 'gdp_desc') {
//         orderBy = 'ORDER BY estimated_gdp DESC';
//       } else if (sort === 'gdp_asc') {
//         orderBy = 'ORDER BY estimated_gdp ASC';
//       } else if (sort === 'population_desc') {
//         orderBy = 'ORDER BY population DESC';
//       }

//       const sql = `SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries ${where} ${orderBy}`;
//       const [rows] = await pool.query(sql, params);
//       return res.json(rows);
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ error: 'Internal server error' });
//     }
//   },

//   async getCountryByName(req, res) {
//     try {
//       const name = req.params.name;
//       if (!name) return res.status(400).json({ error: 'Validation failed', details: { name: 'is required' } });

//       const [rows] = await pool.query('SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
//       // @ts-ignore
//       if (!rows.length) {
//         return res.status(404).json({ error: 'Country not found' });
//       }
//       return res.json(rows[0]);
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ error: 'Internal server error' });
//     }
//   },

//   async deleteCountryByName(req, res) {
//     try {
//       const name = req.params.name;
//       if (!name) return res.status(400).json({ error: 'Validation failed', details: { name: 'is required' } });

//       const [result] = await pool.query('DELETE FROM countries WHERE LOWER(name) = LOWER(?)', [name]);
//       // @ts-ignore
//       if (result.affectedRows === 0) {
//         return res.status(404).json({ error: 'Country not found' });
//       }
//       return res.json({ success: true });
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ error: 'Internal server error' });
//     }
//   },

//   // @ts-ignore
//   async getSummaryImage(req, res) {
//     try {
//       if (!fs.existsSync(SUMMARY_IMAGE_PATH)) {
//         return res.status(404).json({ error: 'Summary image not found' });
//       }
//       return res.sendFile(SUMMARY_IMAGE_PATH);
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ error: 'Internal server error' });
//     }
//   },

//   // @ts-ignore
//   async countryStatus(req, res) {
//     try {
//       const [countRows] = await pool.query('SELECT COUNT(*) as cnt FROM countries');
//       const total = countRows[0].cnt || 0;

//       const conn = await pool.getConnection();
//       try {
//         const last = await getMetadata(conn, 'last_refreshed_at');
//         conn.release();
//         return res.json({ total_countries: total, last_refreshed_at: last });
//       } catch (err) {
//         conn.release();
//         console.error(err);
//         return res.json({ total_countries: total, last_refreshed_at: null });
//       }
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ error: 'Internal server error' });
//     }
//   },
// };

// export default CountryController