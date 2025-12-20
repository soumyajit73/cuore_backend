const { chromium } = require("playwright-chromium");

const {
  getCuoreHealthInternal
} = require("../controllers/cuoreHealthController");

const {
  getCuoreScoreDetailsInternal
} = require("../controllers/timelineController");

// -------------------------
// HTML GENERATORS
// -------------------------

function generateCuoreHealthHTML(data) {
  const p = data.profile;
  const h = data.healthObservations;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Cuore Health Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { color: #0f172a; }
      h2 { margin-top: 24px; }
      .card {
        border: 1px solid #ddd;
        padding: 14px;
        border-radius: 8px;
        margin-bottom: 16px;
      }
      ul { padding-left: 18px; }
      li { margin-bottom: 6px; }
      .muted { color: #666; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Cuore Health Report</h1>

    <h2>Profile</h2>
    <div class="card">
      <p><b>Name:</b> ${p.name}</p>
      <p><b>Age:</b> ${p.age}</p>
      <p><b>Smoker:</b> ${p.smoker}</p>
      <p><b>Past History:</b> ${p.pastHO || "—"}</p>
      <p><b>Last Consulted:</b> ${
        p.lastConsulted ? new Date(p.lastConsulted).toDateString() : "—"
      }</p>

      <p><b>Medications:</b></p>
      <ul>
        ${
          p.medications && p.medications.length
            ? p.medications.map(m => `<li>${m}</li>`).join("")
            : "<li>—</li>"
        }
      </ul>
    </div>

    <h2>Health Observations</h2>
    <div class="card">
      <ul>
        <li>Heart Rate: ${h.heartRate.value} <span class="muted">(${h.heartRate.status})</span></li>
        <li>Blood Pressure: ${h.bloodPressure.value} <span class="muted">(${h.bloodPressure.status})</span></li>
        <li>Blood Sugar (PP): ${h.bloodSugarPP.value} <span class="muted">(${h.bloodSugarPP.status})</span></li>
        <li>HbA1c: ${h.HbA1c.value} <span class="muted">(${h.HbA1c.status})</span></li>
        <li>TG / HDL Ratio: ${h.TG_HDL_Ratio.value} <span class="muted">(${h.TG_HDL_Ratio.status})</span></li>
        <li>HsCRP: ${h.HsCRP.value} ${h.HsCRP.unit} <span class="muted">(${h.HsCRP.status})</span></li>
        <li>Lifestyle Score: ${h.lifestyleScore.value} <span class="muted">(${h.lifestyleScore.status})</span></li>
      </ul>
    </div>
  </body>
  </html>
  `;
}

function generateCuoreScoreHTML(data) {
  const m = data.health_metrics;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Cuore Score Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { color: #0f172a; }
      h2 { margin-top: 24px; }
      .card {
        border: 1px solid #ddd;
        padding: 14px;
        border-radius: 8px;
        margin-bottom: 16px;
      }
      ul { padding-left: 18px; }
      li { margin-bottom: 6px; }
      .muted { color: #666; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Cuore Score Report</h1>

    <p><b>Date:</b> ${data.current_date}</p>

    <div class="card">
      <p><b>Health Score:</b> ${m.health_score}</p>
      <p><b>Estimated Time to Target:</b> ${m.estimated_time_to_target.value} ${m.estimated_time_to_target.unit}</p>
    </div>

    <h2>Body Metrics</h2>
    <div class="card">
      <ul>
        <li>
          Metabolic Age: ${m.metabolic_age.value} ${m.metabolic_age.unit}
          <span class="muted">(Gap: ${m.metabolic_age.gap} years)</span>
        </li>
        <li>
          Weight: ${m.weight.current}${m.weight.unit}
          → Target: ${m.weight.target}${m.weight.unit}
        </li>
      </ul>
    </div>

    <h2>Main Focus Areas</h2>
    <div class="card">
      <ul>
        ${m.main_focus.map(focus => `<li>${focus}</li>`).join("")}
      </ul>
    </div>
  </body>
  </html>
  `;
}

// -------------------------
// SHARE REPORT API
// -------------------------

exports.shareReport = async (req, res) => {
  let browser;

  try {
    const userId = req.user.userId;
    const { page } = req.body;

    if (!page) {
      return res.status(400).json({ error: "Page type required" });
    }

    let data;
    let html;

    if (page === "CUORE_HEALTH") {
      data = await getCuoreHealthInternal(userId);
      html = generateCuoreHealthHTML(data);
    } else if (page === "CUORE_SCORE") {
      data = await getCuoreScoreDetailsInternal(userId);
      html = generateCuoreScoreHTML(data);
    } else {
      return res.status(400).json({ error: "Invalid page type" });
    }

    // ---- HTML → PDF (Playwright) ----
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext();
    const pageObj = await context.newPage();

    await pageObj.setContent(html, { waitUntil: "networkidle" });

    const pdfBuffer = await pageObj.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    // ---- Send PDF ----
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${page}.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    res.send(pdfBuffer);

  } catch (err) {
    console.error("Error in shareReport:", err);
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
};
