// importAllExcel.js (Final Version - Corrected Parsing & Linking)
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
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // Add your secret token with Editor permissions
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

let recipeIdMap = new Map(); // Stores { Recipe Name => Sanity ID }
let dietMap = new Map(); // Stores { Excel Item Name => Diet Preference }
let transaction = client.transaction(); // Holds documents for batch upload
const BATCH_SIZE = 100; // How many documents to upload/patch at once

// --- Helper Functions ---

// Commits the current batch of documents to Sanity
async function commitBatch(docCount, type = 'data') {
    if (docCount === 0) return 0; // Nothing to commit
    console.log(`... Committing batch of ${docCount} ${type} documents ...`);
    try {
        await transaction.commit({ autoGenerateArrayKeys: true }); // autoGenerateArrayKeys helps with arrays if needed
    } catch (err) {
        console.error(`Error committing ${type} batch: ${err.message}`);
    }
    transaction = client.transaction(); // Start a new transaction
    return 0; // Reset counter after commit
}

// Finds the row index containing the specific header text (e.g., 'Item')
function findHeaderRowIndex(rowsAsArrays, headerText = 'item') {
    const lowerHeaderText = headerText.toLowerCase();
    for (let i = 0; i < rowsAsArrays.length; i++) {
        const row = rowsAsArrays[i];
        // Check if the first cell matches the header text (case insensitive)
        if (row && row[0] && String(row[0]).trim().toLowerCase() === lowerHeaderText) {
            return i; // Return the index of the header row (e.g., 2 for Row 3)
        }
    }
    return -1; // Header row not found
}

// Identifies rows that are likely section headers (text in Col A only, specific exclusions)
function isRealSectionHeader(row) {
    if (!row || row.length === 0 || !row[0]) return false; // Must have text in first column
    const firstColText = String(row[0]).trim();
    // IGNORE common instruction/header lines explicitly
    if (!firstColText ||
        firstColText.toLowerCase() === 'item' ||
        firstColText.includes('Choose Item') ||
        firstColText.includes('Remaining') ||
        firstColText.includes('Used') ||
        firstColText.match(/^\d+(\.\d+)?$/) // Ignore if it's just a number like '1' or '0.5'
       ) {
        return false;
    }
    // Real section headers have text ONLY in the first column and key data columns are empty
    // Check Columns B(1), C(2), D(3) which should contain data for actual items
    return firstColText && !row[1] && !row[2] && !row[3];
}
// -----------------------

