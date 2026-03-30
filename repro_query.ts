const url = "http://localhost:3000/ai/query";
const body = {
  "tenant_id": "bc2428a0-604b-45c9-a04b-01e390ccace8",
  "user_query": "who is doctor raju boy"
};

async function repro() {
    console.log("Sending request to:", url);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        
        console.log("Status:", response.status);
        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

repro();
