import express from "express";
import CountryController from "../controllers/country.controller.js";

const router = express.Router();

router.get("/image", CountryController.getSummaryImage);

router.get("/", CountryController.getAllCountries);

router.get("/:name", CountryController.getCountryByName);

router.post("/refresh", CountryController.refreshCountry);

router.delete("/:name", CountryController.deleteCountryByName);

export default router;