// --- Main Import Function ---
async function runImport() {
  let docCount = 0; // Counter for documents in the current batch
  let totalPatchedCount = 0; // Counter for total recipes patched

  try {
    // --- PART 1: Build Recipe Map from Sanity ---
    console.log('Step 1: Fetching recipe map from Sanity...');
    const recipes = await client.fetch(`*[_type == "recipe"] {_id, name}`);
    if (!recipes || recipes.length === 0) {
        console.error("No recipes found in Sanity. Please run the recipe import script first.");
        return;
    }
    for (const recipe of recipes) {
      recipeIdMap.set(recipe.name, recipe._id);
    }
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

             const componentsArray = [row[2], row[3], row[4]] // Cols C, D, E
                .filter(Boolean)
                .map(comp => String(comp).trim());

             const tagPrefix = itemId.charAt(0).toUpperCase();
             const groupTag = itemId.split('.')[0];
             let recipeId = recipeIdMap.get(name);
             if (!recipeId) { const key = Array.from(recipeIdMap.keys()).find(k => name.includes(k)); if (key) recipeId = recipeIdMap.get(key); }
             if (!dietMap.has(name)) { if (tagPrefix === 'V' || tagPrefix === 'L') dietMap.set(name, 'Veg'); else if (tagPrefix === 'E') dietMap.set(name, 'Eggetarian'); else if (tagPrefix === 'N') dietMap.set(name, 'Non-Veg'); }

             const cleanItemId = itemId.replace(/\./g, '-');
             const cleanCalorieRange = calorieRange.replace(/</g, 'less').replace(/>/g, 'greater').replace(/-/g, 'to');
             const cleanMealTime = file.mealTime.replace('/', '-');
             const docId = `nourish.${cleanItemId}.${cleanCalorieRange}.${cleanMealTime}`.toLowerCase();

             const doc = {
                 _type: 'nourishPlanItem', _id: docId, name: name,
                 components: componentsArray,
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

        let currentSection = 'Uncategorized';
        let debugCounter = 0; // Limit debug output

        for (let i = headerRowIndex + 1; i < rowsAsArrays.length; i++) {
          const row = rowsAsArrays[i];
          if (!row || row.length === 0) continue;

          // Find section header logic... (keep as is)
          for (let j = i - 1; j >= 0; j--) { if (isRealSectionHeader(rowsAsArrays[j])) { currentSection = String(rowsAsArrays[j][0]).trim(); break; } }

          const name = row[0] ? String(row[0]).trim() : null; // Col A
          if (!name || isRealSectionHeader(row) || name.match(/^\d+(\.\d+)?$/) || name.toLowerCase() === 'item') { continue; } // Skip invalid rows

          const servingQty = row[1] ? String(row[1]).trim() : ''; // Col B
          const servingUnit = row[2] ? String(row[2]).trim() : ''; // Col C
          const servingSize = `${servingQty} ${servingUnit}`.trim();
          const calories = parseInt(row[3], 10) || 0; // Col D

          // ✅ --- DETAILED DEBUGGING FOR COLUMN I ---
          const rawColIValue = row[8]; // Get the raw value from index 8
          let weightString = '0';
          let parsedWeight = 0;

          if (rawColIValue != null) { // Check if it's not null or undefined
              try {
                  weightString = String(rawColIValue).replace('%', '').trim(); // Convert to string, remove %, trim whitespace
                  parsedWeight = parseFloat(weightString); // Attempt to parse
                  if (isNaN(parsedWeight)) { // Check if parsing failed
                      parsedWeight = 0; // Default to 0 if NaN
                      if (debugCounter < 10) console.log(`[DEBUG Col I] Row ${i+1}: Raw='${rawColIValue}', Cleaned='${weightString}', PARSE FAILED -> using 0`);
                  } else {
                       if (debugCounter < 10) console.log(`[DEBUG Col I] Row ${i+1}: Raw='${rawColIValue}', Cleaned='${weightString}', Parsed OK -> ${parsedWeight}`);
                  }
              } catch (e) {
                  parsedWeight = 0; // Default to 0 on any error
                  if (debugCounter < 10) console.log(`[DEBUG Col I] Row ${i+1}: Raw='${rawColIValue}', Error during processing: ${e.message} -> using 0`);
              }
          } else {
               if (debugCounter < 10) console.log(`[DEBUG Col I] Row ${i+1}: Raw value is null/undefined -> using 0`);
          }
          const adjustmentWeight = parsedWeight;
          debugCounter++;
          // ------------------------------------------

          const recipeId = recipeIdMap.get(name);
          const cleanName = name.toLowerCase().replace(/[\s&]/g, '-').replace(/[^a-z0-9-]/g, '');
          const cleanMealTime = file.mealTime.replace('/', '-');
          const cleanCuisine = cuisine.toLowerCase().replace(/[^a-z0-9-]/g, '');
          const docId = `builder.${cleanName}.${cleanMealTime}.${cleanCuisine}`;

          const doc = {
            _type: 'mealBuilderItem', _id: docId, name: name,
            calories: calories, servingSize: servingSize, section: currentSection,
            adjustmentWeight: adjustmentWeight, // Use the parsed value
            cuisine: cuisine, mealTime: file.mealTime,
            recipeLink: recipeId ? { _type: 'reference', _ref: recipeId } : undefined,
          };
          transaction.createOrReplace(doc);
          docCount++;
          if(docCount >= BATCH_SIZE) docCount = await commitBatch(docCount, 'Meal Builder');
        }
       }
    }
    docCount = await commitBatch(docCount, 'Meal Builder'); // Commit any remaining

    // --- PART 4: Update Recipes with Diet Preference ---
    console.log('Step 4: Updating recipes with diet preferences...');
    let patchCount = 0; // Counter for patches in the current batch
     const recipeNamesFromSanity = Array.from(recipeIdMap.keys()); // Get all recipe names once

     // Iterate through the diet map built from Nourish Plan data
     for (const [excelName, diet] of dietMap.entries()) {
       const lowerExcelName = excelName.toLowerCase();
       // Find the corresponding Sanity recipe name (case-insensitive partial match)
       const matchingRecipeName = recipeNamesFromSanity.find(sanityName =>
         lowerExcelName.includes(sanityName.toLowerCase())
       );
       if (matchingRecipeName) {
         const recipeId = recipeIdMap.get(matchingRecipeName); // Get the Sanity ID
         // console.log(`  -> MATCH: "${excelName}" contains "${matchingRecipeName}". Setting diet to "${diet}".`);
         transaction.patch(recipeId, { set: { dietPreference: diet } }); // Add patch to batch
         patchCount++;
         totalPatchedCount++; // Increment total count
         if(patchCount >= BATCH_SIZE) patchCount = await commitBatch(patchCount, 'Recipe Patches'); // Commit if batch full
       }
     }
     await commitBatch(patchCount, 'Recipe Patches'); // Commit final batch of patches
     console.log(`✅ Updated ${totalPatchedCount} recipes with diet preferences.`);

    console.log('--- MIGRATION 100% COMPLETE ---');

  } catch (err) {
    console.error('An error occurred:', err);
  }
}

// --- Run the Import ---
runImport();
// --------------------