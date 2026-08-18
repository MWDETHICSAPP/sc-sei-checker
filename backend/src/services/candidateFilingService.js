const SC_VOTES_CANDIDATE_BASE_URL =
  "https://vrems.scvotes.sc.gov";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseCandidateSearchResults(html, electionId) {
  const results = [];
  const rowPattern = /<tr[^>]*data-key="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const candidateId = rowMatch[1];
    const rowHtml = rowMatch[2];

    const cells = [];
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      cells.push(text);
    }

    if (!candidateId || cells.length < 3) {
      continue;
    }

    results.push({
      candidateId: Number(candidateId),
      electionId: Number(electionId),
      office: cells[0] || "",
      county: cells[1] || "",
      candidateName: cells[2] || "",
      runningMate: cells[3] || "",
      party: cells[4] || "",
      filingLocation: cells[5] || "",
      status: cells[6] || ""
    });
  }

  return results;
}

async function searchCandidateFilings({
  electionId,
  firstName = "",
  lastName = ""
}) {
  if (!electionId || !lastName) {
    return [];
  }

  const form = new URLSearchParams();

  form.set("ElectionId", String(electionId));
  form.set("SelectedOffice", "-1");
  form.set("SelectedCandidateStatus", "All");
  form.set("CandidateFirstName", firstName);
  form.set("CandidateLastName", lastName);
  form.set("SelectedPoliticalParty", "All");
  form.set("SelectedFilingLocation", "All");
  form.set("ElectionDate", "");

  const response = await fetch(
    `${SC_VOTES_CANDIDATE_BASE_URL}/Candidate/CandidateSearch/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html"
      },
      body: form.toString()
    }
  );

  if (!response.ok) {
    throw new Error(
      `SC Votes candidate filing search failed: ${response.status} ${response.statusText}`
    );
  }
  
    const html = await response.text();

  return parseCandidateSearchResults(html, electionId);
}

function extractDetailField(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pattern = new RegExp(
    `<span[^>]*>\\s*${escapedLabel}:?\\s*<\\/span>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`,
    "i"
  );

  const match = String(html || "").match(pattern);

  if (!match) {
    return "";
  }

  return match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getCandidateFilingDetail({
  candidateId,
  electionId
}) {
  if (!candidateId || !electionId) {
    return null;
  }

  const response = await fetch(
    `${SC_VOTES_CANDIDATE_BASE_URL}/Candidate/CandidateDetail/?candidateId=${candidateId}&electionId=${electionId}&searchType=Default`,
    {
      headers: {
        Accept: "text/html"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `SC Votes candidate detail request failed: ${response.status} ${response.statusText}`
    );
  }

 const html = await response.text();

return {
  candidateId: Number(candidateId),
  electionId: Number(electionId),
  candidateName: extractDetailField(html, "Candidate"),
  election: extractDetailField(html, "Election"),
  office: extractDetailField(html, "Office"),
  county: extractDetailField(html, "County"),
  party: extractDetailField(html, "Party"),
  address: extractDetailField(html, "Address"),
  status: extractDetailField(html, "Status"),
  dateFiled: extractDetailField(html, "Date Filed")
};
}

module.exports = {
  searchCandidateFilings,
  getCandidateFilingDetail
};
