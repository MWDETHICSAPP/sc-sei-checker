const {
  normalizePersonInput,
  extractSurname
} = require("../matching/names");

const POSITIONS_URL =
  "https://ethicsfiling.sc.gov/api/Ethics/Get/Public/All/Offices/Positions";

const REPORTS_URL =
  "https://ethicsfiling.sc.gov/api/Ethics/Get/Public/Search/For/Sei/Reports";

let positionsCache = null;
let positionsCacheTime = 0;

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function buildFilingUrl() {
  return "https://ethicsfiling.sc.gov/public/statement-economic-interests";
}

async function getPositions() {
  const now = Date.now();

  if (
    Array.isArray(positionsCache) &&
    now - positionsCacheTime < CACHE_DURATION_MS
  ) {
    return positionsCache;
  }

  const response = await fetch(POSITIONS_URL, {
    headers: {
      Accept: "application/json",
      Referer:
        "https://ethicsfiling.sc.gov/public/statement-economic-interests",
      Origin: "https://ethicsfiling.sc.gov",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36"
    }
  });

  if (!response.ok) {
    const body = await response.text();

    console.error("POSITIONS API STATUS:", response.status);
    console.error("POSITIONS API BODY:", body);

    const error = new Error(
      `The positions lookup returned status ${response.status}.`
    );

    error.status = 502;
    throw error;
  }

  const payload = await response.json();

  if (!Array.isArray(payload)) {
    const error = new Error(
      "The positions lookup returned an unexpected response."
    );

    error.status = 502;
    throw error;
  }

  positionsCache = payload;
  positionsCacheTime = now;

  return positionsCache;
}




function jurisdictionVariants(jurisdiction) {
  const original = normalizeText(jurisdiction);

  const variants = new Set([original]);

  const removablePrefixes = [
    "city of ",
    "town of ",
    "county of ",
    "village of ",
    "municipality of "
  ];

  for (const prefix of removablePrefixes) {
    if (original.startsWith(prefix)) {
      variants.add(original.slice(prefix.length).trim());
    }
  }

  if (original.endsWith(" county")) {
    variants.add(
      original.slice(0, -" county".length).trim()
    );
  }

  return [...variants].filter(Boolean);
} 


function findPositionInfo(positions, jurisdiction) {
   const variants = jurisdictionVariants(jurisdiction);

  if (variants.length === 0) {
    return null;
  }

  for (const wanted of variants) {
    const exactGovernmentEntity = positions.find(
      (position) =>
        position.type === "Government Entity" &&
        normalizeText(position.name) === wanted
    );

    if (exactGovernmentEntity) {
      return exactGovernmentEntity;
    }
  }

  for (const wanted of variants) {
    const exactOffice = positions.find(
      (position) =>
        position.type === "Office" &&
        normalizeText(position.name) === wanted
    );

    if (exactOffice) {
      return exactOffice;
    }
  }

  return null;
}



async function searchPublicSei({
  surname,
  jurisdiction,
  year
}) {
  const positions = await getPositions();

  const positionInfo = findPositionInfo(
    positions,
    jurisdiction
  );

  if (!positionInfo) {
    return {
      matches: [],
      positionInfo: null,
      positionLookupFailed: true
    };
  }

  const response = await fetch(REPORTS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/json;charset=UTF-8",
      Origin: "https://ethicsfiling.sc.gov",
      Referer:
        "https://ethicsfiling.sc.gov/public/statement-economic-interests",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36"
    },
    body: JSON.stringify({
  filerName: surname.toLowerCase(),
  positionSearch: jurisdiction,
  positionInfo: {
    id: positionInfo.id,
    name: positionInfo.name,
    nameType: positionInfo.nameType,
    type: positionInfo.type,
    typeId: positionInfo.typeId
  },
  reportYear: Number(year)
}),
});

  if (!response.ok) {
    const body = await response.text();

    console.error("ETHICS API STATUS:", response.status);
    console.error("ETHICS API BODY:", body);

    const error = new Error(
      `The public SEI search returned status ${response.status}.`
    );

    error.status = 502;
    throw error;
  }

  const payload = await response.json();

  return {
    matches: Array.isArray(payload.result)
      ? payload.result
      : [],
    positionInfo,
    positionLookupFailed: false
  };
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
      search: {
        surname: "",
        adapter: "sc-ethics-public-api"
      },
      status: "Manual Review",
      confidence: 0,
      matchedFilingName: "",
      filingUrl: "",
      notes: "A usable surname could not be extracted."
    };
  }

  const searchResult = await searchPublicSei({
    surname,
    jurisdiction: normalized.jurisdiction,
    year
  });

  if (searchResult.positionLookupFailed) {
    return {
      input: normalized,
      search: {
        surname,
        adapter: "sc-ethics-public-api"
      },
      status: "Manual Review",
      confidence: 0,
      matchedFilingName: "",
      filingUrl: "",
      notes:
        `The jurisdiction "${normalized.jurisdiction}" ` +
        "could not be matched to the Ethics filing system."
    };
  }

  const matches = searchResult.matches;

  if (matches.length === 0) {
    return {
      input: normalized,
      search: {
        surname,
        adapter: "sc-ethics-public-api"
      },
      status: "Not Filed",
      confidence: 1,
      matchedFilingName: "",
      filingUrl: "",
      notes:
        `No ${year} SEI result was found for ${surname} ` +
        `in ${normalized.jurisdiction}.`
    };
  }

  if (matches.length === 1) {
    const match = matches[0];

    return {
      input: normalized,
      search: {
        surname,
        adapter: "sc-ethics-public-api"
      },
      status: "Filed",
      confidence: Number(
        match.percentageAccuracy || 1
      ),
      matchedFilingName: match.filerName || "",
      filedDate: match.updated || "",
      filingUrl: buildFilingUrl(),
      notes:
        `${match.report || `${year} SEI Report`} — ` +
        `${match.officeName || "office not listed"}; ` +
        `updated ${match.updated || "date unavailable"}.`
    };
  }

  return {
    input: normalized,
    search: {
      surname,
      adapter: "sc-ethics-public-api"
    },
    status: "Manual Review",
    confidence: Math.max(
      ...matches.map((match) =>
        Number(match.percentageAccuracy || 0)
      )
    ),
    matchedFilingName: matches
      .slice(0, 3)
      .map((match) => match.filerName)
      .filter(Boolean)
      .join("; "),
    filingUrl: buildFilingUrl(),
    notes:
      `${matches.length} possible ${year} filing matches ` +
      "were found. Confirm the filer manually."
  };
}

module.exports = { checkPerson };
