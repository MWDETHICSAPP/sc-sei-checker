const SUFFIXES = new Set(["jr","sr","ii","iii","iv","v"]);
function cleanText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normalizePersonInput(input = {}) {
  const yearNumber = Number(input.year || 2026);
  return {
    name: cleanText(input.name),
    jurisdiction: cleanText(input.jurisdiction || input.county || input.entity || ""),
    year: Number.isInteger(yearNumber) && yearNumber >= 2000 && yearNumber <= 2100 ? yearNumber : 2026
  };
}
function extractSurname(fullName) {
  const parts = cleanText(fullName).replace(/,/g," ").replace(/\./g,"").split(" ").filter(Boolean);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length-1].toLowerCase())) parts.pop();
  return parts.length ? parts[parts.length-1] : "";
}
module.exports = { cleanText, normalizePersonInput, extractSurname };
