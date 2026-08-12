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

  return {
    input,
    status: "Search Complete",
    reviewType: "Campaign Disclosure",
    reports: Array.isArray(reports) ? reports : [],
    notes: "Campaign disclosure reports retrieved from the public filing system."
  };
}

module.exports = { checkCampaignCompliance };
