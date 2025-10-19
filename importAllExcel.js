// importAllExcel.js (Final Version with all corrections)
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// --- Sanity Client Configuration ---
const client = createClient({
  projectId: 'r1a9xgjr', // Your Sanity Project ID
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // Add your secret token
});
// ------------------------------------

// --- File Definitions ---
const nourishPlanFiles = [
  { path: './backend/data/Nourish Plan BF.xlsx', mealTime: 'Breakfast' },
  { path: './backend/data/Nourish PlanLD.xlsx', mealTime: 'Lunch/Dinner' },
];
const mealBuilderFiles = [
  { path: './backend/data/Meal Builder BF.xlsx', mealTime: 'Breakfast' },
  { path: './backend/data/Meal BuilderLD.xlsx', mealTime: 'Lunch/Dinner' },
];
// -----------------------

let recipeIdMap = new Map();
let dietMap = new Map();
let transaction = client.transaction();
const BATCH_SIZE = 100;

// --- Helper Functions ---
async function commitBatch(docCount, type = 'data') {
    if (docCount === 0) return 0;
    console.log(`... Committing batch of ${docCount} ${type} documents ...`);
    try {
        await transaction.commit({ autoGenerateArrayKeys: true });
    } catch (err) {
        console.error(`Error committing ${type} batch: ${err.message}`);
    }
    transaction = client.transaction();
    return 0;
}

function findHeaderRowIndex(rowsAsArrays, headerText = 'item') {
    const lowerHeaderText = headerText.toLowerCase();
    for (let i = 0; i < rowsAsArrays.length; i++) {
        const row = rowsAsArrays[i];
        if (row && row[0] && String(row[0]).trim().toLowerCase() === lowerHeaderText) {
            return i;
        }
    }
    return -1;
}

function isRealSectionHeader(row) {
    if (!row || row.length === 0 || !row[0]) return false;
    const firstColText = String(row[0]).trim();
    if (!firstColText || firstColText.toLowerCase() === 'item' || firstColText.includes('Choose Item') || firstColText.includes('Remaining') || firstColText.includes('Used') || firstColText.match(/^\d+(\.\d+)?$/)) {
        return false;
    }
    return firstColText && !row[1] && !row[2] && !row[3];
}
// -----------------------

