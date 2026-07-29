const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { checkPerson } = require("./services/checkPerson");

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "https://mwdethicsapp.github.io,http://localhost:8000,http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Permit tools such as health checks that send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS."));
    },
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "SC SEI Checker API",
    version: "0.1.0",
    status: "running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sc-sei-checker-backend",
    timestamp: new Date().toISOString(),
  });
});

app.post("/check-person", async (req, res, next) => {
  try {
    const result = await checkPerson(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/check-batch", async (req, res, next) => {
  try {
    const { people, year = 2026 } = req.body || {};

    if (!Array.isArray(people) || people.length === 0) {
      return res.status(400).json({
        error: "The request must include a non-empty people array.",
      });
    }

    if (people.length > 500) {
      return res.status(400).json({
        error: "A batch may contain no more than 500 people.",
      });
    }

    const results = [];
    for (const person of people) {
      results.push(await checkPerson({ ...person, year: person.year || year }));
    }

    res.json({
      year,
      count: results.length,
      results,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "The server could not complete the request.",
    detail:
      process.env.NODE_ENV === "production"
        ? undefined
        : error.message,
  });
});

app.listen(PORT, () => {
  console.log(`SC SEI Checker API listening on port ${PORT}`);
});
