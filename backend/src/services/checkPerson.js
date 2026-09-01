const {
  normalizePersonInput,
  extractSurname
} = require("../matching/names");

const {
  checkCampaignCompliance
} = require("./checkCampaignCompliance");
const {
  searchCandidates,
  getCandidateHistory
} = require("./electionHistoryService");
const POSITIONS_URL =
  "https://ethicsfiling.sc.gov/api/Ethics/Get/Public/All/Offices/Positions";

const REPORTS_URL =
  "https://ethicsfiling.sc.gov/api/Ethics/Get/Public/Search/For/Sei/Reports";
const SEI_VERSIONS_URL =
  "https://ethicsfiling.sc.gov/api/Sei/Report/Get/All/Versions/By/Model";

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
async function getOriginalSeiSubmissionDate(seiMatch) {
  if (!seiMatch?.reportId || !seiMatch?.seiFilerId) {
    return null;
  }

  const response = await fetch(SEI_VERSIONS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://ethicsfiling.sc.gov",
      Referer:
        "https://ethicsfiling.sc.gov/public/statement-economic-interests",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36"
    },
    body: JSON.stringify({
      candidateFilerId: seiMatch.candidateFilerId || null,
      seiFilerId: seiMatch.seiFilerId,
      seiReportId: seiMatch.reportId
    })
  });

 if (!response.ok) {
  console.log("SEI VERSIONS REQUEST FAILED:", {
    status: response.status,
    statusText: response.statusText
  });
  return null;
} 

  const payload = await response.json();
console.log(
  "SEI VERSIONS DEBUG:",
  JSON.stringify(payload, null, 2)
);
  
  const versions = Array.isArray(payload?.versions)
    ? payload.versions
    : [];

  const originalVersion = versions.find(
    (version) =>
      String(version?.name || "")
        .trim()
        .toLowerCase() === "original"
  );

  return originalVersion?.filedDate || null;
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
  office,
  years
}) {
  
  const positions = await getPositions();
 
  
  const isSolicitor =
  normalizeText(office) === "solicitor";

  
  const jurisdictions = String(jurisdiction || "")
  .split(";")
  .map((value) => value.trim())
  .filter(Boolean);

const positionInfos = jurisdictions
  .map((value) =>
    findPositionInfo(
      positions,
      isSolicitor ? `${value} County` : value
    )
  )
  .filter(Boolean);

const positionInfo = positionInfos[0] || null;

  if (!positionInfo) {
    return {
      matches: [],
      positionInfo: null,
      positionLookupFailed: true
    };
  }

const allMatches = [];

const searchTargets = isSolicitor
  ? jurisdictions.map((value) => `${value} County`)
  : jurisdictions;

  const yearsToSearch = Array.isArray(years)
  ? years
  : [years];

for (const reportYear of yearsToSearch) {

for (let i = 0; i < searchTargets.length; i += 1) {
  const jurisdictionName = searchTargets[i];

  const jurisdictionPositionInfo =
    findPositionInfo(positions, jurisdictionName);

  if (!jurisdictionPositionInfo) {
    continue;
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
      positionSearch: jurisdictionPositionInfo.name,
      positionInfo: {
        id: jurisdictionPositionInfo.id,
        name: jurisdictionPositionInfo.name,
        nameType: jurisdictionPositionInfo.nameType,
        type: jurisdictionPositionInfo.type,
        typeId: jurisdictionPositionInfo.typeId
      },
      reportYear: Number(reportYear)
    })
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



if (Array.isArray(payload.result)) {


  allMatches.push(...payload.result);
}
}
}
const uniqueMatches = [
  ...new Map(
    allMatches.map((match) => {
      const key =
        match?.reportId ||
        match?.id ||
        [
  match?.filerName,
  match?.report,
  match?.updated
].join("|");

      return [key, match];
    })
  ).values()
];

  
return {
  matches: uniqueMatches,
  positionInfo,
  positionLookupFailed: false
}; 
}

