const { createClient } = require('@sanity/client');
const { Onboarding } = require('../models/onboardingModel.js'); // Adjust path as needed

// --- Sanity Client ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: true,
});

// --- CORRECT SCORING MAPS (from user) ---
const SLEEP_MAP = {
  "Less than 6 hours": 8,
  "Between 6 to 7 hours": 4,
  "Between 7 to 8 hours": 0,
  "Between 8 to 9 hours": 1,
  "More than 9 hours": 4,
};

const STRESS_MAP = { 
  "Never": 0, 
  "Sometimes": 3, 
  "Often": 6, 
  "Always": 8 
};

// --- REVERSE-SCORED MAP (for "enjoyable" question) ---
// Based on the STRESS_MAP, "Often" (which is good) should be 0 points.
// "Never" enjoyable (which is bad) should be 8 points.
const REVERSE_STRESS_MAP = {
  "Never": 8,
  "Sometimes": 3, // Assuming "Sometimes" is the middle value
  "Often": 0,
  "Always": 0, // "Always" enjoyable is also 0 stress points
};

/**
 * Calculates Sleep and Stress scores from O6 data.
 * Will use pre-calculated points if they exist,
 * otherwise, will calculate them from raw strings.
 * @param {object} o6Data - The o6Data object from the Onboarding model.
 * @returns {object} An object containing { sleepScore, stressScore }.
 */
function calculateScores(o6Data) {
  let sleepScore = 0;
  let stressScore = 0;
  let sleepPoints = 0;
  let averageStressPoints = 0;

  // --- 1. Calculate Sleep Score ---
  // Per doc: Sleep score = 100 - (Sleep points × 12)

  // First, check if points are already calculated and saved
  if (typeof o6Data.sleepPoints === 'number') {
    sleepPoints = o6Data.sleepPoints;
  }
  // Fallback: Calculate points from the raw "sleep_hours" string
  else if (o6Data.sleep_hours && SLEEP_MAP[o6Data.sleep_hours] !== undefined) {
    // Use the correct map provided by the user
    sleepPoints = SLEEP_MAP[o6Data.sleep_hours];
  }
  // (If no data, sleepPoints remains 0)

  sleepScore = 100 - (sleepPoints * 12);

  // --- 2. Calculate Stress Score ---
  // Per doc: Stress score = 100 - (Average stress points × 12)
  // Based on 3 questions: "difficulty", "little interest" (enjoyable), and "anxious"

  // First, check if points are already calculated
  if (typeof o6Data.averageStressPoints === 'number') {
    averageStressPoints = o6Data.averageStressPoints;
  }
  // Fallback: Calculate points from raw strings
  else {
    // 1. "difficulty" -> problems_overwhelming (Uses STRESS_MAP)
    const p1_difficulty = STRESS_MAP[o6Data.problems_overwhelming] || 0;
    
    // 2. "little interest" -> enjoyable (Uses REVERSE_STRESS_MAP)
    const p2_interest = REVERSE_STRESS_MAP[o6Data.enjoyable] || 0;
    
    // 3. "anxious" -> felt_nervous (Uses STRESS_MAP)
    const p3_anxious = STRESS_MAP[o6Data.felt_nervous] || 0;

    const totalStressPoints = p1_difficulty + p2_interest + p3_anxious;
    averageStressPoints = totalStressPoints / 3; // Calculate the average
  }

  stressScore = 100 - (averageStressPoints * 12);

  // --- 3. Return clamped scores ---
  // Clamp scores to be within 0-100 and round them
  const clamp = (num) => Math.max(0, Math.min(100, Math.round(num)));

  return {
    sleepScore: clamp(sleepScore),
    stressScore: clamp(stressScore),
  };
}


/**
 * Fetches and sorts all meditations from Sanity.
 */
async function fetchMeditations() {
  const query = `*[_type == "cuoreMindMeditation"] | order(orderRank asc) {
    _id,
    title,
    subtitle,
    category,
    orderRank,
    "audioUrl": audioFile.asset->url,
    instructions 
  }`;
  const meditations = await client.fetch(query);
  const morningHarmony = meditations.filter(m => m.category === 'morning');
  const quietMind = meditations.filter(m => m.category === 'night');
  return { morningHarmony, quietMind };
}


/**
 * Main controller to get all data for the Cuore Mind screen.
 */
const getCuoreMindData = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'userId is required' 
    });
  }

  try {
    const onboardingData = await Onboarding.findOne({ userId })
      .select('o6Data')
      .lean();

    if (!onboardingData || !onboardingData.o6Data) {
      return res.status(404).json({
      
        status: 'error',
        message: 'O6 onboarding data not found for this user.'
      });
    }

    // 2. Calculate Scores (This function is now fixed)
    const { sleepScore, stressScore } = calculateScores(onboardingData.o6Data);

    // 3. Fetch Meditations
    const { morningHarmony, quietMind } = await fetchMeditations();

    // 4. Return all data
    res.status(200).json({
      status: 'success',
      data: {
        sleepScore,
        stressScore,
        morningHarmony,
        quietMind,
      }
    });

  } catch (err) {
    console.error('Error in getCuoreMindData:', err);
    res.status(500).json({
      status: 'error',
      message: 'An internal server error occurred',
      error: err.message
    });
  }
};

module.exports = { getCuoreMindData };

