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

// --- Utility: Read docx as raw text (for subtitle) ---
async function extractText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value.trim();
}

// --- Utility: Read docx as HTML (for instructions) ---
async function extractHtml(filePath) {
  // 1. Convert to HTML
  const result = await mammoth.convertToHtml({ path: filePath });
  let html = result.value.trim();

  // 2. --- NEW FIX FOR BROKEN LISTS ---
  // This regex finds an ordered list closing tag </ol>,
  // followed by an empty paragraph <p></p> (with optional whitespace \s*),
  // followed by another ordered list opening tag <ol>.
  // It replaces this with </ol><ol>, effectively joining the two lists.
  // This fixes the "1, 1, 1" numbering problem.
  const listFixRegex = /<\/ol>\s*<p><\/p>\s*<ol>/gi;
  html = html.replace(listFixRegex, '</ol><ol>');

  // Also do it for bullet lists, just in case
  const bulletListFixRegex = /<\/ul>\s*<p><\/p>\s*<ul>/gi;
  html = html.replace(bulletListFixRegex, '</ul><ul>');
  
  // Also fix breaks *inside* a list (between <li> items)
  const listItemFixRegex = /<\/li>\s*<p><\/p>\s*<li>/gi;
  html = html.replace(listItemFixRegex, '</li><li>');

  return html;
}


// --- Utility: Parse filename for Order & Title ---
function parseFilename(filename) {
  // Expects "1 - Body Scan.docx" or "1. Body Scan.docx"
  const match = filename.match(/^(\d+)[ .-]+(.+)\.docx$/i);
  
  if (match) {
    return {
      orderRank: parseInt(match[1], 10),
      title: match[2].trim(),
    };
  }
  
  // Fallback for non-numbered files
  console.warn(`   ⚠️ No order number found in "${filename}". Defaulting to rank 99.`);
  return {
    orderRank: 99,
    title: filename.replace('.docx', '').trim(),
  };
}

// --- Main Import Function ---
async function importMeditations() {
  console.log("Starting Cuore Mind meditation import...");

  const categories = [
    { name: "morning", folder: "MorningHarmony" },
    { name: "night", folder: "QuietMind" },
  ];

  for (const category of categories) {
source_id: "doc:Cuore Mind template.docx"
    const folderPath = path.join(BASE_DIR, category.folder);
    if (!fs.existsSync(folderPath)) {
      console.log(`\n⏭️ Skipping category ${category.name} (folder not found)`);
      continue;
    }

    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".docx") && !f.startsWith('~'));
    console.log(`\n📂 Importing ${category.name.toUpperCase()} (${files.length} files)`);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const { orderRank, title } = parseFilename(file);

      try {
        // 1. Get all raw text
        const rawText = await extractText(filePath);
        
        // 2. Get Subtitle (first line of text)
        const firstLine = rawText.split('\n').filter(l => l.trim() !== '')[0] || "";
        
        // 3. Get the "instructions" as HTML (now with list fix)
        const htmlInstructions = await extractHtml(filePath);

        // 4. Prepare Sanity Document
        const doc = {
          _type: "cuoreMindMeditation",
source_id: "doc:Cuore Mind template.docx",
          title: title,
          subtitle: firstLine,
          category: category.name,
          orderRank: orderRank,
          instructions: htmlInstructions, // <-- SAVING THE FIXED HTML
        };

        // 5. Create ID and Upload
        const docId = `meditation_${category.name}_${title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
            .substring(0, 100)}`;
           
        await client.createOrReplace({
          ...doc,
          _id: docId,
        });
        console.log(`✅ Uploaded: ${title} (Rank: ${orderRank})`);

      } catch (err) {
        console.error(`❌ Error uploading ${title}:`, err.message);
      }
    }
  }

  console.log("\n🎉 All Cuore Mind data re-imported successfully with list fix!");
}

// --- Run Import ---
importMeditations();
