import express from "express";

const app = express();

app.get("/", (_req, res) => {
  res.send("🚀 Hello from test server!");
});

app.listen(5000, () => {
  console.log("✅ Test server running at http://localhost:5000");
});
