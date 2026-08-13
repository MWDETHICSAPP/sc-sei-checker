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

const SC_VOTES_GRAPHQL_URL =
  `${SC_VOTES_BASE_URL}/api/graphql_pr`;

const QUICK_SEARCH_QUERY = `
  query QuickSearch($query: String!) {
    quickSearch(
      query: $query
      includeCandidates: true
      includeContests: true
      includeBallotQuestions: true
      limit: 20
    ) {
      id
      resultKind
      displayName1
      displayName2
      displayName3
      score
    }
  }
`;

const GET_CANDIDATE_QUERY = `
  query GetCandidate($candidateId: Int!) {
    candidate(id: $candidateId) {
      id
      displayName
      firstName
      lastName
      contests {
        id
        year
        isWinner
        contest {
          id
          eventTypeDisplayName
          isRunoff
          isSpecial
          event {
            id
            startDate
            type {
              id
              name
            }
          }
          office {
            id
            name
          }
          division {
            id
            displayName
          }
        }
      }
    }
  }
`;

async function searchCandidates(candidateName) {
  const query = String(candidateName || "").trim();

  if (!query) {
    return [];
  }

  const response = await fetch(SC_VOTES_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-elstats-tenant": "sc"
    },
    body: JSON.stringify({
      operationName: "QuickSearch",
      variables: {
        query
      },
      query: QUICK_SEARCH_QUERY
    })
  });

  if (!response.ok) {
    throw new Error(
      `SC Votes candidate search failed: ${response.status} ${response.statusText}`
    );
  }

  const payload = await response.json();

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(
      `SC Votes GraphQL error: ${payload.errors
        .map((error) => error?.message)
        .filter(Boolean)
        .join("; ")}`
    );
  }

  const results = Array.isArray(payload?.data?.quickSearch)
    ? payload.data.quickSearch
    : [];

  return results
    .filter((result) => result?.resultKind === "candidate")
    .sort((a, b) => {
      const aExact =
        normalizeCandidateName(a?.displayName1) ===
        normalizeCandidateName(query);

      const bExact =
        normalizeCandidateName(b?.displayName1) ===
        normalizeCandidateName(query);

      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      return Number(b?.score || 0) - Number(a?.score || 0);
    });
}

async function getCandidateHistory(candidateId) {
  const id = Number(candidateId);

  if (!Number.isInteger(id)) {
    throw new Error("A valid SC Votes candidate ID is required.");
  }

  const response = await fetch(SC_VOTES_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-elstats-tenant": "sc"
    },
    body: JSON.stringify({
      operationName: "GetCandidate",
      variables: {
        candidateId: id
      },
      query: GET_CANDIDATE_QUERY
    })
  });

  if (!response.ok) {
    throw new Error(
      `SC Votes candidate request failed: ${response.status} ${response.statusText}`
    );
  }

  const payload = await response.json();

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(
      `SC Votes GraphQL error: ${payload.errors
        .map((error) => error?.message)
        .filter(Boolean)
        .join("; ")}`
    );
  }

  return payload?.data?.candidate || null;
}

module.exports = {
  searchCandidates,
  getCandidateHistory
};
