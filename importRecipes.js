// importRecipes.js (Parses Word Doc Text into Structured JSON)
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

// --- Configuration ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: process.env.SANITY_READ_TOKEN, // Use token with Editor permissions
});
const BASE_PATH = path.join(__dirname, '_MIGRATION_DATA'); // Folder with Breakfast/LunchDinner subfolders
const BATCH_SIZE = 10;
// --------------------

// --- Helper Functions ---
async function commitBatch(transaction, count) {
    if (count === 0) return 0;
    console.log(`... Committing batch of ${count} recipes ...`);
    try {
        await transaction.commit({ autoGenerateArrayKeys: true });
    } catch (err) {
        console.error(`Error committing batch: ${err.message}`);
    }
    return 0; // Reset counter
}

function generateKey(length = 12) {
  return Math.random().toString(36).substring(2, 2 + length);
}

// --- Text Parsing Logic ---
function parseRecipeText(rawText) {
    const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
    const recipe = {
        prepTime: null,
        cookTime: null,
        ingredients: [],
        instructions: [],
    };
    let currentSection = null; // Can be 'ingredients' or 'instructions'
    let currentInstructionHeading = null;
    let currentInstructionSteps = [];

    // Basic regex patterns (can be improved)
    const timeRegex = /(Prep time|Cook time):\s*(\d+\s*min)/i;
    const ingredientsHeaderRegex = /Ingredients:/i;
    const instructionsHeaderRegex = /Instructions:/i;
    // Simple ingredient line regex (e.g., "1 cup name (notes)") - needs refinement
    const ingredientRegex = /^([\d¼½⅓⅔¾⅛⅜⅝⅞]+|\w+)?\s*(cup|tsp|tbsp|g|kg|ml|l|piece|slice|pcs|slices)?\s*(.*)/i;

    lines.forEach(line => {
        // Find Prep/Cook Time
        let timeMatch = line.match(timeRegex);
        if (timeMatch) {
            if (timeMatch[1].toLowerCase().includes('prep')) recipe.prepTime = timeMatch[2];
            if (timeMatch[1].toLowerCase().includes('cook')) recipe.cookTime = timeMatch[2];
            return; // Move to next line
        }

        // Detect Section Headers
        if (ingredientsHeaderRegex.test(line)) {
            currentSection = 'ingredients';
            // Flush previous instruction section if any
            if (currentInstructionHeading) {
                recipe.instructions.push({ _key: generateKey(), heading: currentInstructionHeading, steps: currentInstructionSteps });
                currentInstructionHeading = null; currentInstructionSteps = [];
            }
            return;
        }
        if (instructionsHeaderRegex.test(line)) {
            currentSection = 'instructions';
            currentInstructionHeading = "Instructions"; // Default heading
            currentInstructionSteps = [];
            return;
        }

        // Process based on current section
        if (currentSection === 'ingredients') {
            let ingMatch = line.match(ingredientRegex);
            if (ingMatch) {
                let namePart = ingMatch[3] || '';
                let notes = null;
                // Try to extract notes in parentheses
                const noteMatch = namePart.match(/\(([^)]+)\)/);
                if (noteMatch) {
                    notes = noteMatch[1];
                    namePart = namePart.replace(/\(([^)]+)\)/, '').trim(); // Remove notes from name
                }
                recipe.ingredients.push({
                    _key: generateKey(),
                    quantity: ingMatch[1] ? ingMatch[1].trim() : null,
                    unit: ingMatch[2] ? ingMatch[2].trim() : null,
                    name: namePart.trim(),
                    notes: notes ? notes.trim() : null,
                });
            } else if (line) { // Add lines that don't match regex as name-only ingredients
                 recipe.ingredients.push({_key: generateKey(), name: line });
            }
        } else if (currentSection === 'instructions') {
            // Check if line looks like a sub-heading (e.g., ends with ':')
            if (line.endsWith(':') && line.length < 50) { // Assume short lines ending in ':' are headings
                // Save previous steps before starting new heading
                if (currentInstructionSteps.length > 0) {
                     recipe.instructions.push({ _key: generateKey(), heading: currentInstructionHeading, steps: currentInstructionSteps });
                }
                currentInstructionHeading = line.slice(0, -1); // Remove trailing ':'
                currentInstructionSteps = [];
            } else if (line) { // Add as a step
                currentInstructionSteps.push(line);
            }
        }
    });

    // Add the last instruction section if it exists
    if (currentInstructionHeading && currentInstructionSteps.length > 0) {
        recipe.instructions.push({ _key: generateKey(), heading: currentInstructionHeading, steps: currentInstructionSteps });
    }
     // If no instructions were parsed but there was text, add it as a single block
    if (recipe.instructions.length === 0 && currentSection !== 'ingredients' && lines.length > 0) {
         recipe.instructions.push({ _key: generateKey(), heading: 'Instructions', steps: lines.filter(l => !l.match(timeRegex) && !l.match(ingredientsHeaderRegex)) });
    }


    return recipe;
}
// ------------------------

