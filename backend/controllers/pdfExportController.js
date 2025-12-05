const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const { getCuoreHealthData } = require("./cuoreHealthController");
const timelineController = require("./timelineController");

exports.exportPDF = async (req, res) => {
  try {
    const userId = req.params.userId;
    const type = req.query.type;

    if (!type) {
      return res.status(400).json({ error: "Please pass ?type=" });
    }

    const doc = new PDFDocument();
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${type}.pdf`,
      });
      res.send(pdfBuffer);
    });

    // ------------------------------
    // FETCH DATA BASED ON TYPE
    // ------------------------------
    let data;

    if (type === "cuore-health") {
      // call cuoreHealth controller internally
      data = (await getCuoreHealthData(req, null, true))?.data;

    } else if (type === "cuore-score") {
      // call cuore score details
      data = await timelineController.getCuoreScoreDetails(req, null, true);

    } else {
      data = { error: "Unknown PDF type" };
    }

    // ------------------------------
    // WRITE INTO PDF (simple for prototype)
    // ------------------------------
    doc.fontSize(22).text("Cuore App Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Export Type: ${type}`);
    doc.text(`Generated: ${dayjs().format("DD MMM YYYY, h:mm A")}`);
    doc.moveDown();
    doc.fontSize(11).text(JSON.stringify(data, null, 2));

    doc.end();

  } catch (err) {
    console.error("PDF Export Error:", err);
    return res.status(500).json({ error: "PDF generation failed" });
  }
};
