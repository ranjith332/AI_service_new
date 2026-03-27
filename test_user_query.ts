const payload = {
  tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8",
  user_query: "no of appointments"
};

async function test() {
  console.log("Testing /ai/query with user payload...");
  try {
    const response = await fetch("http://localhost:3000/ai/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error during fetch:", error);
  }
}

test();
