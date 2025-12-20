const puppeteer = require("puppeteer");



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
        p.lastConsulted
          ? new Date(p.lastConsulted).toDateString()
          : "—"
      }</p>

      <p><b>Medications:</b></p>
      <ul>
        ${(p.medications && p.medications.length)
          ? p.medications.map(m => `<li>${m}</li>`).join("")
          : "<li>—</li>"
        }
      </ul>
    </div>

    <h2>Health Observations</h2>
    <div class="card">
      <ul>
        <li>
          Heart Rate: ${h.heartRate.value}
          <span class="muted">(${h.heartRate.status})</span>
        </li>

        <li>
          Blood Pressure: ${h.bloodPressure.value}
          <span class="muted">(${h.bloodPressure.status})</span>
        </li>

        <li>
          Blood Sugar (PP): ${h.bloodSugarPP.value}
          <span class="muted">(${h.bloodSugarPP.status})</span>
        </li>

        <li>
          HbA1c: ${h.HbA1c.value}
          <span class="muted">(${h.HbA1c.status})</span>
        </li>

        <li>
          TG / HDL Ratio: ${h.TG_HDL_Ratio.value}
          <span class="muted">(${h.TG_HDL_Ratio.status})</span>
        </li>

        <li>
          HsCRP: ${h.HsCRP.value} ${h.HsCRP.unit}
          <span class="muted">(${h.HsCRP.status})</span>
        </li>

        <li>
          Lifestyle Score: ${h.lifestyleScore.value}
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
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { color: #0f172a; }
      h2 { margin-top: 24px; }
      h3 { margin-top: 16px; }
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

    <!-- OVERALL SCORE -->
    <div class="card">
      <p><b>Health Score:</b> ${m.health_score}</p>
      <p>
        <b>Estimated Time to Target:</b>
        ${m.estimated_time_to_target.value}
        ${m.estimated_time_to_target.unit}
      </p>
    </div>

    <!-- BODY METRICS -->
    <h2>Body Metrics</h2>
    <div class="card">
      <ul>
        <li>
          Metabolic Age:
          ${m.metabolic_age.value} ${m.metabolic_age.unit}
          <span class="muted">(Gap: ${m.metabolic_age.gap} years)</span>
        </li>

        <li>
          Weight:
          ${m.weight.current}${m.weight.unit}
          →
          Target: ${m.weight.target}${m.weight.unit}
          <span class="muted">(${m.weight.status})</span>
        </li>

        <li>
          BMI:
          ${m.bmi.value}
          →
          Target: ${m.bmi.target}
          <span class="muted">(${m.bmi.status})</span>
        </li>

        <li>
          Body Fat:
          ${m.vitals.body_fat.value}${m.vitals.body_fat.unit}
          →
          Target: ${m.vitals.body_fat.target}${m.vitals.body_fat.unit}
          <span class="muted">(${m.vitals.body_fat.status})</span>
        </li>
      </ul>
    </div>

    <!-- LIFESTYLE -->
    <h2>Lifestyle</h2>
    <div class="card">
      <ul>
        <li>
          Lifestyle Score:
          ${m.lifestyle_score.value}${m.lifestyle_score.unit}
          →
          Target: ${m.lifestyle_score.target}${m.lifestyle_score.unit}
          <span class="muted">(${m.lifestyle_score.status})</span>
        </li>

        <li>
          Recommended Calories:
          ${m.recommended.calories.value} ${m.recommended.calories.unit}
        </li>

        <li>
          Recommended Exercise:
          ${m.recommended.exercise.value} ${m.recommended.exercise.unit}
        </li>
      </ul>
    </div>

    <!-- VITALS -->
    <h2>Vitals</h2>
    <div class="card">
      <ul>
        <li>
          Heart Rate:
          ${m.vitals.heartRate.value}
          <span class="muted">(${m.vitals.heartRate.status})</span>
        </li>

        <li>
          Blood Pressure:
          ${m.vitals.blood_pressure.current}
          →
          Target: ${m.vitals.blood_pressure.target}
          <span class="muted">
            (Upper: ${m.vitals.blood_pressure.status.upper},
             Lower: ${m.vitals.blood_pressure.status.lower})
          </span>
        </li>

        <li>
          Blood Sugar (Fasting):
          ${m.vitals.blood_sugar.fasting.value}
          →
          Target: ${m.vitals.blood_sugar.fasting.target}
          <span class="muted">(${m.vitals.blood_sugar.fasting.status})</span>
        </li>

        <li>
          Blood Sugar (After Meal):
          ${m.vitals.blood_sugar.after_meal.value}
          →
          Target: ${m.vitals.blood_sugar.after_meal.target}
          <span class="muted">(${m.vitals.blood_sugar.after_meal.status})</span>
        </li>

        <li>
          HbA1c:
          ${m.vitals.blood_sugar.A1C.value}
          →
          Target: ${m.vitals.blood_sugar.A1C.target}
          <span class="muted">(${m.vitals.blood_sugar.A1C.status})</span>
        </li>

        <li>
          TG / HDL Ratio:
          ${m.vitals.cholesterol.tg_hdl_ratio.value}
          →
          Target: ${m.vitals.cholesterol.tg_hdl_ratio.target}
          <span class="muted">(${m.vitals.cholesterol.tg_hdl_ratio.status})</span>
        </li>

        <li>
          HsCRP:
          ${m.vitals.HsCRP.value} ${m.vitals.HsCRP.unit}
          <span class="muted">(${m.vitals.HsCRP.status})</span>
        </li>
      </ul>
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
    } 
    else if (page === "CUORE_SCORE") {
      data = await getCuoreScoreDetailsInternal(userId);
      html = generateCuoreScoreHTML(data);
    } 
    else {
      return res.status(400).json({ error: "Invalid page type" });
    }

    // ---- HTML → PDF ----
const isProduction = process.env.NODE_ENV === "production";

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu"
  ],
});


console.log("Using CHROME_PATH:", process.env.CHROME_PATH);





    const pageObj = await browser.newPage();
    await pageObj.setContent(html, { waitUntil: "networkidle0" });

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
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
};
