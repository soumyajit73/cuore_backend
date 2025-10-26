// --- importCuoreMind.js (HTML Version) ---
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
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j',
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
  const result = await mammoth.convertToHtml({ path: filePath });
  return result.value.trim();
}

// --- Utility: Parse filename for Order & Title ---
function parseFilename(filename) {
  const match = filename.match(/^(\d+)[ .-]+(.+)\.docx$/i);
  if (match) {
    return {
      orderRank: parseInt(match[1], 10),
      title: match[2].trim(),
    };
  }
  console.warn(`   ⚠️ No order number found in "${filename}". Defaulting to rank 99.`);
  return {
    orderRank: 99,
    title: filename.replace('.docx', '').trim(),
  };
}

// --- Main Import Function ---
async function importMeditations() {
  console.log("Starting Cuore Mind meditation import (HTML Mode)...");

  const categories = [
    { name: "morning", folder: "MorningHarmony" },
    { name: "night", folder: "QuietMind" },
  ];

  for (const category of categories) {
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
        // 1. Get plain text to extract the subtitle
        const rawText = await extractText(filePath);
        const subtitle = rawText.split('\n').filter(l => l.trim() !== '')[0] || "";
        
        // 2. Get the full document as HTML
        const instructionsHtml = await extractHtml(filePath);

        // 3. Prepare Sanity Document
        const doc = {
          _type: "cuoreMindMeditation",
          title: title,
          subtitle: subtitle,
          category: category.name,
          orderRank: orderRank,
          instructions: instructionsHtml, // <-- SAVING THE HTML STRING
        };

        // 4. Create ID and Upload
        const docId = `meditation_${category.name}_${title
        .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
            .substring(0, 100)}`;
            
        await client.createOrReplace({
          ...doc,
          _id: docId,
        });
        console.log(`✅ Uploaded HTML for: ${title} (Rank: ${orderRank})`);

      } catch (err) {
        console.error(`❌ Error uploading ${title}:`, err.message);
      }
    }
  }

  console.log("\n🎉 All Cuore Mind data imported successfully!");
}

// --- Run Import ---
importMeditations();
