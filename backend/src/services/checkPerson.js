const { normalizePersonInput, extractSurname } = require("../matching/names");

const SEARCH_URL =
  "https://ethicsfiling.sc.gov/api/EthicsPublicSearch/For/Sei/Reports";

function buildFilingUrl(match) {
  // We do not yet have personId from the search response, so link to
  // the public SEI search page rather than inventing a broken detail URL.
  return "https://ethicsfiling.sc.gov/public/statement-economic-interests";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function jurisdictionMatches(match, jurisdiction) {
  const wanted = normalizeText(jurisdiction);

  if (!wanted) return true;

  const searchable = normalizeText(
    `${match.officeName || ""} ${match.officeType || ""} ${match.position || ""}`
  );

  return searchable.includes(wanted);
}

async function searchPublicSei({ surname, jurisdiction, year }) {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
      "User-Agent": "SC-SEI-Checker/0.3"
    },
    body: JSON.stringify({
      filerName: surname,
      positionSearch: jurisdiction || "",
      reportYear: Number(year)
    })
  });

  if (!response.ok) {
    const error = new Error(
      `The public SEI search returned status ${response.status}.`
    );
    error.status = 502;
    throw error;
  }

  const payload = await response.json();

  return Array.isArray(payload.result) ? payload.result : [];
}

async function checkPerson(input) {
  const normalized = normalizePersonInput(input);

  if (!normalized.name) {
    const error = new Error("A name is required.");
    error.status = 400;
    throw error;
  }

  const surname = extractSurname(normalized.name);
  const year = Number(normalized.year || 2026);

  if (!surname) {
    return {
      input: normalized,
      search: { surname: "", adapter: "sc-ethics-public-api" },
      status: "Manual Review",
      confidence: 0,
      matchedFilingName: "",
      filingUrl: "",
      notes: "A usable surname could not be extracted."
    };
  }

  const matches = await searchPublicSei({
    surname,
    jurisdiction: normalized.jurisdiction,
    year
  });

  if (matches.length === 0) {
    return {
      input: normalized,
      search: { surname, adapter: "sc-ethics-public-api" },
      status: "Not Filed",
      confidence: 1,
      matchedFilingName: "",
      filingUrl: "",
      notes: `No ${year} SEI search result was found for ${surname} in ${normalized.jurisdiction || "the selected jurisdiction"}.`
    };
  }

  const jurisdictionMatchesOnly = matches.filter((match) =>
    jurisdictionMatches(match, normalized.jurisdiction)
  );

  const candidates =
    jurisdictionMatchesOnly.length > 0 ? jurisdictionMatchesOnly : matches;

  if (candidates.length === 1) {
    const match = candidates[0];

    return {
      input: normalized,
      search: { surname, adapter: "sc-ethics-public-api" },
      status: "Filed",
      confidence: Number(match.percentageAccuracy || 1),
      matchedFilingName: match.filerName || "",
      filingUrl: buildFilingUrl(match),
      notes: `${match.report || `${year} SEI Report`} — ${match.officeName || "office not listed"}; updated ${match.updated || "date unavailable"}.`
    };
  }

  return {
    input: normalized,
    search: { surname, adapter: "sc-ethics-public-api" },
    status: "Manual Review",
    confidence: Math.max(
      ...candidates.map((match) => Number(match.percentageAccuracy || 0))
    ),
    matchedFilingName: candidates
      .slice(0, 3)
      .map((match) => match.filerName)
      .filter(Boolean)
      .join("; "),
    filingUrl: buildFilingUrl(candidates[0]),
    notes: `${candidates.length} possible ${year} filing matches were found. Confirm the filer and jurisdiction manually.`
  };
}

module.exports = { checkPerson };
