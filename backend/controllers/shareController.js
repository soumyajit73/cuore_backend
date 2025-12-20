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
      * { box-sizing: border-box; }

      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 18px;
        font-size: 11px;
        color: #0f172a;
      }

      h1 {
        font-size: 18px;
        margin-bottom: 6px;
      }

      h2 {
        font-size: 13px;
        margin: 10px 0 6px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 2px;
      }

      .muted {
        color: #64748b;
        font-size: 10px;
      }

      .divider {
        height: 1px;
        background: #e5e7eb;
        margin: 10px 0;
      }

      .card {
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px;
        margin-bottom: 8px;
      }

      .grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      ul {
        padding-left: 14px;
        margin: 4px 0;
      }

      li {
        margin-bottom: 4px;
      }

      p {
        margin: 4px 0;
      }
    </style>
  </head>

  <body>

    <h1>Cuore Health Report</h1>

    <!-- PROFILE -->
    <h2>Profile</h2>
    <div class="grid-2">
      <div class="card">
        <p><b>Name:</b> ${p.name}</p>
        <p><b>Age:</b> ${p.age}</p>
        <p><b>Smoker:</b> ${p.smoker}</p>
      </div>

      <div class="card">
        <p><b>Past History:</b> ${p.pastHO || "—"}</p>
        <p>
          <b>Last Consulted:</b>
          ${p.lastConsulted ? new Date(p.lastConsulted).toDateString() : "—"}
        </p>
      </div>
    </div>

    <!-- MEDICATIONS -->
    <div class="divider"></div>

    <h2>Medications</h2>
    <div class="card">
      <ul>
        ${
          p.medications && p.medications.length
            ? p.medications.map(m => `<li>${m}</li>`).join("")
            : "<li>—</li>"
        }
      </ul>
    </div>

    <!-- HEALTH OBSERVATIONS -->
    <div class="divider"></div>

    <h2>Health Observations</h2>
    <div class="card">
      <ul>
        <li>
          Heart Rate:
          ${h.heartRate.value}
          <span class="muted">(${h.heartRate.status})</span>
        </li>
        <li>
          Blood Pressure:
          ${h.bloodPressure.value}
          <span class="muted">(${h.bloodPressure.status})</span>
        </li>
        <li>
          Blood Sugar (PP):
          ${h.bloodSugarPP.value}
          <span class="muted">(${h.bloodSugarPP.status})</span>
        </li>
        <li>
          HbA1c:
          ${h.HbA1c.value}
          <span class="muted">(${h.HbA1c.status})</span>
        </li>
        <li>
          TG / HDL Ratio:
          ${h.TG_HDL_Ratio.value}
          <span class="muted">(${h.TG_HDL_Ratio.status})</span>
        </li>
        <li>
          HsCRP:
          ${h.HsCRP.value} ${h.HsCRP.unit}
          <span class="muted">(${h.HsCRP.status})</span>
        </li>
        <li>
          Lifestyle Score:
          ${h.lifestyleScore.value}
          <span class="muted">(${h.lifestyleScore.status})</span>
        </li>
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
      * { box-sizing: border-box; }

      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 18px;
        font-size: 11px;
        color: #0f172a;
      }

      h1 {
        font-size: 18px;
        margin-bottom: 6px;
      }

      h2 {
        font-size: 13px;
        margin: 10px 0 6px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 2px;
      }

      .muted {
        color: #64748b;
        font-size: 10px;
      }

      .card {
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px;
        margin-bottom: 8px;
      }

      ul {
        padding-left: 14px;
        margin: 4px 0;
      }

      li {
        margin-bottom: 4px;
      }

      .grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .grid-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }
    </style>
  </head>

  <body>

    <h1>Cuore Score Report</h1>
    <p class="muted"><b>Date:</b> ${data.current_date}</p>

    <!-- SCORE SUMMARY -->
    <div class="grid-2">
      <div class="card">
        <p><b>Health Score:</b> ${m.health_score}</p>
        <p>
          <b>Time to Target:</b>
          ${m.estimated_time_to_target.value}
          ${m.estimated_time_to_target.unit}
        </p>
      </div>

      <div class="card">
        <p>
          <b>Metabolic Age:</b>
          ${m.metabolic_age.value} ${m.metabolic_age.unit}
        </p>
        <p class="muted">Gap: ${m.metabolic_age.gap} years</p>
      </div>
    </div>

    <!-- BODY METRICS -->
    <h2>Body Metrics</h2>
    <div class="card">
      <ul>
        <li>
          Weight:
          ${m.weight.current}${m.weight.unit}
          → ${m.weight.target}${m.weight.unit}
          <span class="muted">(${m.weight.status})</span>
        </li>
        <li>
          BMI:
          ${m.bmi.value}
          → ${m.bmi.target}
          <span class="muted">(${m.bmi.status})</span>
        </li>
        <li>
          Body Fat:
          ${m.vitals.body_fat.value}${m.vitals.body_fat.unit}
          → ${m.vitals.body_fat.target}${m.vitals.body_fat.unit}
          <span class="muted">(${m.vitals.body_fat.status})</span>
        </li>
      </ul>
    </div>

    <!-- LIFESTYLE + VITALS -->
    <div class="grid-2">
      <div>
        <h2>Lifestyle</h2>
        <div class="card">
          <ul>
            <li>
              Lifestyle Score:
              ${m.lifestyle_score.value}${m.lifestyle_score.unit}
              → ${m.lifestyle_score.target}${m.lifestyle_score.unit}
              <span class="muted">(${m.lifestyle_score.status})</span>
            </li>
            <li>
              Calories:
              ${m.recommended.calories.value}
              ${m.recommended.calories.unit}
            </li>
            <li>
              Exercise:
              ${m.recommended.exercise.value}
              ${m.recommended.exercise.unit}
            </li>
          </ul>
        </div>
      </div>

      <div>
        <h2>Vitals</h2>
        <div class="card">
          <ul>
            <li>
              Heart Rate:
              ${m.vitals.heartRate.value}
              <span class="muted">(${m.vitals.heartRate.status})</span>
            </li>
            <li>
              BP:
              ${m.vitals.blood_pressure.current}
              → ${m.vitals.blood_pressure.target}
              <span class="muted">
                (U:${m.vitals.blood_pressure.status.upper},
                 L:${m.vitals.blood_pressure.status.lower})
              </span>
            </li>
            <li>
              Fasting Sugar:
              ${m.vitals.blood_sugar.fasting.value}
              → ${m.vitals.blood_sugar.fasting.target}
            </li>
            <li>
              PP Sugar:
              ${m.vitals.blood_sugar.after_meal.value}
              → ${m.vitals.blood_sugar.after_meal.target}
            </li>
            <li>
              HbA1c:
              ${m.vitals.blood_sugar.A1C.value}
              → ${m.vitals.blood_sugar.A1C.target}
            </li>
            <li>
              TG/HDL:
              ${m.vitals.cholesterol.tg_hdl_ratio.value}
              → ${m.vitals.cholesterol.tg_hdl_ratio.target}
            </li>
            <li>
              HsCRP:
              ${m.vitals.HsCRP.value} ${m.vitals.HsCRP.unit}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- MAIN FOCUS -->
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
