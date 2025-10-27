const { createClient } = require('@sanity/client');
const { Onboarding } = require('../models/onboardingModel.js');
const { TobaccoProfile } = require('../models/TobaccoProfile.js');

// --- Sanity Client ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false, // Use false to get fresh data
});

// --- Helper: Calculate Stats ---
function calculateStats(profile, age) {
  const { cigarettesPerDay = 0, yearsOfSmoking = 0 } = profile;
  // Use a default age if not found, to prevent (70 - undefined)
  const safeAge = age || 30; 
  const safeYears = yearsOfSmoking || 0;
  
  // Simplified: (cigPerDay * yearsSmoked * 11) / 1440
  const yearsLost = (cigarettesPerDay * safeYears * 11) / (60 * 24);

  // Assuming 12 is the cost per cigarette
  const moneySpent = 12 * cigarettesPerDay * 365 * safeYears;

  // Simplified: (cigPerDay * (70 - age) * 11) / 1440
  const yearsSaved = (cigarettesPerDay * (70 - safeAge) * 11) / (60 * 24);

  // Assuming 15 is the cost per cigarette
  const moneySaved = 15 * cigarettesPerDay * 365 * (70 - safeAge);

  const formatNum = (num) => Math.round(num);
  const formatCurrency = (num) => {
    // Format to Indian currency style (e.g., ₹1,73,000)
    const rounded = Math.round(num);
    return rounded.toLocaleString('en-IN');
  };

  return {
    yearsLost: `${formatNum(yearsLost)} years`,
    moneySpent: `₹${formatCurrency(moneySpent)}`,
    yearsSaved: `${formatNum(yearsSaved)} years`,
    moneySaved: `₹${formatCurrency(moneySaved)}`,
  };
}

// --- Helper: Check if a new log entry is needed ---
function getDailyLogStatus(tobaccoProfile) {
  const { lastLogEntry, tobaccoFreeDays } = tobaccoProfile;
  const today = new Date();
  
  // Set time to 4:00 AM today for comparison
  const resetTime = new Date(today);
  resetTime.setHours(4, 0, 0, 0);

  let needsNewEntry = true;
  let currentTFD = tobaccoFreeDays;

  if (lastLogEntry) {
    const lastEntryDate = new Date(lastLogEntry);
    
    // Check if the last log was today, after 4 AM
    if (lastEntryDate.toDateString() === today.toDateString() && lastEntryDate >= resetTime) {
      needsNewEntry = false;
    }
    // Check if the last log was "yesterday", but *before* 4 AM (counts for yesterday's log)
    else if (lastEntryDate.toDateString() === new Date(today.getTime() - 86400000).toDateString() && lastEntryDate < new Date(resetTime.getTime() - 86400000)) {
       needsNewEntry = false;
    }
  }

  return { 
    needsNewEntry, // Does the UI need to show the entry box?
    // Show 0 on the TFD counter if a new entry is needed
    currentTFD: needsNewEntry ? 0 : currentTFD 
  };
}

// --- Helper: Get a conditional message from Sanity ---
async function getConditionalMessage(category, seenIds) {
  // 1. Try to find a message in this category that HAS NOT been seen
  let query = `*[_type == "tobaccoEncouragement" && category == $category && !(_id in $seenIds)][0]`;
  let messageDoc = await client.fetch(query, { category, seenIds });

  let newSeenIds = [...seenIds];
  
  // 2. If no unseen message is found (they've seen them all)
  if (!messageDoc) {
    // 2a. Fetch ANY message from this category (to reset)
    query = `*[_type == "tobaccoEncouragement" && category == $category][0]`;
    messageDoc = await client.fetch(query, { category });

    // 2b. Clear all seen IDs *from this specific category*
    const categoryIds = (await client.fetch(`*[_type == "tobaccoEncouragement" && category == $category]{_id}`)).map(d => d._id);
    newSeenIds = seenIds.filter(id => !categoryIds.includes(id));
  }
  
  // 3. Add the new message ID to the seen list
  if (messageDoc) {
    newSeenIds.push(messageDoc._id);
  }

  return { 
    message: messageDoc?.message || "You can do this!", // Fallback message
    updatedSeenIds: newSeenIds 
  };
}


