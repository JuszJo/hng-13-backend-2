import rateLimit from "express-rate-limit";
import CountryRouter from "./country.route.js";

const limiter = rateLimit({
  limit: 100,
  windowMs: 1000 * 60 * 5
})

export default function useRoutes(app) {
  app.get("/", limiter, async (_, res) => {
    res.status(200).send("ok");
  })

  app.use("/countries", limiter, CountryRouter)

  app.use("/status", limiter, CountryRouter)
}