const payload = {
  user_query: "Show my prescriptions",
  tenant_id: "bc2428a0-604b-45c9-a04b-01e390ccace8"
};

const resp = await fetch("http://localhost:3000/ai/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

console.log("Status:", resp.status);
const data = await resp.json();
console.log("JSON:", JSON.stringify(data, null, 2));
process.exit(0);