async function checkPerson(input) {
  const normalized = normalizePersonInput(input);

  const normalizedRole = String(normalized.role || "")
  .trim()
  .toLowerCase();

const requiresCampaignCheck =
  normalizedRole.includes("elected") ||
  normalizedRole.includes("candidate");

  if (!normalized.name) {
  return {
    input: normalized,
    search: {
      surname: "",
      adapter: "sc-ethics-public-api"
    },
    status: "Manual Review",
    confidence: 0,
    matchedFilingName: "",
    filedDate: "",
    filingUrl: "",
    notes: "No official name provided."
  };
}

  const surname = extractSurname(normalized.name);
  const year = Number(
  normalized.year || new Date().getFullYear()
);

  const seiYears = [
  year - 3,
  year - 2,
  year - 1,
  year
];

  let campaignCompliance = null;

if (requiresCampaignCheck) {
  try {
    campaignCompliance = await checkCampaignCompliance({
      ...normalized,
      reportingYear: year
    });
  } catch (error) {
    console.error(
      `Campaign compliance check failed for ${normalized.name}:`,
      error.message
    );
  }
}

  if (!surname) {
    return {
      input: normalized,
      campaignCompliance,
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

  const normalizedJurisdiction = normalizeText(
  normalized.jurisdiction
);

const isStatewideJurisdiction = [
  "south carolina",
  "state of south carolina",
  "statewide"
].includes(normalizedJurisdiction);

const statewideOfficeNames =
  isStatewideJurisdiction &&
  Array.isArray(campaignCompliance?.relevantOfficeRuns)
    ? [
        ...new Set(
          campaignCompliance.relevantOfficeRuns
            .map((run) => String(run?.name || "").trim())
            .filter(Boolean)
        )
      ]
    : [];

const seiJurisdiction =
  isStatewideJurisdiction &&
  statewideOfficeNames.length === 1
    ? statewideOfficeNames[0]
    : normalized.jurisdiction;

const searchResult = await searchPublicSei({
  surname,
  jurisdiction: seiJurisdiction,
  office: normalized.office,
  years: seiYears
});

  if (searchResult.positionLookupFailed) {
    return {
      input: normalized,
      campaignCompliance,
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
  const seiDeficiencies = [];
console.log(
  "SEI MATCH DEBUG",
  normalized.name,
  JSON.stringify(matches, null, 2)
);
  

const matchesByYear = new Map(
  matches
    .map((match) => {
  const reportYear =
  Number(String(match.report || "").match(/\b20\d{2}\b/)?.[0]) ||
  (Number(match.reportYear) + 1);  

      return [reportYear, match];
    })
    .filter(([reportYear]) => reportYear)
);

  const seiDiagnostic =
  normalized.name === "Jason Branham"
    ? {
        seiYears,
        rawMatches: matches.map((m) => ({
          report: m.report,
          reportYear: m.reportYear,
          updated: m.updated,
          filerName: m.filerName
        })),
        matchesByYear: [...matchesByYear.entries()].map(
          ([key, match]) => ({
            key,
            report: match.report,
            reportYear: match.reportYear,
            updated: match.updated
          })
        )
      }
    : null;
  
const campaignDeficiencies =
  Array.isArray(campaignCompliance?.campaignDeficiencies)
    ? campaignCompliance.campaignDeficiencies
    : [];

  const candidateParty = String(
  campaignCompliance?.candidateFilingMatch?.party || ""
)
  .trim()
  .toLowerCase();

const candidateStatus = String(
  campaignCompliance?.candidateFilingMatch?.status || ""
)
  .trim()
  .toLowerCase();
const candidateElectionYear = normalized.electionDate
  ? new Date(normalized.electionDate).getFullYear()
  : null;
const isCandidate =
  normalizedRole.includes("candidate");

const isElectedOfficial =
  normalizedRole.includes("elected");


const candidateRequiresSei =
  isCandidate &&
  (
    (candidateParty &&
      candidateParty !== "nonpartisan") ||
    (
      candidateParty === "nonpartisan" &&
      candidateStatus === "elected"
    )
  );

let firstWinningYearForOffice = null;

if (isElectedOfficial) {
  try {
    const candidateSearchResults = await searchCandidates(normalized.name);

    const candidateId = candidateSearchResults?.[0]?.id;

    if (candidateId) {
     const candidateHistory = await getCandidateHistory(candidateId);

console.log(
  "SC VOTES CANDIDATE HISTORY:",
  JSON.stringify(candidateHistory, null, 2)
);

const relevantOfficeYears = (candidateHistory?.contests || [])
  .filter((contestEntry) => {
    const historyDivision = String(
      contestEntry?.contest?.division?.displayName || ""
    )
      .trim()
      .toLowerCase();

    const requestedOffice = String(normalized.office || "")
      .trim()
      .toLowerCase();

    return (
      historyDivision &&
      requestedOffice &&
      historyDivision === requestedOffice
    );
  })
  .map((contestEntry) => Number(contestEntry.year))
  .filter((contestYear) => Number.isInteger(contestYear));

if (relevantOfficeYears.length > 0) {
  firstWinningYearForOffice = Math.min(...relevantOfficeYears);
}
    }
  } catch (error) {
    console.error(
      "SC VOTES CANDIDATE HISTORY ERROR:",
      error.message
    );
  }
} 

for (const seiYear of seiYears) {
  const requiresSeiForYear =
  (
    isElectedOfficial &&
    (
      firstWinningYearForOffice === null ||
      seiYear >= firstWinningYearForOffice
    )
  ) ||
  (
    isCandidate &&
    candidateRequiresSei &&
    candidateElectionYear === seiYear
  );

  if (!requiresSeiForYear) {
    continue;
  }
  const seiMatch = matchesByYear.get(seiYear);

if (!seiMatch) {
  seiDeficiencies.push({
    type: "SEI",
    filing: `${seiYear} Statement of Economic Interests`,
    status: "Missing",
    year: seiYear,
    dueDate: `${seiYear}-03-30T00:00:00.000Z`
  });
} else {
  const dueDate = new Date(`${seiYear}-03-30T23:59:59`);
  const graceDeadline = new Date(dueDate);
  graceDeadline.setDate(graceDeadline.getDate() + 5);

const originalSubmittedDate =
  await getOriginalSeiSubmissionDate(seiMatch);

 console.log(
  "SEI DATE RESULT:",
  JSON.stringify({
    year: seiYear,
    report: seiMatch.report,
    reportId: seiMatch.reportId,
    originalSubmittedDate,
    updated: seiMatch.updated,
    dateActuallyUsed: originalSubmittedDate || seiMatch.updated
  })
);

const filedDate = new Date(
  originalSubmittedDate || seiMatch.updated
);

  if (
    !Number.isNaN(filedDate.getTime()) &&
    filedDate > graceDeadline
  ) {
    seiDeficiencies.push({
      type: "SEI",
      filing: `${seiYear} Statement of Economic Interests`,
      status: "Late",
      year: seiYear,
      dueDate: `${seiYear}-03-30T00:00:00.000Z`,
      filedDate: originalSubmittedDate || seiMatch.updated
    });
  }
} 
  }

  if (matches.length === 0 && seiDeficiencies.length > 0) {
    return {
      input: normalized,
      campaignCompliance,
    deficiencies: [
  ...seiDeficiencies,
  ...campaignDeficiencies
],
      
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

if (matches.length === 0 && seiDeficiencies.length === 0) {
  return {
    input: normalized,
    campaignCompliance,
    deficiencies: campaignDeficiencies,
    search: {
      surname,
      adapter: "sc-ethics-public-api"
    },
    status:
      campaignDeficiencies.length > 0
        ? "Not Filed"
        : "Filed",
    confidence: 1,
    matchedFilingName: "",
    filedDate: "",
    filingUrl: "",
    notes:
      candidateParty === "nonpartisan"
        ? `No ${year} SEI was required because the candidate was not elected in the nonpartisan race.`
        : `No ${year} SEI deficiency was assessed.`
  };
}
  
  if (matches.length === 1) {
    const match = matches[0];

    return {
      input: normalized,
      campaignCompliance,
      seiMatches: matches,
      deficiencies: campaignDeficiencies,
      search: {
        surname,
        adapter: "sc-ethics-public-api"
      },
      status:
  campaignDeficiencies.length > 0
    ? "Not Filed"
    : "Filed",
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

const uniqueFilerNames = [
  ...new Set(
    matches
      .map((match) => normalizeText(match.filerName))
      .filter(Boolean)
  )
];  
  return {
    input: normalized,
    campaignCompliance,
    seiMatches: matches,
    seiDiagnostic,
    deficiencies: [
  ...seiDeficiencies,
  ...campaignDeficiencies
],
    search: {
      surname,
      adapter: "sc-ethics-public-api"
    },
   status:
  uniqueFilerNames.length > 1
    ? "Manual Review"
    : seiDeficiencies.length > 0 || campaignDeficiencies.length > 0
      ? "Not Filed"
      : "Filed", 
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
  uniqueFilerNames.length > 1
    ? `${uniqueFilerNames.length} possible filers were found. Confirm the filer manually.`
    : `${matches.length} SEI reports found for the matched filer.`
  };  
}

module.exports = { checkPerson };
