// deleteAllNourishItems.js
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 'r1a9xgjr', // Your project ID
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false, // Must be false for mutations
token: process.env.SANITY_READ_TOKEN, // Use same Editor token
});

async function deleteAll() {
  console.log('Attempting to delete all documents of type "nourishPlanItem"...');
  try {
    const response = await client.delete({ query: '*[_type == "nourishPlanItem"]' });
    console.log('Deletion response:', response);
    if (response && response.results) {
        console.log(`✅ Success! Deleted ${response.results.length} Nourish Plan items.`);
    } else {
        console.log('✅ Deletion request sent.');
    }
  } catch (err) {
    console.error('❌ Error deleting documents:', err.message);
  }
}
deleteAll();