const { createClient } = require('@sanity/client');
const { Onboarding } = require('../models/onboardingModel.js');

// --- Sanity Client ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: true,
});

// --- Determine conditionTypes based on onboarding ---
// This function is correct and remains unchanged.
function determineConditionTypes(o3Data, o4Data) {
  const { diabetes, hypertension } = o3Data;
  const { smoking } = o4Data;

  // Return array in sequence you want
  if (diabetes && !hypertension && !smoking) return ['diabetes'];
  if (!diabetes && hypertension && !smoking) return ['hypertension'];
  if (diabetes && hypertension && !smoking) return ['diabetes_hypertension'];
  if (!diabetes && !hypertension && smoking) return ['general','smoking'];
  if (diabetes && smoking && !hypertension) return ['diabetes', 'smoking'];
  if (hypertension && smoking && !diabetes) return ['hypertension', 'smoking'];
  if (diabetes && hypertension && smoking)
    return ['diabetes_hypertension', 'smoking'];
  return ['general']; // none selected
}

// --- Fetch cards from Sanity in order ---
async function fetchCardsInSequence(conditionTypes) {
  // Fetch all cards matching any of the types
  // CHANGED: We now sort by 'title desc' (Z-A) to get the reverse order
  const query = `*[_type == "knowledgeCard" && conditionType in $types]{
    _id,
    title,
    subtitle,
    conditionType,
    details,
    images,
    _createdAt
  } | order(title desc)`; // <-- This is the key change

  const cards = await client.fetch(query, { types: conditionTypes });

  // Sort cards according to conditionTypes order (e.g., 'diabetes' first)
  const sortedCards = [];
  for (const type of conditionTypes) {
    // The cards are already sorted Z-A by the query
    const typeCards = cards.filter(c => c.conditionType === type);
    sortedCards.push(...typeCards);
  }

  // Remove duplicates (if any)
  const uniqueCards = Array.from(new Map(sortedCards.map(c => [c._id, c])).values());
  
  return uniqueCards;
}

// --- Controller ---
// This function is correct and remains unchanged.
// It will correctly use the test data you provided (hypertension: true)
// to call determineConditionTypes and get back ['hypertension'].
const getKnowledgeByUser = async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    // Get onboarding data
    const onboardingData = await Onboarding.findOne({ userId })
      .select('o3Data o4Data')
      .lean();

    if (!onboardingData) {
      return res.status(404).json({ 
        status: 'error',
        message: 'Onboarding data not found' 
      });
    }

    // Map O3/O4 schema to booleans using onboarding data
    const o3Data = {
      diabetes: onboardingData.o3Data?.hasDiabetes || false,
      hypertension: onboardingData.o3Data?.hasHypertension || false,
    };

const smokingStatus = onboardingData.o4Data?.smoking?.trim();
    const o4Data = {
  smoking:
    smokingStatus === 'Daily' ||
    smokingStatus === 'Occasionally',
};

    // Debug log
    console.log('Conditions:', {
      userId,
      o3Data,
      o4Data
   });

    // Determine which cards to fetch
    const conditionTypes = determineConditionTypes(o3Data, o4Data);

    // Fetch cards in sequence
    const cards = await fetchCardsInSequence(conditionTypes);

    // Return success response
    res.status(200).json({
      status: 'success',
      data: {
        userId,
        conditionTypes,
        cards
      }
    });

  } catch (err) {
    console.error('Error in getKnowledgeByUser:', err);
    res.status(500).json({ 
      status: 'error',
      message: 'Error fetching knowledge cards',
      error: err.message 
    });
  }
};

module.exports = { getKnowledgeByUser };