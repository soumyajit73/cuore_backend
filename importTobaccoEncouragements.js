const { createClient } = require('@sanity/client');

// --- Sanity Client Configuration ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
  token: 'ski7OSxHCDxGrcmalQJHYrGoBYj3FO2gDyKcNR8PkpKcTTlnzFyzG4gAsUKuTRdz5FIXbGcQWS4AzLeROTXh0kUXkBNa4o5uroRmCkZAXgf7gxEbe20dWsDfO45iVYSuMKdbkO9jKWzWDBgBU879Qe0QTOHwKLdknAxX7a6rCmJmFgnmDG3j',
});

// --- All Encouragement Messages (from your doc) ---
const messages = [
  // Category A: General (Smoker)
  { category: 'A', message: 'Smoking increases the risk of dementia by 30-50%.' },
  { category: 'A', message: 'Smoking lowers testosterone, reducing libido, energy, and performance.' },
  { category: 'A', message: 'Smoking accelerates aging, leading to wrinkles and premature sagging.' },
  { category: 'A', message: 'Smokers have weaker memory and cognitive function than non-smokers.' },
  { category: 'A', message: 'Smoking damages blood vessels, increasing the risk of erectile dysfunction.' },
  { category: 'A', message: 'Every cigarette takes minutes from your life—quitting gives them back.' },
  { category: 'A', message: 'Quitting restores skin health, improving elasticity and glow.' },
  { category: 'A', message: 'Your body starts healing the moment you quit—every breath is renewal.' },

  // Category B: Reduced Intake
  { category: 'B', message: 'Your first smoke-free day is the start of a healthier, happier you.' },
  { category: 'B', message: 'Each smoke-free day is a victory—you\'re reclaiming your health.' },
  { category: 'B', message: 'It\'s not just saying ‘no’ to smoking; it’s saying ‘yes’ to health.' },
  { category: 'B', message: 'Every skipped cigarette is a small win against disease and addiction.' },
  { category: 'B', message: 'You are stronger than cravings—each choice rewrites your future.' },
  { category: 'B', message: 'Your body thanks you—your lungs, heart, and mind are healing.' },

  // Category C: Increased Intake
  { category: 'C', message: 'Cravings are temporary; your strength is permanent.' },
  { category: 'C', message: 'An urge is just a thought, not a command—it will pass.' },
  { category: 'C', message: 'You control your choices, not cigarettes—each resistance restores power.' },
  { category: 'C', message: 'Today is tough, but every craving resisted brings you closer to freedom.' },
  { category: 'C', message: 'Quitting is hard, but so are you—each challenge proves resilience.' },
  { category: 'C', message: 'Your addiction whispers, but your strength roars louder—keep going!' },
  { category: 'C', message: 'Every smoke-free moment proves your strength—stay strong.' },
  { category: 'C', message: 'You didn’t come this far to stop now—keep pushing forward!' },
  { category: 'C', message: 'Cravings fade, but pride in quitting lasts forever—your future self is cheering for you.' },

  // Category D: Logged Smoke-Free Day
  { category: 'D', message: 'When you feel weak, remember how far you’ve come.' },
  { category: 'D', message: 'Your journey inspires others—every smoke-free day is a victory.' },
  { category: 'D', message: 'Progress, not perfection—every smoke-free moment counts.' },
  { category: 'D', message: 'Your journey is courageous—you\'re choosing life, health, and freedom.' },
  { category: 'D', message: 'Each breath without smoke is a gift of energy and vitality.' },

  // Category E: Smoke-Free Streak (>2 days)
  { category: 'E', message: 'Every small step builds your smoke-free future.' },
  { category: 'E', message: 'Your lungs, heart, and body are stronger—your future is brighter.' },
  { category: 'E', message: 'Your mind is clearer, your body stronger, your spirit freer.' },
  { category: 'E', message: 'You’ve come this far—why stop? Every smoke-free day adds years.' },
  { category: 'E', message: 'You chose a healthier path—the hardest part is behind you.' },
  { category: 'E', message: 'A healthier, happier you is unfolding each day.' },

  // Category F: Relapse
  { category: 'F', message: 'You didn’t come this far to only come this far—keep going!' },
  { category: 'F', message: 'Focus on what you’ve gained—energy, better breathing, and freedom.' },
  { category: 'F', message: 'When stress hits, breathe deeply—you’ve already proven your strength.' },
  { category: 'F', message: 'One bad moment doesn’t erase your success—each day makes you stronger.' },
  { category: 'F', message: 'You’ve come too far to go back—stay committed.' },
  { category: 'F', message: 'You’re not giving something up—you’re gaining everything.' },
];

async function importEncouragements() {
  console.log(`Found ${messages.length} encouragement messages. Starting import...`);

  // Use a transaction to upload all documents at once
  let transaction = client.transaction();
  let count = 0;

  for (const item of messages) {
    count++;
    // Create a unique ID for each message
    const docId = `encouragement_${item.category.toLowerCase()}_${count}`;

    const doc = {
      _type: 'tobaccoEncouragement',
      _id: docId,
      category: item.category,
      message: item.message,
    };

    // Add the document to the transaction
    transaction.createOrReplace(doc);
  }

  // Commit the transaction to Sanity
  try {
    await transaction.commit();
    console.log(`\n🎉 Success! Uploaded ${messages.length} encouragement messages to Sanity.`);
  } catch (err) {
    console.error('Error committing transaction to Sanity:', err.message);
  }
}

// --- Run Import ---
importEncouragements();
