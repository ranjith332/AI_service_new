// Manually testing the name extraction logic from AiQueryService
function cleanDoctorName(query: string): string {
    return query
      .replace(/tell me about|who is|what is|info on|details of|search for|show me|find doctor|doctor|dr\.|dr|about|give me|specialist|experience|bio/gi, "")
      .replace(/[?,.!]/g, " ")
      .replace(/\b(his|her|details|info|please|now|today|profile|biography|specialty|exp|me|of)\b/gi, "")
      .trim()
      .replace(/\s+/g, " ");
}

const testQueries = [
    "ramesh kumar? his",
    "tell me about Dr. John Smith details",
    "doctor saravanan details please",
    "Who is Dr. Ramesh? info",
    "ramesh kumar?  his"
];

console.log("🚀 Testing Name Extraction Fix...\n");

testQueries.forEach(q => {
    console.log(`Input: "${q}"`);
    console.log(`Output: "${cleanDoctorName(q)}"`);
    console.log("---");
});
