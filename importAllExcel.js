// importAllExcel.js (Final Version for Row 3 Headers & Sections)
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// --- Sanity Client Configuration ---
const client = createClient({
  projectId: 'r1a9xgjr', // Your Sanity Project ID
  dataset: 'production',
  apiVersion: '2021-10-21', // Use a recent API version date
  useCdn: false, // Must be false to write data
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // Add your secret token with Editor permissions
});
// ------------------------------------

// --- File Definitions ---
// Ensure these paths correctly point to your Excel files
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
const BATCH_SIZE = 100; // How many documents to upload at once

// --- Helper Functions ---

// Commits the current batch of documents to Sanity
async function commitBatch(docCount, type = 'data') {
    if (docCount === 0) return 0; // Nothing to commit
    console.log(`... Committing batch of ${docCount} ${type} documents ...`);
    try {
        await transaction.commit({ autoGenerateArrayKeys: true }); // autoGenerateArrayKeys might help with potential array issues, though not strictly needed here
    } catch (err) {
        console.error(`Error committing ${type} batch: ${err.message}`);
        // Consider adding error details: console.error(err.details?.items);
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
            return i; // Return the index of the header row
        }
    }
    return -1; // Header row not found
}

// Identifies rows that are likely section headers (text in Col A only, specific exclusions)
function isLikelySectionHeader(row) {
    if (!row || row.length === 0 || !row[0]) return false; // Must have text in first column
    const firstColText = String(row[0]).trim();
    // Ignore rows that look like instructions or the main 'Item' header
    if (firstColText.toLowerCase() === 'item' ||
        firstColText.includes('Choose Item') ||
        firstColText.includes('Remaining') ||
        firstColText.includes('Used')) {
        return false;
    }
    // Check if other key data columns (like Item Name/Col A, Qty/Col B, Calorie/Col D) are empty
    // Adjusted indices: Col B(1), Col C(2), Col D(3) should be empty for a section header
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
         // Read Nourish Plan sheets as arrays, skipping first 7 rows
         const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, range: 7 });
         for (const row of rows) {
             if (!row || row.length < 8) continue; // Ensure row has enough columns
             const name = row[1] ? String(row[1]).trim() : null; // Name from Col B
             const itemId = row[7] ? String(row[7]).trim() : null; // Item ID from Col H
             if (!name || !itemId) continue; // Skip if essential data missing

             const tagPrefix = itemId.charAt(0).toUpperCase(); // V, E, N, L
             const groupTag = itemId.split('.')[0]; // V1, E2, L10 etc.

             // Find corresponding recipe ID (exact or partial match)
             let recipeId = recipeIdMap.get(name);
             if (!recipeId) {
                 const key = Array.from(recipeIdMap.keys()).find(k => name.includes(k));
                 if (key) recipeId = recipeIdMap.get(key);
             }

             // Build diet map (only if name not already present)
             if (!dietMap.has(name)) {
                 if (tagPrefix === 'V' || tagPrefix === 'L') dietMap.set(name, 'Veg');
                 else if (tagPrefix === 'E') dietMap.set(name, 'Eggetarian');
                 else if (tagPrefix === 'N') dietMap.set(name, 'Non-Veg');
             }

             // Clean ID components
             const cleanItemId = itemId.replace(/\./g, '-');
             const cleanCalorieRange = calorieRange.replace(/</g, 'less').replace(/>/g, 'greater').replace(/-/g, 'to');
             const cleanMealTime = file.mealTime.replace('/', '-');
             const docId = `nourish.${cleanItemId}.${cleanCalorieRange}.${cleanMealTime}`.toLowerCase();

             // Create Sanity document object
             const doc = {
                 _type: 'nourishPlanItem', _id: docId, name: name,
                 components: row[2] ? String(row[2]).trim() : '', // Components from Col C
                 calories: parseInt(row[0], 10) || 0, // Calories from Col A
                 calorieRange: calorieRange, dietTag: groupTag, mealTime: file.mealTime,
                 recipeLink: recipeId ? { _type: 'reference', _ref: recipeId } : undefined,
             };
             transaction.createOrReplace(doc); // Add to batch
             docCount++;
             if(docCount >= BATCH_SIZE) docCount = await commitBatch(docCount, 'Nourish Plan'); // Commit if batch full
         }
       }
     }
    docCount = await commitBatch(docCount, 'Nourish Plan'); // Commit any remaining
    console.log(`✅ Built Diet Map with ${dietMap.size} entries.`);

    // --- PART 3: Import Meal Builder files ---
    console.log('Step 3: Processing Meal Builder files...');
    for (const file of mealBuilderFiles) {
       if (!fs.existsSync(file.path)) { console.warn(`SKIPPING (Not Found): ${file.path}`); continue; }
       console.log(`  -> Reading file: ${file.path}`);
       const workbook = xlsx.readFile(file.path);
       for (const sheetName of workbook.SheetNames) {
        const cuisine = sheetName; // "Indian" or "Global"
        console.log(`    --> Processing Sheet: ${sheetName}`);

        // Read sheet as arrays to find headers and sections
        const rowsAsArrays = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

        const headerRowIndex = findHeaderRowIndex(rowsAsArrays, 'Item'); // Find row with 'Item'
        if (headerRowIndex === -1) {
            console.error(`Header row ('Item') not found in sheet: ${sheetName}, file: ${file.path}. Skipping sheet.`);
            continue; // Skip sheet if headers aren't found
        }
        console.log(`[DEBUG] Found headers ('Item', 'Quantity'...) on row ${headerRowIndex + 1}`);

        let currentSection = 'Uncategorized'; // Default section

        // Iterate through rows starting AFTER the header row
        for (let i = headerRowIndex + 1; i < rowsAsArrays.length; i++) {
          const row = rowsAsArrays[i];
          if (!row || row.length === 0) continue; // Skip empty rows

          // --- Check for Section Header Rows ABOVE the data row ---
          for (let j = i - 1; j >= 0; j--) { // Look backwards
              if (isLikelySectionHeader(rowsAsArrays[j])) {
                  currentSection = String(rowsAsArrays[j][0]).trim();
                  break; // Found the closest section header above this row
              }
          }
          // ---

          // Process Data Row using correct indices based on screenshot
          const name = row[0] ? String(row[0]).trim() : null; // Col A (index 0) is ITEM
          // Skip if it's not a data row
          if (!name || isLikelySectionHeader(row) || name.toLowerCase() === 'item') continue;

          const servingQty = row[1] ? String(row[1]).trim() : ''; // Col B (index 1) is QTY
          const servingUnit = row[2] ? String(row[2]).trim() : ''; // Col C (index 2) is UNIT
          const servingSize = `${servingQty} ${servingUnit}`.trim();
          const calories = parseInt(row[3], 10) || 0; // Col D (index 3) is CALORIE

          // Find recipe link
          const recipeId = recipeIdMap.get(name);

          // Clean ID components
          const cleanName = name.toLowerCase().replace(/[\s&]/g, '-').replace(/[^a-z0-9-]/g, '');
          const cleanMealTime = file.mealTime.replace('/', '-');
          const cleanCuisine = cuisine.toLowerCase().replace(/[^a-z0-9-]/g, '');
          const docId = `builder.${cleanName}.${cleanMealTime}.${cleanCuisine}`;

          // Create Sanity document object
          const doc = {
            _type: 'mealBuilderItem',
            _id: docId,
            name: name,
            calories: calories,
            servingSize: servingSize,
            section: currentSection, // Assign the section found above
            cuisine: cuisine,
            mealTime: file.mealTime,
            recipeLink: recipeId ? { _type: 'reference', _ref: recipeId } : undefined,
          };
          // console.log('[DEBUG] Creating Meal Builder Doc:', doc); // Uncomment for detailed debug if needed
          transaction.createOrReplace(doc); // Add to batch
          docCount++;
          if(docCount >= BATCH_SIZE) docCount = await commitBatch(docCount, 'Meal Builder'); // Commit if batch full
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