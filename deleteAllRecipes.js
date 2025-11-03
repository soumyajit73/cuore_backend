// deleteAllRecipes.js
const { createClient } = require('@sanity/client');

// --- Configuration ---
// Make sure to use a token with Editor or Administrator permissions!
const client = createClient({
  projectId: 'r1a9xgjr', // Your project ID
  dataset: 'production',
  apiVersion: '2021-10-21', // Use a recent API version date
  useCdn: false, // Must be false to perform mutations (deletions)
  token: process.env.SANITY_READ_TOKEN, // Use token with write permissions
});
// --------------------

async function deleteAllRecipes() {
  console.log('Attempting to delete all documents of type "recipe"...');
  try {
    // Construct the query to target all documents of the 'recipe' type
    const query = '*[_type == "recipe"]'; // ✅ Changed the type here

    // Execute the deletion based on the query
    const response = await client.delete({ query: query });

    console.log('Deletion response:', response);
    if (response && response.results) {
        console.log(`✅ Success! Deleted ${response.results.length} Recipe items.`);
    } else {
        console.log('✅ Deletion request sent. Verify in Sanity Studio.');
    }

  } catch (err) {
    console.error('❌ Error deleting documents:', err.message);
    if(err.statusCode === 401) {
        console.error('Hint: Check if your SANITY_EDITOR_TOKEN has the correct permissions (Editor or Administrator role).');
    }
  }
}

// --- Run the Deletion ---
deleteAllRecipes();
// ----------------------