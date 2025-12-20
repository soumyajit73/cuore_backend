const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-chromium");

const {
  getCuoreHealthInternal
} = require("../controllers/cuoreHealthController");

const {
  getCuoreScoreDetailsInternal
} = require("../controllers/timelineController");

// -------------------------
// LOGO INITIALIZATION
// -------------------------
const logoPath = path.join(__dirname, "../data/cuore-logo-svg.svg");
const logoSVG = fs.existsSync(logoPath)
  ? fs.readFileSync(logoPath, "utf8")
  : "";

// -------------------------
// COMMON STYLES
// -------------------------
function baseStyles() {
  return `
    * { box-sizing: border-box; }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 22px;
      font-size: 12.5px;
      color: #0f172a;
      border: 2px solid #0f172a;
    }

    h1 {
      font-size: 20px;
      margin: 0;
    }

    h2 {
      font-size: 14px;
      margin: 12px 0 6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 3px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .logo svg {
      height: 75px;
    }

    .card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 10px;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    ul {
      padding-left: 16px;
      margin: 6px 0;
    }

    li {
      margin-bottom: 6px;
    }

    p {
      margin: 5px 0;
    }

    .muted {
      color: #64748b;
      font-size: 11px;
    }

    /* Status dots */
    .dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      margin-right: 8px;
      vertical-align: middle;
    }

    .green { background: #22c55e; }
    .orange { background: #f59e0b; }
    .red { background: #ef4444; }
    .unknown { background: #94a3b8; }
  `;
}

