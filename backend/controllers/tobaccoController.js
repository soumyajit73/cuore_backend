const { createClient } = require('@sanity/client');
const { Onboarding } = require('../models/onboardingModel.js');
const { TobaccoProfile } = require('../models/TobaccoProfile.js');

// --- Sanity Client ---
const client = createClient({
  projectId: 'r1a9xgjr',
  dataset: 'production',
  apiVersion: '2021-10-21',
  useCdn: false,
});

// --- Helper: Calculate Stats ---
function calculateStats(profile, age) {
  const { cigarettesPerDay = 0, yearsOfSmoking = 0 } = profile;
  const safeAge = age || 30;
  const safeYears = yearsOfSmoking || 0;

  const yearsLost = (cigarettesPerDay * safeYears * 11) / (60 * 24);
  const moneySpent = 12 * cigarettesPerDay * 365 * safeYears;

  // --- THE FIX IS HERE ---
  // Use Math.max to prevent negative numbers if age > 70
  const remainingYears = Math.max(0, 70 - safeAge);

  const yearsSaved = (cigarettesPerDay * remainingYears * 11) / (60 * 24);
  const moneySaved = 15 * cigarettesPerDay * 365 * remainingYears;
  // --- END OF FIX ---

  const formatNum = (num) => num.toFixed(1);
  const formatCurrency = (num) => Math.round(num).toLocaleString('en-IN');

  return {
    yearsLost: `${formatNum(yearsLost)} years`,
    moneySpent: `₹${formatCurrency(moneySpent)}`,
    yearsSaved: `${formatNum(yearsSaved)} years`,
    moneySaved: `₹${formatCurrency(moneySaved)}`,
  };
}

// --- Helper: Check if new log entry needed ---
function getDailyLogStatus(tobaccoProfile) {
  const { lastLogEntry, tobaccoFreeDays } = tobaccoProfile;
  const today = new Date();
  const resetTime = new Date(today);
  resetTime.setHours(4, 0, 0, 0);

  let needsNewEntry = true;
  let currentTFD = tobaccoFreeDays;

  if (lastLogEntry) {
    const lastEntryDate = new Date(lastLogEntry);
    if (
      lastEntryDate.toDateString() === today.toDateString() &&
      lastEntryDate >= resetTime
    ) {
      needsNewEntry = false; // already logged today
    }
  }

  return { needsNewEntry, currentTFD: needsNewEntry ? 0 : currentTFD };
}

// --- Helper: Get Conditional Message ---
async function getConditionalMessage(category, seenIds) {
  let query = `*[_type == "tobaccoEncouragement" && category == $category && !(_id in $seenIds)][0]`;
  let messageDoc = await client.fetch(query, { category, seenIds });

  let newSeenIds = [...seenIds];
  if (!messageDoc) {
    query = `*[_type == "tobaccoEncouragement" && category == $category][0]`;
    messageDoc = await client.fetch(query, { category });

    const categoryIds = (
      await client.fetch(
        `*[_type == "tobaccoEncouragement" && category == $category]{_id}`,
        { category }
      )
    ).map((d) => d._id);
    newSeenIds = seenIds.filter((id) => !categoryIds.includes(id));
  }

  if (messageDoc) newSeenIds.push(messageDoc._id);

  return {
    message: messageDoc?.message || 'You can do this!',
    updatedSeenIds: newSeenIds,
  };
}

