const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j',
});

async function deleteAllExercises() {
  try {
    console.log('Fetching all exercise documents...');
    const exercises = await client.fetch(`*[_type == "exercise"]{_id, name}`);

    if (!exercises.length) {
      console.log('✅ No exercise documents found to delete.');
      return;
    }

    console.log(`⚠️ Found ${exercises.length} exercise documents. Deleting...`);
    let transaction = client.transaction();

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      transaction.delete(ex._id);

      // Commit in small batches (e.g., every 100)
      if ((i + 1) % 100 === 0) {
        console.log(`Committing batch of 100 deletions...`);
        await transaction.commit();
        transaction = client.transaction();
      }
    }

    // Commit remaining deletions
    await transaction.commit();
    console.log('✅ All exercise documents deleted successfully.');
  } catch (error) {
    console.error('❌ Error deleting exercise documents:', error.message);
  }
}

deleteAllExercises();
