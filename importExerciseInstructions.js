import fs from 'fs';
import path from 'path';
import { createClient } from '@sanity/client';
import mammoth from 'mammoth';

const client = createClient({
  projectId: 'r1a9xgjr', // 
  dataset: 'production',
  apiVersion: '2023-08-01',
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j', // 
});

const BASE_PATH = path.join(process.cwd(), '_MIGRATION_DATA', 'exercise-instructions');
const BATCH_SIZE = 10;

// --- Helper Functions ---
async function commitBatch(transaction, count) {
  if (count === 0) return 0;
  console.log(`... Committing batch of ${count} instructions ...`);
  try {
    await transaction.commit({ autoGenerateArrayKeys: true });
  } catch (err) {
    console.error('Error committing batch:', err.message);
  }
  return 0;
}

function generateKey(length = 12) {
  return Math.random().toString(36).substring(2, 2 + length);
}

// --- Process Single Word Doc ---
async function processFile(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.trim(); // Cleaned text
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err.message);
    return null;
  }
}

// --- Main Folder Processor ---
async function processInstructionsFolder(directory) {
  const files = fs.readdirSync(directory);
  let transaction = client.transaction();
  let currentBatchCount = 0;

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recurse if subfolder
      await processInstructionsFolder(filePath);
    } else if (file.endsWith('.docx')) {
      const exerciseName = path.basename(file, '.docx').trim();

      // Lookup exercise by name (case-insensitive)
      let exercise;
      try {
        exercise = await client.fetch(
          `*[_type == "exercise" && lower(name) == $name][0]`,
          { name: exerciseName.toLowerCase() }
        );
      } catch (err) {
        console.error(`Fetch error for ${exerciseName}:`, err.message);
        continue;
      }

      if (!exercise) {
        console.warn(`⚠️ No exercise found for "${exerciseName}"`);
        continue;
      }

      const instructionsText = await processFile(filePath);
      if (!instructionsText) continue;

      transaction = transaction.patch(exercise._id, { set: { instructions: instructionsText } });
      currentBatchCount++;

      if (currentBatchCount >= BATCH_SIZE) {
        await commitBatch(transaction, currentBatchCount);
        transaction = client.transaction();
        currentBatchCount = 0;
      }

      console.log(`✅ Updated instructions for "${exerciseName}"`);
    }
  }

  // Commit remaining batch
  await commitBatch(transaction, currentBatchCount);
}

// --- Run Import ---
async function runImport() {
  console.log(`Starting import of exercise instructions...`);
  if (!fs.existsSync(BASE_PATH)) {
    console.error(`Base directory not found: ${BASE_PATH}`);
    return;
  }

  await processInstructionsFolder(BASE_PATH);
  console.log(`✅ All exercise instructions processed successfully!`);
}

runImport().catch(err => console.error('Import failed:', err));