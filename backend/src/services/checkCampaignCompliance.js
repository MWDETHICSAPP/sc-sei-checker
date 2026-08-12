/**
 * Campaign Disclosure Compliance Service
 *
 * This module will eventually:
 * 1. Locate a person's campaign-disclosure run for office.
 * 2. Determine whether the run is still open.
 * 3. Build the rolling four-year list of required reports.
 * 4. Compare required reports with reports actually filed.
 * 5. Return filing dates, missing reports, and late reports.
 *
 * It is not connected to the live application yet.
 */
const CAMPAIGN_REPORTS_URL =
  "https://ethicsfiling.sc.gov/api/Candidate/Report/Public/Campaign/Get/Reports";
const CAMPAIGN_PROFILE_URL =
  "https://ethicsfiling.sc.gov/api/Candidate/Campaign/Get/Personal/Profile";
async function getCampaignProfile(candidateFilerId, seiFilerId) {
  if (!candidateFilerId || !seiFilerId) return null;

  const response = await fetch(CAMPAIGN_PROFILE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      candidateFilerId,
      seiFilerId
    })
  });

  if (!response.ok) {
    throw new Error(
      `Campaign profile search failed with status ${response.status}`
    );
  }

  return response.json();
}
function isDueWithinFourYears(dueDate, asOfDate = new Date()) {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;

  const cutoff = new Date(asOfDate);
  cutoff.setFullYear(cutoff.getFullYear() - 4);

  return due >= cutoff && due <= asOfDate;
}
async function checkCampaignCompliance(input) {
  const candidate = String(input?.candidate || input?.lastName || "")
    .trim()
    .toLowerCase();

  const reportingYear = Number(input?.reportingYear || input?.year);

  if (!candidate || !reportingYear) {
    return {
      input,
      status: "Manual Review",
      reviewType: "Campaign Disclosure",
      reports: [],
      notes: "Candidate last name and reporting year are required."
    };
  }

  const response = await fetch(CAMPAIGN_REPORTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      candidate,
      office: input?.office || "",
      reportType: input?.reportType || "Any",
      electionType: input?.electionType || "Any",
        })
  });

  if (!response.ok) {
    throw new Error(
      `Campaign report search failed with status ${response.status}`
    );
  }

  const reports = await response.json();
const reportList = Array.isArray(reports) ? reports : [];

const profileSeedReport = reportList.find(
  (report) => report?.candidateFilerId && report?.seiFilerId
);

let campaignProfile = null;

if (profileSeedReport) {
  campaignProfile = await getCampaignProfile(
    profileSeedReport.candidateFilerId,
    profileSeedReport.seiFilerId
  );
}
  const requestedOffice = String(input?.office || "")
  .trim()
  .toLowerCase();

const openOffices = Array.isArray(campaignProfile?.openOffices)
  ? campaignProfile.openOffices
  : [];

const closedOffices = Array.isArray(campaignProfile?.closedOffices)
  ? campaignProfile.closedOffices
  : [];

const relevantOfficeRuns = [...openOffices, ...closedOffices].filter(
  (office) => {
    const officeMatches =
      String(office?.name || "").trim().toLowerCase() === requestedOffice;

    if (!officeMatches) return false;

    if (!office?.isClosed) return true;

    return isDueWithinFourYears(office?.end);
  }
);

const relevantFilerIds = new Set(
  relevantOfficeRuns
    .map((office) => office?.filerId)
    .filter(Boolean)
);

const relevantReports = reportList.filter(
  (report) =>
    relevantFilerIds.has(report?.candidateFilerId) &&
    String(report?.office || "").trim().toLowerCase() === requestedOffice
);
  const reportsWithinFourYears = relevantReports.filter((report) => {
  const filedDate = report?.lastUpdated;

  if (!filedDate) return false;

  return isDueWithinFourYears(filedDate);
});
  return {
    input,
    status: "Search Complete",
    reviewType: "Campaign Disclosure",
   reports: reportList,
    campaignProfile,
    relevantOfficeRuns,
relevantReports,
    reportsWithinFourYears,
    notes: "Campaign disclosure reports retrieved from the public filing system."
  };
}

module.exports = { checkCampaignCompliance };
