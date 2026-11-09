
const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Tickety Level Submission Gateway"
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gateway listening on port ${PORT}`);
});
