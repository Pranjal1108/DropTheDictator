import express from "express";

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.post("/bet", (req, res) => {
  const betAmount = Number(req.body.betAmount);

  if (!betAmount || betAmount <= 0) {
    res.status(400).json({ error: "Invalid bet" });
    return;
  }

  const r = Math.random();

  let multiplier;
  if (r < 0.55) multiplier = 0;
  else if (r < 0.80) multiplier = 0.6;
  else if (r < 0.93) multiplier = 1.3;
  else if (r < 0.98) multiplier = 2.0;
  else multiplier = 4.0;

  const targetPayout = betAmount * multiplier;

  res.json({
    targetPayout,
    cloudPlan: ["support", "boost", "boost", "terminator"]
  });
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});