// --- importCuoreKnowledge.js ---
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { createClient } from "@sanity/client";

// --- Sanity Client Configuration ---
const client = createClient({
  projectId: "r1a9xgjr", // 🔹 replace with your actual Sanity project ID
  dataset: "production",
  apiVersion: "2021-10-21",
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // ensure token in .env
});

// --- Folder Paths ---
const BASE_DIR = path.join(process.cwd(), "_MIGRATION_DATA");
const KNOWLEDGE_LIST_PATH = path.join(BASE_DIR, "knowledgeList", "knowledge List.docx");

// --- Utility: Read docx text ---
async function extractText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value.trim();
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

    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".docx"));
    console.log(`\n📂 Importing ${condition.name.toUpperCase()} (${files.length} files)`);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const text = await extractText(filePath);

      const title = path.basename(file, ".docx");
      const details = text.trim();
      const oneLiner = knowledgeMap.get(normalize(title)) || "";

      const doc = {
        _type: "knowledgeCard",
        title,
        subtitle: oneLiner,
        conditionType: condition.name,
        details: [
          {
            _type: "block",
            _key: Math.random().toString(36).substring(2, 10), // unique key
            style: "normal",
            children: [
              {
                _type: "span",
                _key: Math.random().toString(36).substring(2, 10), // unique key
                text: details,
              },
            ],
            markDefs: [],
          },
        ],
      };

      try {
        await client.createOrReplace({
          ...doc,
          _id: `knowledge_${condition.name}_${title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
            .substring(0, 200)}`, // truncate long IDs
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
