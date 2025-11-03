const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: process.env.SANITY_READ_TOKEN
});

async function fixRecipeStyles() {
  console.log('Fetching all recipes...');
  
  // 1. Get all recipes that have a 'fullRecipe' field
  const recipes = await client.fetch(`*[_type == "recipe" && defined(fullRecipe)] {
    _id,
    fullRecipe
  }`);
  
  if (recipes.length === 0) {
    console.log('No recipes found to fix.');
    return;
  }
  
  console.log(`Found ${recipes.length} recipes to patch...`);
  
  // 2. Create a batch of patches
  let transaction = client.transaction();
  
  for (const recipe of recipes) {
    // 3. Create a new 'fullRecipe' array with the 'style' property added
    const newFullRecipe = recipe.fullRecipe.map(block => {
      // Add style: 'normal' only if it's a block and doesn't have one
      if (block._type === 'block' && !block.style) {
        return {
          ...block,
          style: 'normal', // ✅ THIS IS THE FIX
        };
      }
      return block;
    });

    // 4. Add this fix to our transaction
    transaction.patch(recipe._id, {
      set: { fullRecipe: newFullRecipe }
    });
  }

  // 5. Commit all the fixes
  try {
    await transaction.commit();
    console.log(`✅ Success! Patched ${recipes.length} recipes.`);
  } catch (err) {
    console.error('Error committing patch:', err.message);
  }
}

fixRecipeStyles();