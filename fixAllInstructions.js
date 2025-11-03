import { createClient } from '@sanity/client';
import 'dotenv/config'; // Reads your .env file

// --- 1. SECURE Client Setup ---

// --- NEW DEBUG LINE ---
// if (!process.env.SANITY_WRITE_TOKEN) {
//   console.error("ERROR: SANITY_WRITE_TOKEN is not defined.");
//   console.error("Please check your .env file and make sure it's in the root folder.");
//   process.exit(1); // Stop the script
// }
// ----------------------

const client = createClient({
  projectId: 'r1a9xgjr', // Your project ID
  dataset: 'production',
  apiVersion: '2023-08-01',
  useCdn: false, // Must be false to see drafts
 token: process.env.SANITY_READ_TOKEN
});

async function fixAllInstructions() {
  console.log('Fetching ALL exercises (including drafts)...');
  
  // 1. Get every single exercise, including drafts
  const allExercises = await client.fetch(
    `*[_type == "exercise"]{
      _id,
      name,
      "code": code.current,
      instructions
    }`
  );

  if (!allExercises.length) {
    console.log('No exercises found.');
    return;
  }

  // 2. Group them by name
  const groups = {};
  for (const exercise of allExercises) {
    if (!exercise.name) continue; 
    if (!groups[exercise.name]) {
      groups[exercise.name] = [];
    }
    groups[exercise.name].push(exercise);
  }

  console.log(`Found ${allExercises.length} exercises, grouped into ${Object.keys(groups).length} unique names.`);

  let transaction = client.transaction();
  let totalPatched = 0;

  // 3. Process each group
  for (const name in groups) {
    const group = groups[name];
    let sourceHtml = null;
    let sourceDocId = null;

    // 3a. Find the "source" in this group
    // The source is the one with the longest instruction string
    for (const ex of group) {
      if (ex.instructions && ex.instructions.length > (sourceHtml ? sourceHtml.length : 10)) {
        sourceHtml = ex.instructions;
        sourceDocId = ex._id;
      }
    }

    if (!sourceHtml) {
      console.warn(`\n--- SKIPPING: "${name}" (No source instructions found) ---`);
      continue;
    }

    console.log(`\n--- PROCESSING: "${name}" ---`);
    console.log(`   (Found source in doc: ${sourceDocId})`);

    // 3b. Find all "targets" in this group and patch them
    for (const ex of group) {
      // Patch if instructions are different OR if it's the draft
      // This ensures the draft gets "published" with the patch
      if (ex.instructions !== sourceHtml || ex._id.startsWith('drafts.')) {
        
        // We patch the *published* ID, not the draft ID
        const docId = ex._id.replace('drafts.', ''); 

        console.log(`   -> Patching ${docId} (${ex.code || 'no code'})...`);
        totalPatched++;
        transaction.patch(docId, {
          set: { instructions: sourceHtml }
        });
      }
    }
  }

  if (totalPatched === 0) {
    console.log('\n✅ All exercises are already up-to-date.');
    return;
  }

  // 4. Commit all patches at once
  console.log(`\nCommitting ${totalPatched} total patches...`);
  await transaction.commit();
  
  console.log(`✅ Success! Updated ${totalPatched} exercises.`);
}

fixAllInstructions().catch(err => {
  console.error("Error during execution:", err.message);
});