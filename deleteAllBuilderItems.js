// deleteAllBuilderItems.js
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 'r1a9xgjr', // Your project ID
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false, // Must be false for mutations
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // Use token with write permissions
});

async function deleteAll() {
  console.log('Attempting to delete all documents of type "mealBuilderItem"...');
  try {
    const response = await client.delete({ query: '*[_type == "mealBuilderItem"]' });
    console.log('Deletion response:', response);
    if (response && response.results) {
        console.log(`✅ Success! Deleted ${response.results.length} Meal Builder items.`);
    } else {
        console.log('✅ Deletion request sent.');
    }
  } catch (err) {
    console.error('❌ Error deleting documents:', err.message);
  }
}
deleteAll();