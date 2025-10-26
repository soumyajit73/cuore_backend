// --- deleteKnowledge.js ---
import { createClient } from "@sanity/client";

// --- Sanity Client Configuration ---
// (Copied from your import script)
const client = createClient({
  projectId: "r1a9xgjr",
  dataset: "production",
  apiVersion: "2021-10-21",
  useCdn: false, // Must be false for mutations
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j',
});

// --- !!! ---
// This is the document type your import script creates.
// This script will delete ALL documents of this type.
// --- !!! ---
const DOCUMENT_TYPE_TO_DELETE = "knowledgeCard";

// To delete your meditations instead, change the line above to:
// const DOCUMENT_TYPE_TO_DELETE = "cuoreMindMeditation";


async function deleteAllOfType() {
  console.log(`Attempting to delete all documents of type: "${DOCUMENT_TYPE_TO_DELETE}"...`);

  try {
    // This query finds all documents of the specified type and deletes them
    const result = await client.delete({
      query: `*[_type == "${DOCUMENT_TYPE_TO_DELETE}"]`
    });

    console.log(`✅ Success! Deleted ${result.results.length} documents.`);
    if (result.results.length === 0) {
      console.log("No documents of that type were found to delete.");
    }

  } catch (err) {
    console.error(`❌ Error deleting documents:`, err.message);
  }
}

// --- Run Delete ---
// This confirmation is a small safety check.
// You can remove it if you want the script to run immediately.
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question(`Are you sure you want to delete ALL "${DOCUMENT_TYPE_TO_DELETE}" documents? (yes/no) `, (answer) => {
  if (answer.toLowerCase() === 'yes') {
    deleteAllOfType();
  } else {
    console.log("Delete operation cancelled.");
  }
  rl.close();
});