// patchRecipeLinksAdvanced.js
const { createClient } = require('@sanity/client');
const fs = require('fs');

// --- Configuration ---
const client = createClient({
  projectId: 'r1a9xgjr', // Your project ID
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // Use token with Editor permissions
});
const BATCH_SIZE = 100;
// --------------------

let recipeIdMap = new Map(); // Stores { "Recipe Name Lowercase": "sanityRecipeId" }
let recipeNames = []; // Stores original recipe names

let transaction = client.transaction();
let patchCount = 0;
let totalPatched = 0;

// Helper to commit batches
async function commitPatchBatch() {
    if (patchCount === 0) return;
    console.log(`... Committing batch of ${patchCount} link patches ...`);
    try {
        await transaction.commit({ autoGenerateArrayKeys: true });
        totalPatched += patchCount;
    } catch (err) {
        console.error(`Error committing patch batch: ${err.message}`);
    }
    transaction = client.transaction();
    patchCount = 0;
}

// --- Advanced Matching Logic ---
function findBestMatch(itemName) {
    const lowerItemName = itemName.toLowerCase();

    // Strategy 1: Exact match (case-insensitive)
    if (recipeIdMap.has(lowerItemName)) {
        console.log(`  -> Exact Match Found for "${itemName}"`);
        return recipeIdMap.get(lowerItemName);
    }

    // Strategy 2: Partial Match - Item name CONTAINS a recipe name (prioritize longer matches)
    // Sort recipe names by length descending to find the most specific match first
    const containedRecipeNames = recipeNames
        .filter(rn => lowerItemName.includes(rn.toLowerCase()))
        .sort((a, b) => b.length - a.length);

    if (containedRecipeNames.length > 0) {
        const bestMatchName = containedRecipeNames[0]; // The longest recipe name contained within
        console.log(`  -> Partial Match (Contains): "${itemName}" contains "${bestMatchName}"`);
        return recipeIdMap.get(bestMatchName.toLowerCase());
    }

    // Strategy 3: Partial Match - Recipe name CONTAINS item name (less common)
    const containingRecipeNames = recipeNames
        .filter(rn => rn.toLowerCase().includes(lowerItemName))
        .sort((a, b) => b.length - a.length); // Prioritize longer recipes containing the item name

     if (containingRecipeNames.length > 0) {
        const bestMatchName = containingRecipeNames[0];
        console.log(`  -> Partial Match (Contained By): "${bestMatchName}" contains "${itemName}"`);
        return recipeIdMap.get(bestMatchName.toLowerCase());
    }

    // Strategy 4: Split item name by common words and check parts
    const parts = lowerItemName.split(/ with | & | and /);
    if (parts.length > 1) {
        for (const part of parts) {
            const trimmedPart = part.trim();
            if (recipeIdMap.has(trimmedPart)) {
                 console.log(`  -> Partial Match (Split): Part "${trimmedPart}" of "${itemName}" matched`);
                 return recipeIdMap.get(trimmedPart);
            }
        }
    }


    // No match found
    return null;
}
// ---------------------------

async function patchLinks() {
  console.log('Step 1: Fetching recipe map from Sanity...');
  const recipes = await client.fetch(`*[_type == "recipe"] {_id, name}`);
  if (!recipes || recipes.length === 0) {
    console.error("No recipes found in Sanity."); return;
  }
  // Store both original names and a lowercase map for matching
  recipeNames = recipes.map(r => r.name);
  recipes.forEach(r => recipeIdMap.set(r.name.toLowerCase(), r._id));
  console.log(`Loaded ${recipeIdMap.size} recipes into map.`);


  console.log('\nStep 2: Fetching items with missing recipe links...');
  // Fetch all Nourish Plan and Meal Builder items that DO NOT have a recipeLink defined
  const query = `*[_type in ["nourishPlanItem", "mealBuilderItem"] && !defined(recipeLink)] {_id, name, _type}`;
  const itemsToPatch = await client.fetch(query);
  console.log(`Found ${itemsToPatch.length} items missing links. Attempting advanced matching...`);


  console.log('\nStep 3: Applying matches and patching...');
  for (const item of itemsToPatch) {
    // Try to find the best match using our advanced logic
    const recipeId = findBestMatch(item.name);

    if (recipeId) {
      // Add a patch operation to set the recipeLink reference
      transaction.patch(item._id, {
        set: { recipeLink: { _type: 'reference', _ref: recipeId } }
      });
      patchCount++;

      // Commit batch if full
      if (patchCount >= BATCH_SIZE) {
        await commitPatchBatch();
      }
    } else {
       // Optional: Log items for which no mapping was found after trying all strategies
       console.log(`  -> NO MATCH found for "${item.name}" (${item._type}). Skipping.`);
    }
  }

  // Commit any remaining patches
  await commitPatchBatch();

  console.log(`\n✅ Finished patching. Attempted to add links for ${totalPatched} items.`);
  console.log("Please review the results in Sanity Studio. Some items may still require manual linking.");
}

patchLinks().catch(console.error);