// --- 1. GET ALL TOBACCO DATA ---
const getTobaccoData = async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Get Age from Onboarding Model
    const onboarding = await Onboarding.findOne({ userId }).select('o2Data.age').lean();
    const age = onboarding?.o2Data?.age;

    // 2. Get User's Tobacco Profile (or create a new one)
    let profile = await TobaccoProfile.findOne({ userId }).lean();
    if (!profile) {
      const newProfile = new TobaccoProfile({ userId });
      await newProfile.save();
      profile = newProfile.toObject(); // Convert to plain object for manipulation
    }

    // 3. Get Static Content from Sanity (Challenges)
    const sanityQuery = `*[_type == "tobaccoChallenge"] | order(level asc)`;
    const challenges = await client.fetch(sanityQuery);

    // 4. Perform Calculations
    const stats = calculateStats(profile, age);
    const { needsNewEntry, currentTFD } = getDailyLogStatus(profile);
    
    // 5. Get a "General" (Category A) message for the screen load
    const { message, updatedSeenIds } = await getConditionalMessage('A', profile.seenEncouragementIds);
    
    // 6. Update the profile with the new seenIds list
    // (We do this on GET so the "seen" list is updated even if they don't log)
    await TobaccoProfile.updateOne({ userId }, { seenEncouragementIds: updatedSeenIds });

    // 7. Return all data
    res.status(200).json({
      status: 'success',
      data: {
        profile,
        stats,
        needsNewEntry,
        currentTFD,
        currentLevel: profile.currentLevel,
        allChallenges: challenges,
        encouragement: message, // Send the conditional message
      },
    });

  } catch (err) {
    console.error('Error in getTobaccoData:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// --- 2. UPDATE SMOKING PROFILE ---
const updateSmokingProfile = async (req, res) => {
  const { userId } = req.params;
  const { cigarettesPerDay, yearsOfSmoking } = req.body;

  if (cigarettesPerDay === undefined || yearsOfSmoking === undefined) {
    return res.status(400).json({ status: 'error', message: 'cigarettesPerDay and yearsOfSmoking are required.' });
  }

  try {
    const profile = await TobaccoProfile.findOneAndUpdate(
      { userId },
      { 
        cigarettesPerDay: Number(cigarettesPerDay), 
        yearsOfSmoking: Number(yearsOfSmoking) 
      },
      { new: true, upsert: true } // `new: true` returns the updated doc
    ).lean();

    // Re-calculate stats with new profile
    const onboarding = await Onboarding.findOne({ userId }).select('o2Data.age').lean();
    const age = onboarding?.o2Data?.age;
    const stats = calculateStats(profile, age);

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully.',
      data: {
        profile,
        stats,
      }
    });

  } catch (err) {
    console.error('Error in updateSmokingProfile:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// --- 3. LOG DAILY CIGARETTE COUNT ---
const logDailyCigarettes = async (req, res) => {
  const { userId } = req.params;
  const { count } = req.body;

  const todayCount = Number(count);
  if (isNaN(todayCount) || todayCount < 0 || todayCount > 49) {
    return res.status(400).json({ status: 'error', message: 'Count must be a number between 0 and 49.' });
  }

  try {
    const profile = await TobaccoProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found.' });
    }

    let newTFD = profile.tobaccoFreeDays;
    let newLevel = profile.currentLevel;
    let messageCategory = 'A'; // Default category

    // --- Logic: Determine which message to show ---
    const wasOnStreak = profile.tobaccoFreeDays > 0;
    const hadPreviousLog = profile.previousDayCount !== -1;

    if (todayCount === 0) {
      if (!wasOnStreak) {
        messageCategory = 'D'; // D: Logged Smoke-Free Day (First)
      } else if (profile.tobaccoFreeDays > 2) {
        messageCategory = 'E'; // E: Smoke-Free Streak (>2 days)
      } else {
        messageCategory = 'D'; // D: (Treating any new '0' as D for now)
      }
      newTFD += 1; // Increment TFD
      
    } else { // todayCount > 0
      if (wasOnStreak) {
        messageCategory = 'F'; // F: Relapse
      } else if (hadPreviousLog && todayCount < profile.previousDayCount) {
        messageCategory = 'B'; // B: Reduced Intake
      } else if (hadPreviousLog && todayCount >= profile.previousDayCount) {
        messageCategory = 'C'; // C: Increased Intake
      } else {
        messageCategory = 'C'; // C: (Default for any non-zero log)
      }
      newTFD = 0; // Reset TFD
    }
    // --- END LOGIC ---

    // --- Level Up Logic (from your doc) ---
    if (newTFD >= 35) newLevel = 9;
    else if (newTFD >= 25) newLevel = 8;
    else if (newTFD >= 18) newLevel = 7;
    else if (newTFD >= 12) newLevel = 6;
    else if (newTFD >= 8) newLevel = 5;
    else if (newTFD >= 5) newLevel = 4;
    else if (newTFD >= 3) newLevel = 3;
    else if (newTFD >= 1) newLevel = 2;
    // Level 1 logic: "can be opened when tobacco count is < 5"
    else if (newTFD === 0 && todayCount < 5 && profile.currentLevel === 0) newLevel = 1;
    else if (newTFD === 0) newLevel = 1; // Default to level 1 if TFD is 0
    
    // Get the new conditional message
    const { message, updatedSeenIds } = await getConditionalMessage(messageCategory, profile.seenEncouragementIds);

    // Update the profile in DB
    profile.tobaccoFreeDays = newTFD;
    profile.currentLevel = newLevel;
    profile.lastLogEntry = new Date();
    profile.previousDayCount = todayCount; // Save today's count for *tomorrow's* comparison
    profile.seenEncouragementIds = updatedSeenIds; // Save the updated list of seen messages
    
    if (!profile.unlockedLevels.includes(newLevel)) {
      profile.unlockedLevels.push(newLevel);
    }
    
    await profile.save();

    // Send response back to the app
    res.status(200).json({
      status: 'success',
      message: 'Log updated.',
      data: {
        tobaccoFreeDays: profile.tobaccoFreeDays,
        currentLevel: profile.currentLevel,
        unlockedLevels: profile.unlockedLevels,
        encouragement: message, // <-- Send the new conditional message back
      }
    });

  } catch (err) {
    console.error('Error in logDailyCigarettes:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};


module.exports = { 
  getTobaccoData,
  updateSmokingProfile,
  logDailyCigarettes
};

