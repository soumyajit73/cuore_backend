const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx'); // <-- New library
const { createClient } = require('@sanity/client');

// --- Sanity Client Configuration ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: process.env.SANITY_READ_TOKEN,
});

// --- File Path ---
// Using your correct file path
const EXCEL_FILE_PATH = path.join(__dirname, './backend/data/8 Tobacco Cessation.xlsx');
const SHEET_NAME = 'NLC'; // <-- Assuming this is the name of your sheet (tab) in Excel

async function importChallenges() {
  console.log('Starting Tobacco Challenge import from Excel...');

  try {
    // 1. Read the Excel file
    const workbook = xlsx.readFile(EXCEL_FILE_PATH);

  
    // 2. Get the specific sheet
    const worksheet = workbook.Sheets[SHEET_NAME];
    if (!worksheet) {
      console.error(`Error: Sheet named "${SHEET_NAME}" not found in the Excel file.`);
      console.log('Available sheets:', Object.keys(workbook.Sheets));
      return;
    }

    // 3. Convert sheet to JSON
    // We use `range: 4` to tell it that row 5 (index 4) is the header row,
    // skipping the 4 blank rows at the top.
    const challenges = xlsx.utils.sheet_to_json(worksheet, { range: 4 });

    console.log(`Excel sheet processed. Found ${challenges.length} challenges.`);

    if (challenges.length === 0) {
      console.log('No challenges found. Make sure the file and sheet name are correct.');
      return;
    }

    // 4. Prepare a Sanity transaction
    let transaction = client.transaction();
    let importedCount = 0;

    for (const item of challenges) {
      // Get data using the exact header names from the Excel file
      const levelStr = item['Level'];
      const tfdStr = item['Tobacco Free Days (tfd)']; // This can be a string ("Start") or a number (0, 1, 3)
      const challengeText = item['Next Level Challenge'];
      const logic = item['Algorithm Logic'];
      
      const level = parseInt(levelStr, 10);
      
      // Skip invalid rows
      if (isNaN(level)) {
        console.log(`Skipping invalid row (level is not a number):`, item);
        continue;
      }

      // Split the multi-line challenge text into three fields
      const challengeLines = (challengeText || '').split('\n');
      
      // --- THIS IS THE FIX ---
      let tfdRequired;
      // First, check if tfdStr is a string, then check its value
      if (typeof tfdStr === 'string' && tfdStr.toLowerCase() === 'start') {
        tfdRequired = 0; // This is for Level 0
      } else {
        // For all other cases (including numbers 0, 1, 3...), just parse it.
        tfdRequired = parseInt(tfdStr, 10);
      }
      // --- END OF FIX ---

      // 5. Create the Sanity document
      const doc = {
        _type: 'tobaccoChallenge',
        _id: `tobacco_challenge_level_${level}`, 
        level: level,
        tfdRequired: tfdRequired,
        challengeText: challengeLines[0] || '',
        challengeText2: challengeLines[1] || '',
        challengeText3: challengeLines[2] || '',
        algorithmLogic: logic || '',
      };

      // Add the document creation to our transaction
      transaction.createOrReplace(doc);
     importedCount++;
    }

    // 6. Commit the transaction to Sanity
    await transaction.commit();
    console.log(`\n🎉 Success! Uploaded ${importedCount} challenges to Sanity.`);

  } catch (err) {
    console.error('Error importing from Excel:', err.message);
  }
}

// --- Run Import ---
importChallenges();