// --- Main Import Function ---
async function runImport() {
  let docCount = 0;
  let totalPatchedCount = 0;

  try {
    // --- PART 1: Build Recipe Map from Sanity ---
    console.log('Step 1: Fetching recipe map from Sanity...');
    const recipes = await client.fetch(`*[_type == "recipe"] {_id, name}`);
    if (!recipes || recipes.length === 0) {
        console.error("No recipes found in Sanity. Please run the recipe import script first.");
        return;
    }
    for (const recipe of recipes) { recipeIdMap.set(recipe.name, recipe._id); }
    console.log(`Loaded ${recipeIdMap.size} recipes into map.`);

    // --- PART 2: Import Nourish Plan files & Build Diet Map ---
    console.log('Step 2: Processing Nourish Plan files...');
    for (const file of nourishPlanFiles) {
       if (!fs.existsSync(file.path)) { console.warn(`SKIPPING (Not Found): ${file.path}`); continue; }
       console.log(`  -> Reading file: ${file.path}`);
       const workbook = xlsx.readFile(file.path);
       for (const sheetName of workbook.SheetNames) {
         const calorieRange = sheetName;
         const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, range: 7 });
         for (const row of rows) {
             if (!row || row.length < 8) continue;
             const name = row[1] ? String(row[1]).trim() : null; // Col B
             const itemId = row[7] ? String(row[7]).trim() : null; // Col H
             if (!name || !itemId) continue;

             // ✅ Get Components from Cols C, D, E
             const componentsArray = [row[2], row[3], row[4]]
                .filter(Boolean)
                .map(comp => String(comp).trim());

             const tagPrefix = itemId.charAt(0).toUpperCase();
             const groupTag = itemId.split('.')[0];
             let recipeId = recipeIdMap.get(name);
             if (!recipeId) { const key = Array.from(recipeIdMap.keys()).find(k => name.includes(k)); if (key) recipeId = recipeIdMap.get(key); }
             if (!dietMap.has(name)) { if (tagPrefix === 'V') dietMap.set(name, 'Veg'); else if (tagPrefix === 'E') dietMap.set(name, 'Eggetarian'); else if (tagPrefix === 'N') dietMap.set(name, 'Non-Veg'); }

             const cleanItemId = itemId.replace(/\./g, '-');
             const cleanCalorieRange = calorieRange.replace(/</g, 'less').replace(/>/g, 'greater').replace(/-/g, 'to');
             const cleanMealTime = file.mealTime.replace('/', '-');
             const docId = `nourish.${cleanItemId}.${cleanCalorieRange}.${cleanMealTime}`.toLowerCase();

             const doc = {
                 _type: 'nourishPlanItem', _id: docId, name: name,
                 components: componentsArray, // ✅ Use the array
                 calories: parseInt(row[0], 10) || 0, // Col A
                 calorieRange: calorieRange, dietTag: groupTag, mealTime: file.mealTime,
                 recipeLink: recipeId ? { _type: 'reference', _ref: recipeId } : undefined,
             };
             transaction.createOrReplace(doc);
             docCount++;
             if(docCount >= BATCH_SIZE) docCount = await commitBatch(docCount, 'Nourish Plan');
         }
       }
     }
    docCount = await commitBatch(docCount, 'Nourish Plan');
    console.log(`✅ Built Diet Map with ${dietMap.size} entries.`);

    // --- PART 3: Import Meal Builder files ---
    console.log('Step 3: Processing Meal Builder files...');
    for (const file of mealBuilderFiles) {
       if (!fs.existsSync(file.path)) { console.warn(`SKIPPING (Not Found): ${file.path}`); continue; }
       console.log(`  -> Reading file: ${file.path}`);
       const workbook = xlsx.readFile(file.path);
       for (const sheetName of workbook.SheetNames) {
        const cuisine = sheetName;
        console.log(`    --> Processing Sheet: ${sheetName}`);

        const rowsAsArrays = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        const headerRowIndex = findHeaderRowIndex(rowsAsArrays, 'Item');
        if (headerRowIndex === -1) { console.error(`Header row ('Item') not found in ${sheetName}. Skipping.`); continue; }
        // console.log(`[DEBUG] Found headers ('Item', 'Quantity'...) on row ${headerRowIndex + 1}`); // Optional Debug

        let currentSection = 'Uncategorized';

        for (let i = headerRowIndex + 1; i < rowsAsArrays.length; i++) {
          const row = rowsAsArrays[i];
          if (!row || row.length === 0) continue;

          for (let j = i - 1; j >= 0; j--) {
              if (isRealSectionHeader(rowsAsArrays[j])) {
                  currentSection = String(rowsAsArrays[j][0]).trim();
                  break;
              }
          }

          const name = row[0] ? String(row[0]).trim() : null; // Col A
          if (!name || isRealSectionHeader(row) || name.match(/^\d+(\.\d+)?$/) || name.toLowerCase() === 'item') continue;

          const servingQty = row[1] ? String(row[1]).trim() : ''; // Col B
          const servingUnit = row[2] ? String(row[2]).trim() : ''; // Col C
          const servingSize = `${servingQty} ${servingUnit}`.trim();
          const calories = parseInt(row[3], 10) || 0; // Col D

          const recipeId = recipeIdMap.get(name);
          const cleanName = name.toLowerCase().replace(/[\s&]/g, '-').replace(/[^a-z0-9-]/g, '');
          const cleanMealTime = file.mealTime.replace('/', '-');
          const cleanCuisine = cuisine.toLowerCase().replace(/[^a-z0-9-]/g, '');
          const docId = `builder.${cleanName}.${cleanMealTime}.${cleanCuisine}`;

          const doc = {
            _type: 'mealBuilderItem', _id: docId, name: name,
            calories: calories, servingSize: servingSize, section: currentSection,
            cuisine: cuisine, mealTime: file.mealTime,
            recipeLink: recipeId ? { _type: 'reference', _ref: recipeId } : undefined,
          };
          transaction.createOrReplace(doc);
          docCount++;
          if(docCount >= BATCH_SIZE) docCount = await commitBatch(docCount, 'Meal Builder');
        }
       }
    }
    docCount = await commitBatch(docCount, 'Meal Builder');

    // --- PART 4: Update Recipes with Diet Preference ---
    console.log('Step 4: Updating recipes with diet preferences...');
    let patchCount = 0;
     const recipeNamesFromSanity = Array.from(recipeIdMap.keys());
     for (const [excelName, diet] of dietMap.entries()) {
       const lowerExcelName = excelName.toLowerCase();
       const matchingRecipeName = recipeNamesFromSanity.find(sanityName =>
         lowerExcelName.includes(sanityName.toLowerCase())
       );
       if (matchingRecipeName) {
         const recipeId = recipeIdMap.get(matchingRecipeName);
         transaction.patch(recipeId, { set: { dietPreference: diet } });
         patchCount++;
         totalPatchedCount++;
         if(patchCount >= BATCH_SIZE) patchCount = await commitBatch(patchCount, 'Recipe Patches');
       }
     }
     await commitBatch(patchCount, 'Recipe Patches');
     console.log(`✅ Updated ${totalPatchedCount} recipes with diet preferences.`);

    console.log('--- MIGRATION 100% COMPLETE ---');

  } catch (err) {
    console.error('An error occurred:', err);
  }
}

// --- Run the Import ---
runImport();
// --------------------







