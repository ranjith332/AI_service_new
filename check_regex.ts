function cleanDocName(userQuery: string) {
    const q = userQuery.toLowerCase();
    let docName = userQuery.replace(/tell me about|who is|what is|info on|details of|search for|show me|find doctor|doctor|dr\.|dr|about|give me/gi, "").trim();
    
    // Simulating match logic
    if (!docName || docName.length < 2) {
       const docMatch = userQuery.match(/(?:doctor|dr\.|dr)\s+([a-zA-Z\s]+)/i);
       if (docMatch?.[1]) docName = docMatch[1].trim();
    }
    return docName.trim();
}

console.log("Input: 'who is doctor raju boy' -> Extracted:", cleanDocName("who is doctor raju boy"));
console.log("Input: 'tell me about dr raju boy' -> Extracted:", cleanDocName("tell me about dr raju boy"));
console.log("Input: 'info on raju boy' -> Extracted:", cleanDocName("info on raju boy"));
console.log("Input: 'raju boy' -> Extracted:", cleanDocName("raju boy"));
