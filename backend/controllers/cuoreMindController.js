const { createClient } = require('@sanity/client');
const { Onboarding } = require('../models/onboardingModel.js'); // Adjust path as needed

// --- Sanity Client ---
// (Uses the same client config as your other controllers)
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: true, // Use CDN for faster read-only queries
});

/**
 * Calculates Sleep and Stress scores based on O6 data.
 * @param {object} o6Data - The o6Data object from the Onboarding model.
 * @returns {object} An object containing { sleepScore, stressScore }.
 */
function calculateScores(o6Data) {
  let sleepScore = 0;
  let stressScore = 0;

  // Calculate Sleep Score
  // Per doc: Sleep score = 100 - (Sleep points × 12)
  if (o6Data && typeof o6Data.sleepPoints === 'number') {
    sleepScore = 100 - (o6Data.sleepPoints * 12);
  }

  // Calculate Stress Score
  // Per doc: Stress score = 100 - (Average stress points × 12)
  if (o6Data && typeof o6Data.averageStressPoints === 'number') {
    stressScore = 100 - (o6Data.averageStressPoints * 12);
  }

  // Clamp scores to be within 0-100 and round them
  const clamp = (num) => Math.max(0, Math.min(100, Math.round(num)));

  return {
    sleepScore: clamp(sleepScore),
    stressScore: clamp(stressScore),
  };
}

/**
 * Fetches and sorts all meditations from Sanity.
 * @returns {object} An object containing { morningHarmony, quietMind }.
 */
async function fetchMeditations() {
  // Query to get all meditations, sorted by their rank.
  // We also get the audio file's URL directly (if one was uploaded).
  // Note: We are fetching 'instructions' which is now 'text' type
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

  // Separate the flat list into the two categories
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
    // 1. Get Onboarding data for scores
    const onboardingData = await Onboarding.findOne({ userId })
      .select('o6Data') // Only request the o6Data field
      .lean();

    if (!onboardingData || !onboardingData.o6Data) {
      return res.status(404).json({
        status: 'error',
        message: 'O6 onboarding data not found for this user.'
      });
    }

    // 2. Calculate Scores
    const { sleepScore, stressScore } = calculateScores(onboardingData.o6Data);

    // 3. Fetch Meditations from Sanity
    // The 3-week unlock logic will be handled on the frontend,
    // so we send the complete, ordered lists.
    const { morningHarmony, quietMind } = await fetchMeditations();

    // 4. Return all data in one payload
    res.status(200).json({
      status: 'success',
      data: {
       sleepScore,
        stressScore,
        morningHarmony, // Full ordered list of morning meditations
        quietMind,      // Full ordered list of night meditations
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
