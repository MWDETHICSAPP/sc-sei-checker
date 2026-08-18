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

    const rowElectionIdMatch = rowHtml.match(/electionId=(\d+)/i);

    const rowElectionId = electionId
      ? Number(electionId)
      : rowElectionIdMatch
        ? Number(rowElectionIdMatch[1])
        : null;

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

    const hasElectionNameColumn = cells.length >= 8;
    const offset = hasElectionNameColumn ? 1 : 0;

    results.push({
      candidateId: Number(candidateId),
      electionId: rowElectionId,
      electionName: hasElectionNameColumn ? cells[0] : "",
      office: cells[offset] || "",
      county: cells[offset + 1] || "",
      candidateName: cells[offset + 2] || "",
      runningMate: cells[offset + 3] || "",
      party: cells[offset + 4] || "",
      filingLocation: cells[offset + 5] || "",
      status: cells[offset + 6] || ""
    });
  }

  return results;
}

async function getElectionsByDate(electionDate) {
  const value = String(electionDate || "").trim();

  if (!value) {
    return [];
  }

  let formattedDate = value;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    formattedDate = `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const response = await fetch(
    `${SC_VOTES_CANDIDATE_BASE_URL}/Candidate/CandidateSearchDate?electionDate=${encodeURIComponent(
      `${formattedDate} 00:00:00`
    )}`,
    {
      headers: {
        Accept: "text/html"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `SC Votes election date lookup failed: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();

  const selectMatch = html.match(
    /<select[^>]*id="SelectedElections"[^>]*>([\s\S]*?)<\/select>/i
  );

  if (!selectMatch) {
    return [];
  }

  const elections = [];
  const optionPattern =
    /<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi;

  let match;

  while ((match = optionPattern.exec(selectMatch[1])) !== null) {
    elections.push({
      electionId: Number(match[1]),
      electionName: match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
    });
  }

  return elections;
}

async function searchCandidateFilings({
  electionId,
  electionDate = "",
  firstName = "",
  lastName = ""
}) {
  if ((!electionId && !electionDate) || !lastName) {
    return [];
  }

    
  const form = new URLSearchParams();

  if (electionId) {
  form.set("ElectionId", String(electionId));
} else {
  const date = new Date(electionDate);

  const formattedElectionDate = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate()
  ).padStart(2, "0")}/${date.getFullYear()} 00:00:00`;

  form.set("ElectionDate", formattedElectionDate);
}

  form.set("SelectedOffice", "-1");
  form.set("SelectedCandidateStatus", "All");
  form.set("CandidateFirstName", firstName);
  form.set("CandidateLastName", lastName);
  form.set("SelectedPoliticalParty", "All");
  form.set("SelectedFilingLocation", "All");
 

  const searchPath = electionId
  ? "/Candidate/CandidateSearch/"
  : "/Candidate/CandidateSearchDate/";
  const response = await fetch(
  `${SC_VOTES_CANDIDATE_BASE_URL}${searchPath}`,
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

const electionIdMatch = html.match(
  /id="ElectionId"[^>]*value="(\d+)"/i
);

const resolvedElectionId =
  electionId || (electionIdMatch ? Number(electionIdMatch[1]) : null);

return parseCandidateSearchResults(html, resolvedElectionId);  
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

async function getCandidateFilingExport({
  electionDate,
  lastName = ""
}) {
  if (!electionDate || !lastName) {
    return "";
  }

  const value = String(electionDate).trim();
  let formattedDate = value;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    formattedDate = `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const form = new URLSearchParams();

  form.set("ElectionDate", `${formattedDate} 00:00:00`);
  form.set("SelectedOffice", "-1");
  form.set("CandidateFirstName", "");
  form.set("CandidateLastName", lastName);
  form.set("SelectedPoliticalParty", "All");
  form.set("SelectedFilingLocation", "All");
  form.set("SelectedCandidateStatus", "All");

  const searchResponse = await fetch(
    `${SC_VOTES_CANDIDATE_BASE_URL}/Candidate/CandidateSearchDate/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html"
      },
      body: form.toString()
    }
  );

  if (!searchResponse.ok) {
    throw new Error(
      `SC Votes candidate export search failed: ${searchResponse.status} ${searchResponse.statusText}`
    );
  }

  const cookie = searchResponse.headers.get("set-cookie") || "";

  const exportResponse = await fetch(
    `${SC_VOTES_CANDIDATE_BASE_URL}/Candidate/ExportSearchDateResults`,
    {
      headers: {
        Accept: "text/csv",
        Cookie: cookie
      }
    }
  );

  if (!exportResponse.ok) {
    throw new Error(
      `SC Votes candidate export failed: ${exportResponse.status} ${exportResponse.statusText}`
    );
  }

  return exportResponse.text();
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);

  return values;
}

function parseCandidateFilingExport(csvText) {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  });
}

function findMatchingCandidateExportRow(rows, candidate) {
  if (!Array.isArray(rows) || !candidate) {
    return null;
  }

  const candidateName = normalizeText(candidate.candidateName);
  const candidateOffice = normalizeText(candidate.office);
  const candidateCounty = normalizeText(candidate.county);

  return (
    rows.find((row) => {
      const rowName = normalizeText(
        `${row["Ballot Name (first - middle)"] || ""} ${
          row["Ballot Name (last - suffix)"] || ""
        }`
      );

      const rowOffice = normalizeText(row["Office"]);
      const rowCounty = normalizeText(row["Associated Counties"]);

      return (
        rowName === candidateName &&
        rowOffice === candidateOffice &&
        rowCounty === candidateCounty
      );
    }) || null
  );
}

module.exports = {
  getElectionsByDate,
  searchCandidateFilings,
  getCandidateFilingDetail,
  getCandidateFilingExport,
  parseCandidateFilingExport
  findMatchingCandidateExportRow
};
