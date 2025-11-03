import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { createClient } from "@sanity/client";

// --- Sanity Client Configuration ---
const client = createClient({
  projectId: "r1a9xgjr",
  dataset: "production",
  apiVersion: "2021-10-21",
  useCdn: false,
  token: process.env.SANITY_READ_TOKEN,
});

// --- Folder Paths ---
const BASE_DIR = path.join(process.cwd(), "_MIGRATION_DATA");
const KNOWLEDGE_LIST_PATH = path.join(BASE_DIR, "knowledgeList", "knowledge List.docx");

// --- Utility: Read docx text (for subtitles) ---
async function extractText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value.trim();
}

// --- Utility: Read docx as HTML (for details) ---
async function extractHtml(filePath) {
  const result = await mammoth.convertToHtml({ path: filePath });
  return result.value.trim();
}

/**
 * Fixes the "1, 1, 1" numbering issue by removing
 * empty <p> tags that break <ol> and <ul> lists.
 */
function cleanHtmlLists(html) {
  if (!html) return "";
  
  // Fixes <ol><li>...</li></ol> <p></p> <ol><li>...</li></ol>
  const olRegex = /<\/ol>\s*<p><\/p>\s*<ol>/gi;
  // Fixes <ul><li>...</li></ul> <p></p> <ul><li>...</li></ul>
  const ulRegex = /<\/ul>\s*<p><\/p>\s*<ul>/gi;
  // Fixes <li>...</li> <p></p> <li>...</li>
  const liRegex = /<\/li>\s*<p><\/p>\s*<li>/gi;

  return html
    .replace(olRegex, '')  // Stitch <ol> lists together
    .replace(ulRegex, '')  // Stitch <ul> lists together
    .replace(liRegex, '</li><li>'); // Stitch list items together
}

// --- Utility: normalize titles for consistent lookup ---
const normalize = (str) => str.trim().toLowerCase().replace(/\s+/g, " ");

// --- Step 1: Parse Knowledge List (title + one-liner) ---
async function parseKnowledgeList() {
  const rawText = await extractText(KNOWLEDGE_LIST_PATH);
  const lines = rawText.split("\n").filter((l) => l.trim() !== "");
  const knowledgeMap = new Map();
  for (let i = 0; i < lines.length; i += 2) {
    const title = lines[i].trim();
    const oneLiner = lines[i + 1]?.trim() || "";
    knowledgeMap.set(normalize(title), oneLiner);
  }
  return knowledgeMap;
}

// --- Step 2: Import all condition folders ---
async function importConditionData() {
  const conditions = [
    { name: "diabetes", folder: "Diabetes" },
    { name: "hypertension", folder: "Hypertension" },
    { name: "diabetes_hypertension", folder: "Diabetes+Hypertension" },
    { name: "smoking", folder: "Smoking" },
    { name: "general", folder: "General" },
  ];

  const knowledgeMap = await parseKnowledgeList();

  for (const condition of conditions) {
    const folderPath = path.join(BASE_DIR, condition.folder);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".docx") && !f.startsWith('~'));
    console.log(`\n📂 Importing ${condition.name.toUpperCase()} (${files.length} files)`);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const title = path.basename(file, ".docx");
      
      try {
        // 1. Get subtitle from the master list
        const oneLiner = knowledgeMap.get(normalize(title)) || "";
        
        // 2. Get the raw HTML from the doc
        const rawHtml = await extractHtml(filePath);

        // 3. Clean the HTML to fix list numbering
        const fixedHtml = cleanHtmlLists(rawHtml);

        // 4. Prepare the doc
        const doc = {
          _type: "knowledgeCard",
          title: title,
          subtitle: oneLiner,
          conditionType: condition.name,
          details: fixedHtml, // <-- Save the fixed HTML string
        };

        // 5. Create ID and Upload
          await client.createOrReplace({
            ...doc,
            _id: `knowledge_${condition.name}_${title
             .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, "")
              .substring(0, 200)}`,
          });
          console.log(`✅ Uploaded: ${title}`);
  
      } catch (err) {
          console.error(`❌ Error uploading ${title}:`, err.message);
        }
    }
  }

  console.log("\n🎉 All Cuore Knowledge data imported successfully!");
}

// --- Run Import ---
importConditionData();
