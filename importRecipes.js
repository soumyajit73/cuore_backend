const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j',
});

const BASE_PATH = path.join(__dirname, '_MIGRATION_DATA');
const BATCH_SIZE = 10;

// Helper function to generate a unique key
function generateKey(length = 12) {
  return Math.random().toString(36).substring(2, 2 + length);
}

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
      
      if (recipeName.startsWith('.')) continue;

      console.log(`Processing: ${recipeName} (Meal: ${mealTime}, Cuisine: ${cuisine})`);

      const cleanIdName = recipeName.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      const result = await mammoth.extractRawText({ path: filePath });
      const instructions = result.value;
      
      const doc = {
        _type: 'recipe',
        _id: `recipe.${cleanIdName}`,
        name: recipeName,
        // ✅ --- THIS IS THE FIX ---
        // We add a `_key` to the block and ensure `style` is 'normal'
        fullRecipe: [{ 
          _type: 'block', 
          _key: generateKey(), // Adds a unique key
          style: 'normal', 
          children: [{ _type: 'span', _key: generateKey(), text: instructions }] 
        }],
        mealTime: mealTime,
        cuisine: cuisine,
      };
      
      transaction.createOrReplace(doc);
      currentBatchCount++;

      if (currentBatchCount >= BATCH_SIZE) {
        try {
          await transaction.commit();
          console.log(`... Committed batch of ${currentBatchCount} ...`);
          importedCount += currentBatchCount;
        } catch (err) {
          console.error(`Error committing batch: ${err.message}`);
        }
        transaction = client.transaction();
        currentBatchCount = 0;
      }
    }
  }

  // Commit any remaining items in the batch
  if (currentBatchCount > 0) {
    try {
      await transaction.commit();
      console.log(`... Committed final batch of ${currentBatchCount} ...`);
      importedCount += currentBatchCount;
    } catch (err) {
      console.error(`Error committing final batch: ${err.message}`);
    }
  }
  return importedCount;
}

async function runImport() {
  console.log('Starting Recipe import...');
  let total = 0;
  total = await processDirectory(BASE_PATH);
  console.log(`✅ Success! Imported ${total} total recipes.`);
}

runImport().catch(err => console.error(err));