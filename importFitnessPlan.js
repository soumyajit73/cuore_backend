const { createClient } = require('@sanity/client');
const xlsx = require('xlsx');
const path = require('path');

// --- Sanity Client Configuration ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j',
});

// --- Excel file path ---
const EXCEL_PATH = path.join(__dirname, './backend/data/Recommended exercise plan.xlsx');

// Map sheet names to metadata (age group + duration)
const sheetMeta = {
  'YA 15': { id: 'ya-15', ageGroup: 'YA-15', duration: 15 },
  'YA 30': { id: 'ya-30', ageGroup: 'YA-30', duration: 30 },
  'YA 45': { id: 'ya-45', ageGroup: 'YA-45', duration: 45 },
  'MA 15': { id: 'ma-15', ageGroup: 'MA-15', duration: 15 },
  'MA 30': { id: 'ma-30', ageGroup: 'MA-30', duration: 30 },
  'MA 45': { id: 'ma-45', ageGroup: 'MA-45', duration: 45 },
  'SA 15': { id: 'sa-15', ageGroup: 'SA-15', duration: 15 },
  'SA 30': { id: 'sa-30', ageGroup: 'SA-30', duration: 30 },
  'SA 45': { id: 'sa-45', ageGroup: 'SA-45', duration: 45 },
  'OA 15': { id: 'oa-15', ageGroup: 'OA-15', duration: 15 },
  'OA 30': { id: 'oa-30', ageGroup: 'OA-30', duration: 30 },
  'OA 45': { id: 'oa-45', ageGroup: 'OA-45', duration: 45 },
};

// --- Helper Functions ---
let exerciseMap = new Map(); // Map of planId.code -> Sanity ID
let transaction = client.transaction();
const BATCH_SIZE = 50;
let docCount = 0;

function parseRepsDuration(value) {
  return value ? String(value).trim() : 'N/A';
}

function parseSets(value) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num > 0 ? num : 1;
}

// Generate a unique slug per age group to avoid conflicts
function generateExerciseSlug(planId, code) {
  if (!planId || !code) return null;
  const cleanCode = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${planId}-${cleanCode}`;
}

function generateExerciseId(planId, code) {
  const slug = generateExerciseSlug(planId, code);
  return `exercise.${slug}`;
}

async function commitBatch(count, type = 'data') {
  if (count === 0) return 0;
  console.log(`... Committing batch of ${count} ${type} documents ...`);
  try {
    await transaction.commit({ autoGenerateArrayKeys: true });
  } catch (err) {
    console.error(`Error committing ${type} batch:`, err.message, err.response?.body);
  }
  transaction = client.transaction();
  return 0;
}

// --- Main Import Function ---
async function runImport() {
  try {
    console.log('--- Reading Excel file ---');
    const workbook = xlsx.readFile(EXCEL_PATH);

    // --- Phase 1: Process Exercises ---
    console.log('--- Phase 1: Processing Exercises ---');
    for (const sheetName of workbook.SheetNames) {
      const meta = sheetMeta[sheetName];
      if (!meta) continue;

      console.log(` -> Reading sheet: ${sheetName}`);
      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

      // Find header row
      let headerRowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim().toLowerCase() === 'exercise name') {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) continue;

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;

        const name = String(row[0]).trim();
        const type = String(row[1] || '').trim();
        const repsDuration = parseRepsDuration(row[2]);
        const sets = parseSets(row[3]);
        const code = String(row[4] || '').trim();
        if (!code) continue;

        const exerciseKey = `${meta.id}-${code.toUpperCase()}`;
        if (exerciseMap.has(exerciseKey)) continue;

        const slug = generateExerciseSlug(meta.id, code);

        const exerciseDoc = {
          _type: 'exercise',
          _id: generateExerciseId(meta.id, code),
          name,
          code: { _type: 'slug', current: slug },
          exerciseType: type,
          repsDuration,
          sets,
          ageGroup: meta.ageGroup,
        };

        transaction.createOrReplace(exerciseDoc);
        exerciseMap.set(exerciseKey, exerciseDoc._id);
        docCount++;

        if (docCount >= BATCH_SIZE) docCount = await commitBatch(docCount, 'Exercise');
      }
    }

    docCount = await commitBatch(docCount, 'Exercise');
    console.log(`✅ Phase 1 Complete: Processed ${exerciseMap.size} exercises with age groups and unique slugs.`);

    console.log('\n--- All exercises are ready with age groups. ---');
    console.log('You can now dynamically fetch exercises by age group and category in your backend.');
  } catch (err) {
    console.error('Error during import:', err);
  }
}

runImport();
