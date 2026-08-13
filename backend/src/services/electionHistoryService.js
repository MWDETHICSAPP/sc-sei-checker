const SC_VOTES_BASE_URL = "https://electionhistory.scvotes.gov";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCandidateName(value) {
  return normalizeText(value)
    .replace(/[.,]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function extractContestId(href) {
  const match = String(href || "").match(/\/contest\/(\d+)/i);
  return match ? match[1] : null;
}


async function fetchScVotesPage(path) {
  const url = `${SC_VOTES_BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      Accept: "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(
      `SC Votes request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

async function getCandidatePage(candidateId) {
  if (!candidateId) return null;

  return fetchScVotesPage(`/candidate/${candidateId}`);
}

async function getContestPage(contestId) {
  if (!contestId) return null;

  return fetchScVotesPage(`/contest/${contestId}`);
}

function buildSearchPayload({
  fromYear,
  toYear,
  candidateIds = [],
  officeIds = []
}) {
  return {
    global: {
      years: {
        from: Number(fromYear),
        to: Number(toYear)
      }
    },
    ballotQuestions: {
      text: "",
      types: [],
      number: "",
      divisions: []
    },
    contests: {
      candidates: candidateIds,
      divisions: [],
      offices: officeIds
    },
    specialElectionsOnly: false,
    voterStats: false,
    stages: []
  };
}

async function downloadSearchCsv(searchPayload) {
  const encodedSearch = encodeURIComponent(JSON.stringify(searchPayload));

  const url =
    `https://sc.elstats.civera.com/api/download_search.csv?search=${encodedSearch}`;

  const response = await fetch(url, {
    headers: {
      Accept: "text/csv"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `SC Votes search download failed: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

module.exports = {
  buildSearchPayload,
  downloadSearchCsv
};