// -------------------------
// HEALTH REPORT HTML
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
    <style>${baseStyles()}</style>
  </head>
  <body>

    <div class="header">
      <div class="logo">${logoSVG}</div>
      <h1>Cuore Health Report</h1>
    </div>

    <h2>Profile</h2>
    <div class="grid-2">
      <div class="card">
        <p><b>Name:</b> ${p.name}</p>
        <p><b>Age:</b> ${p.age}</p>
        <p><b>Smoker:</b> ${p.smoker}</p>
      </div>
      <div class="card">
        <p><b>Past History:</b> ${p.pastHO || "—"}</p>
        <p><b>Last Consulted:</b> ${p.lastConsulted ? new Date(p.lastConsulted).toDateString() : "—"}</p>
      </div>
    </div>

    <h2>Medications</h2>
    <div class="card">
      <ul>
        ${
          p.medications?.length
            ? p.medications.map(m => `<li>${m}</li>`).join("")
            : "<li>—</li>"
        }
      </ul>
    </div>

    <h2>Health Observations</h2>
    <div class="card">
      <ul>
        <li><span class="dot ${h.heartRate.status}"></span>Heart Rate: ${h.heartRate.value}</li>
        <li><span class="dot ${h.bloodPressure.status}"></span>Blood Pressure: ${h.bloodPressure.value}</li>
        <li><span class="dot ${h.bloodSugarPP.status}"></span>Blood Sugar (PP): ${h.bloodSugarPP.value}</li>
        <li><span class="dot ${h.HbA1c.status}"></span>HbA1c: ${h.HbA1c.value}</li>
        <li><span class="dot ${h.TG_HDL_Ratio.status}"></span>TG / HDL Ratio: ${h.TG_HDL_Ratio.value}</li>
        <li><span class="dot ${h.HsCRP.status}"></span>HsCRP: ${h.HsCRP.value} ${h.HsCRP.unit}</li>
        <li><span class="dot ${h.lifestyleScore.status}"></span>Lifestyle Score: ${h.lifestyleScore.value}</li>
      </ul>
    </div>

  </body>
  </html>
  `;
}

// -------------------------
// SCORE REPORT HTML
// -------------------------
function generateCuoreScoreHTML(data) {
  const m = data.health_metrics;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Cuore Score Report</title>
    <style>${baseStyles()}</style>
  </head>
  <body>

    <div class="header">
      <div class="logo">${logoSVG}</div>
      <h1>Cuore Score Report</h1>
    </div>

    <p class="muted"><b>Date:</b> ${data.current_date}</p>

    <div class="grid-2">
      <div class="card">
        <p><b>Health Score:</b> ${m.health_score}</p>
        <p><b>Time to Target:</b> ${m.estimated_time_to_target.value} ${m.estimated_time_to_target.unit}</p>
      </div>
      <div class="card">
        <p><b>Metabolic Age:</b> ${m.metabolic_age.value} ${m.metabolic_age.unit}</p>
        <p class="muted">Gap: ${m.metabolic_age.gap} years</p>
      </div>
    </div>

    <h2>Body Metrics</h2>
    <div class="card">
      <ul style="list-style: none; padding-left: 0;">
        <li>
          <span class="dot ${m.weight.status}"></span>
          <b>Weight:</b> ${m.weight.current}${m.weight.unit} → ${m.weight.target}${m.weight.unit} 
          
        </li>
        <li>
          <span class="dot ${m.bmi.status}"></span>
          <b>BMI:</b> ${m.bmi.value} → ${m.bmi.target} 
         
        </li>
        <li>
          <span class="dot ${m.vitals.body_fat.status}"></span>
          <b>Body Fat:</b> ${m.vitals.body_fat.value}${m.vitals.body_fat.unit} → ${m.vitals.body_fat.target}${m.vitals.body_fat.unit} 
          
        </li>
      </ul>
    </div>

    <div class="grid-2">
      <div>
        <h2>Lifestyle</h2>
        <div class="card">
          <ul style="list-style: none; padding-left: 0;">
            <li>
              <span class="dot ${m.lifestyle_score.status}"></span>
              <b>Score:</b> ${m.lifestyle_score.value}${m.lifestyle_score.unit} → ${m.lifestyle_score.target}${m.lifestyle_score.unit} 
              
            </li>
            <li style="margin-left: 18px;"><b>Calories:</b> ${m.recommended.calories.value} ${m.recommended.calories.unit}</li>
            <li style="margin-left: 18px;"><b>Exercise:</b> ${m.recommended.exercise.value} ${m.recommended.exercise.unit}</li>
          </ul>
        </div>
      </div>

      <div>
        <h2>Vitals</h2>
        <div class="card">
          <ul style="list-style: none; padding-left: 0;">
            <li><span class="dot ${m.vitals.heartRate.status}"></span><b>Heart Rate:</b> ${m.vitals.heartRate.value}</li>
            <li><span class="dot ${m.vitals.blood_pressure.status.upper}"></span><b>BP:</b> ${m.vitals.blood_pressure.current}</li>
            
            <li>
              <span class="dot ${m.vitals.blood_sugar.fasting.status}"></span>
              <b>Fasting Sugar:</b> ${m.vitals.blood_sugar.fasting.value} 
              <span class="muted">→ ${m.vitals.blood_sugar.fasting.target}</span>
            </li>
            
            <li>
              <span class="dot ${m.vitals.blood_sugar.after_meal.status}"></span>
              <b>PP Sugar:</b> ${m.vitals.blood_sugar.after_meal.value} 
              <span class="muted">→ ${m.vitals.blood_sugar.after_meal.target}</span>
            </li>
            
            <li>
              <span class="dot ${m.vitals.blood_sugar.A1C.status}"></span>
              <b>HbA1c:</b> ${m.vitals.blood_sugar.A1C.value} 
              <span class="muted">→ ${m.vitals.blood_sugar.A1C.target}</span>
            </li>
            
            <li>
              <span class="dot ${m.vitals.cholesterol.tg_hdl_ratio.status}"></span>
              <b>TG/HDL:</b> ${m.vitals.cholesterol.tg_hdl_ratio.value} 
              <span class="muted">→ ${m.vitals.cholesterol.tg_hdl_ratio.target}</span>
            </li>
            
            <li><span class="dot ${m.vitals.HsCRP.status}"></span><b>HsCRP:</b> ${m.vitals.HsCRP.value} ${m.vitals.HsCRP.unit}</li>
          </ul>
        </div>
      </div>
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

    let html;

    if (page === "CUORE_HEALTH") {
      const data = await getCuoreHealthInternal(userId);
      html = generateCuoreHealthHTML(data);
    } else if (page === "CUORE_SCORE") {
      const data = await getCuoreScoreDetailsInternal(userId);
      html = generateCuoreScoreHTML(data);
    } else {
      return res.status(400).json({ error: "Invalid page type" });
    }

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
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });

    await browser.close();

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