// --- Recursive Directory Processing ---
async function processDirectory(directory, mealTime, cuisine) {
  const files = fs.readdirSync(directory);
  let transaction = client.transaction();
  let importedCount = 0;
  let currentBatchCount = 0;

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      let newMealTime = file === 'Breakfast' || file === 'LunchDinner' ? (file === 'LunchDinner' ? 'Lunch/Dinner' : 'Breakfast') : mealTime;
      let newCuisine = file === 'Indian' || file === 'Global' ? file : cuisine;
      importedCount += await processDirectory(filePath, newMealTime, newCuisine);
    }
    else if (file.endsWith('.docx') && (directory.endsWith('Indian') || directory.endsWith('Global'))) {
      const recipeName = path.basename(file, '.docx');
      if (recipeName.startsWith('.')) continue; // Skip system files

      console.log(`Processing: ${recipeName} (Meal: ${mealTime}, Cuisine: ${cuisine})`);

      try {
        const result = await mammoth.extractRawText({ path: filePath });
        const rawText = result.value;

        // ✅ --- Parse the text ---
        const parsedData = parseRecipeText(rawText);
        // -----------------------

        const cleanIdName = recipeName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const docId = `recipe.${cleanIdName}`;

        const doc = {
          _type: 'recipe',
          _id: docId,
          name: recipeName,
          // ✅ --- Add parsed data ---
          prepTime: parsedData.prepTime,
          cookTime: parsedData.cookTime,
          ingredients: parsedData.ingredients,
          instructions: parsedData.instructions,
          // ------------------------
          mealTime: mealTime,
          cuisine: cuisine,
          // dietPreference will be added by the other script
          // fullRecipe field is removed as we now have structured data
        };

        // console.log(`[DEBUG] Parsed data for ${recipeName}:`, JSON.stringify(parsedData, null, 2)); // Uncomment for detailed debug

        transaction.createOrReplace(doc);
        currentBatchCount++;

        if (currentBatchCount >= BATCH_SIZE) {
          currentBatchCount = await commitBatch(transaction, currentBatchCount);
          transaction = client.transaction(); // Ensure a new transaction starts
        }
      } catch (parseError) {
          console.error(`Error parsing or processing ${recipeName}:`, parseError);
      }
    }
  }

  // Commit any remaining items
  await commitBatch(transaction, currentBatchCount);
  return importedCount; // Note: This count might be off due to how batches are handled, focus on final message
}
// ---------------------------------

// --- Run the Import ---
async function runImport() {
  console.log('Starting Recipe import with text parsing...');
  let total = 0;
  // Make sure BASE_PATH points to _MIGRATION_DATA containing Breakfast/LunchDinner folders
  if (!fs.existsSync(BASE_PATH)) {
      console.error(`Base directory not found: ${BASE_PATH}`);
      return;
  }
  total = await processDirectory(BASE_PATH); // Start processing from the base path
  console.log(`✅ Success! Processed recipes.`); // Final count might be inaccurate due to async nature/batching, check Sanity
}

runImport().catch(err => console.error("Import failed:", err));
// --------------------