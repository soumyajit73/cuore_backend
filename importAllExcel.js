const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // Use the same token
});

// File Definitions (Keep as is)
const nourishPlanFiles = [
  { path: './backend/data/Nourish Plan BF.xlsx', mealTime: 'Breakfast' },
  { path: './backend/data/Nourish PlanLD.xlsx', mealTime: 'Lunch/Dinner' },
];
// ... (Keep mealBuilderFiles definition too, though we won't use it in this debug run)
const mealBuilderFiles = [
  { path: './backend/data/Meal Builder BF.xlsx', mealTime: 'Breakfast' },
  { path: './backend/data/Meal BuilderLD.xlsx', mealTime: 'Lunch/Dinner' },
];

let recipeIdMap = new Map();

async function debugRecipeLinking() {
  try {
    // --- PART 1: Build Recipe Map ---
    console.log('Step 1: Fetching recipe map from Sanity...');
    const recipes = await client.fetch(`*[_type == "recipe"] {_id, name}`);
    for (const recipe of recipes) {
      recipeIdMap.set(recipe.name, recipe._id);
    }
    console.log(`Loaded ${recipeIdMap.size} recipes into map.`);
    const recipeNamesFromSanity = Array.from(recipeIdMap.keys()); // Get list of names for matching

    // --- PART 2: DEBUG Nourish Plan Linking ---
    console.log('\n--- DEBUGGING RECIPE LINKING (First 20 Nourish Plan Items) ---');
    let debugCount = 0;

    for (const file of nourishPlanFiles) {
      if (!fs.existsSync(file.path)) continue;
      console.log(`\n  -> Reading file: ${file.path}`);
      const workbook = xlsx.readFile(file.path);

      for (const sheetName of workbook.SheetNames) {
        if (debugCount >= 20) break; // Limit debugging output

        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, range: 7 });

        for (const row of rows) {
          if (debugCount >= 20) break;
          if (!row || row.length < 8) continue;

          const nameFromExcel = row[1] ? String(row[1]).trim() : null;
          if (!nameFromExcel) continue;

          console.log(`\n[DEBUG ${debugCount + 1}] Excel Name: "${nameFromExcel}"`);

          // --- Try to find a match ---
          let foundRecipeName = null;
          let recipeId = null;

          // Attempt 1: Exact match (case insensitive)
          const lowerExcelName = nameFromExcel.toLowerCase();
          const exactMatchName = recipeNamesFromSanity.find(sanityName =>
            sanityName.toLowerCase() === lowerExcelName
          );

          if (exactMatchName) {
            foundRecipeName = exactMatchName;
            recipeId = recipeIdMap.get(foundRecipeName);
            console.log(`  -> Exact Match Found: "${foundRecipeName}" (ID: ${recipeId})`);
          } else {
            // Attempt 2: Partial match (Excel name contains Sanity name, case insensitive)
            const partialMatchName = recipeNamesFromSanity.find(sanityName =>
              lowerExcelName.includes(sanityName.toLowerCase())
            );
            if (partialMatchName) {
              foundRecipeName = partialMatchName;
              recipeId = recipeIdMap.get(foundRecipeName);
              console.log(`  -> Partial Match Found: Excel name contains "${foundRecipeName}" (ID: ${recipeId})`);
            } else {
              console.log(`  -> NO MATCH FOUND in Sanity recipe list.`);
            }
          }
          // --------------------------

          debugCount++;
        }
      }
    }
    console.log('\n--- DEBUGGING COMPLETE ---');

  } catch (err) {
    console.error('An error occurred during debugging:', err);
  }
}

debugRecipeLinking();