// --- 1. GET TOBACCO DATA ---
const getTobaccoData = async (req, res) => {
  const { userId } = req.params;

  try {
    const onboarding = await Onboarding.findOne({ userId })
      .select('o2Data.age')
      .lean();
    const age = onboarding?.o2Data?.age;

    let profile = await TobaccoProfile.findOne({ userId }).lean();
    if (!profile) {
      const newProfile = new TobaccoProfile({ userId });
      await newProfile.save();
      profile = newProfile.toObject();
    }

    const sanityQuery = `*[_type == "tobaccoChallenge"] | order(level asc)`;
    const challenges = await client.fetch(sanityQuery);

    const stats = calculateStats(profile, age);
    const { needsNewEntry, currentTFD } = getDailyLogStatus(profile);

    const { message, updatedSeenIds } = await getConditionalMessage(
      'A',
      profile.seenEncouragementIds
    );
    await TobaccoProfile.updateOne(
      { userId },
      { seenEncouragementIds: updatedSeenIds }
    );

    res.status(200).json({
      status: 'success',
      data: {
        profile,
        stats,
        needsNewEntry,
        currentTFD,
        currentLevel: profile.currentLevel,
        allChallenges: challenges,
        encouragement: message,
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
    return res.status(400).json({
      status: 'error',
      message: 'cigarettesPerDay and yearsOfSmoking are required.',
    });
  }

  try {
    const profile = await TobaccoProfile.findOneAndUpdate(
      { userId },
      {
        cigarettesPerDay: Number(cigarettesPerDay),
        yearsOfSmoking: Number(yearsOfSmoking),
      },
      { new: true, upsert: true }
    ).lean();

    const onboarding = await Onboarding.findOne({ userId })
      .select('o2Data.age')
      .lean();
    const age = onboarding?.o2Data?.age;
    const stats = calculateStats(profile, age);

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully.',
      data: { profile, stats },
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
    return res
      .status(400)
      .json({ status: 'error', message: 'Count must be between 0–49.' });
  }

  try {
    const profile = await TobaccoProfile.findOne({ userId });
    if (!profile)
      return res
        .status(404)
        .json({ status: 'error', message: 'Profile not found.' });

    const now = new Date();
    const lastLog = profile.lastLogEntry
      ? new Date(profile.lastLogEntry)
      : null;
    const hasLoggedToday =
      lastLog &&
      lastLog.toDateString() === now.toDateString() &&
      now - lastLog < 24 * 60 * 60 * 1000;

    let newTFD = profile.tobaccoFreeDays;
    let newLevel = profile.currentLevel;
    let messageCategory = 'A';

    // ✅ Prevent multiple updates if already logged today
    if (hasLoggedToday) {
      return res.status(200).json({
        status: 'success',
        message: 'Already logged for today.',
        data: {
          tobaccoFreeDays: newTFD,
          currentLevel: newLevel,
          encouragement: 'Come back tomorrow to log again!',
        },
      });
    }

    // --- Main Logic ---
    const wasOnStreak = profile.tobaccoFreeDays > 0;
    const hadPreviousLog = profile.previousDayCount !== -1;

    if (todayCount === 0) {
      if (!wasOnStreak) messageCategory = 'D';
      else if (profile.tobaccoFreeDays > 2) messageCategory = 'E';
      else messageCategory = 'D';
      newTFD += 1; // Increase TFD only once per day
    } else {
      // relapse logic
      if (wasOnStreak) messageCategory = 'F';
      else if (hadPreviousLog && todayCount < profile.previousDayCount)
        messageCategory = 'B';
      else messageCategory = 'C';
      newTFD = 0;
      newLevel = Math.max(profile.currentLevel - 1, 1); // move one level down
    }

    // --- Level Up Logic ---
    if (todayCount === 0) {
      if (newTFD >= 35) newLevel = 9;
      else if (newTFD >= 25) newLevel = 8;
      else if (newTFD >= 18) newLevel = 7;
      else if (newTFD >= 12) newLevel = 6;
      else if (newTFD >= 8) newLevel = 5;
      else if (newTFD >= 5) newLevel = 4;
      else if (newTFD >= 3) newLevel = 3;
      else if (newTFD >= 1) newLevel = 2;
      else if (newTFD === 0 && todayCount < 5 && profile.currentLevel === 0)
        newLevel = 1;
    }

    const { message, updatedSeenIds } = await getConditionalMessage(
      messageCategory,
      profile.seenEncouragementIds
    );

    // --- Update profile ---
    profile.tobaccoFreeDays = newTFD;
    profile.currentLevel = newLevel;
    profile.lastLogEntry = now;
    profile.previousDayCount = todayCount;
    profile.seenEncouragementIds = updatedSeenIds;

    if (!profile.unlockedLevels.includes(newLevel)) {
      profile.unlockedLevels.push(newLevel);
    }

    await profile.save();

    res.status(200).json({
      status: 'success',
      message: 'Log updated successfully.',
      data: {
        tobaccoFreeDays: profile.tobaccoFreeDays,
        currentLevel: profile.currentLevel,
        unlockedLevels: profile.unlockedLevels,
        encouragement: message,
      },
    });
  } catch (err) {
    console.error('Error in logDailyCigarettes:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = {
  getTobaccoData,
  updateSmokingProfile,
  logDailyCigarettes,
};
