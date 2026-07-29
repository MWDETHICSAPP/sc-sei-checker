const { normalizePersonInput, extractSurname } = require("../matching/names");

/**
 * This function is deliberately conservative until the authorized
 * public-search adapter is connected. A failed or unavailable search
 * must never be reported as "Not Filed."
 */
async function checkPerson(input) {
  const normalized = normalizePersonInput(input);

  if (!normalized.name) {
    const error = new Error("A name is required.");
    error.status = 400;
    throw error;
  }

  const surname = extractSurname(normalized.name);

  return {
    input: {
      name: normalized.name,
      jurisdiction: normalized.jurisdiction,
      year: normalized.year,
    },
    search: {
      surname,
      adapter: "not-connected",
    },
    status: "Manual Review",
    confidence: 0,
    matchedFilingName: "",
    filingUrl: "",
    notes:
      "The backend is online, but the authorized live SEI search adapter has not yet been connected.",
  };
}

module.exports = { checkPerson };
