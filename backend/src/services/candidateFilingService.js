const SC_VOTES_CANDIDATE_BASE_URL =
  "https://vrems.scvotes.sc.gov";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

  return html;
}

module.exports = {
  searchCandidateFilings
};
