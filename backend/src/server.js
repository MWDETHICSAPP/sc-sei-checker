const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { checkPerson } = require("./services/checkPerson");
const { checkCampaignCompliance } = require("./services/checkCampaignCompliance");
const {
  buildSearchPayload,
  downloadSearchCsv
} = require("./services/electionHistoryService");


const app = express();
const PORT = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "https://mwdethicsapp.github.io,https://sc-sei-checker.onrender.com,http://localhost:8000,http://localhost:3000")
  .split(",").map(v => v.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin(origin, callback) {
   if (!origin || origin === "null" || allowedOrigins.includes(origin)) return callback(null, true); 
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.get("/", (_req, res) => res.json({name:"SC SEI Checker API",version:"0.2.0",status:"running"}));
app.get("/health", (_req, res) => res.status(200).json({
  ok:true, service:"sc-sei-checker-backend", version:"0.2.0", timestamp:new Date().toISOString()
}));

app.get("/test-election-history", async (_req, res, next) => {
  try {
    const searchPayload = buildSearchPayload({
      fromYear: 2022,
      toYear: 2022,
      candidateIds: [4576]
    });

    const csv = await downloadSearchCsv(searchPayload);

    res.type("text/plain").send(csv);
  } catch (e) {
    next(e);
  }
});

app.post("/check-person", async (req, res, next) => {
  try { res.json(await checkPerson(req.body)); } catch (e) { next(e); }
});

app.post("/check-campaign", async (req, res, next) => {
  try {
    res.json(await checkCampaignCompliance(req.body));
  } catch (e) {
    next(e);
  }
});

app.post("/check-batch", async (req, res, next) => {
  try {
    const { people, year = 2026 } = req.body || {};
    if (!Array.isArray(people) || people.length === 0) {
      return res.status(400).json({error:"The request must include a non-empty people array."});
    }
    if (people.length > 500) {
      return res.status(400).json({error:"A batch may contain no more than 500 people."});
    }
    const results = [];
    for (const person of people) results.push(await checkPerson({...person, year: person.year || year}));
    res.json({year:Number(year), count:results.length, results});
  } catch (e) { next(e); }
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status || 500);
  console.error(error);
  res.status(status).json({error: status >= 500 ? "The server could not complete the request." : error.message});
});

app.listen(PORT, "0.0.0.0", () => console.log(`SC SEI Checker API listening on port ${PORT}`));
