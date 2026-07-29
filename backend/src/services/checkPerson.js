const { normalizePersonInput, extractSurname } = require("../matching/names");

async function checkPerson(input) {
  const normalized = normalizePersonInput(input);
  if (!normalized.name) {
    const error = new Error("A name is required.");
    error.status = 400;
    throw error;
  }
  return {
    input: normalized,
    search: { surname: extractSurname(normalized.name), adapter: "not-connected" },
    status: "Manual Review",
    confidence: 0,
    matchedFilingName: "",
    filingUrl: "",
    notes: "The backend is online. The live public SEI search adapter is the next integration step."
  };
}
module.exports = { checkPerson };
