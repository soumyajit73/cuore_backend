const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const TimelineCard = require("../models/TimelineCard");

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Kolkata"; // ✅ keep same TZ as timelineController

// --- Helper: Convert 12-hour time to 24-hour format ---
function convertTo24Hour(timeStr) {
  if (!timeStr) return "07:00";
  const [time, modifier] = timeStr.split(" ");
  if (!time || !modifier) return timeStr; // handle already 24hr or invalid input

  let [hours, minutes] = time.split(":");
  hours = parseInt(hours, 10);
  minutes = minutes || "00";

  if (modifier.toLowerCase() === "pm" && hours < 12) hours += 12;
  if (modifier.toLowerCase() === "am" && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

// --- Helper: Add minutes to an anchor time ---
function calculateScheduledTime(anchor, minutesToAdd) {
  return anchor.add(minutesToAdd, "minute").tz(TZ);
}

/**
 * ✅ Ensures all daily system cards exist in DB (for Wake up, Meals, etc.)
 * @param {*} userId 
 * @param {*} onboarding - user's onboarding doc (for wake_time, ex_time, smoking)
 * @param {*} localDay - dayjs() object for the current date in local TZ
 */
async function ensureSystemCardsExist(userId, onboarding, localDay) {
  try {
    const scheduleDate = localDay.startOf("day").toDate();

    // --- Calculate anchors dynamically ---
    const preferredWake = convertTo24Hour(onboarding?.o6Data?.wake_time) || "07:00";
    const [wakeHour, wakeMinute] = preferredWake.split(":").map(Number);

    let wakeUpAnchor = localDay.hour(wakeHour).minute(wakeMinute);
    if (!wakeUpAnchor.isValid()) wakeUpAnchor = localDay.hour(7).minute(0);

    const breakfastTime = calculateScheduledTime(wakeUpAnchor, 105);
    const lunchTime = calculateScheduledTime(wakeUpAnchor, 390);
    const dinnerTime = calculateScheduledTime(lunchTime, 390);
    const sleepTime = calculateScheduledTime(wakeUpAnchor, 960);

    const fitnessTimeStr12 = onboarding?.o5Data?.preferred_ex_time?.trim();
    let fitnessTime = fitnessTimeStr12
      ? dayjs.tz(`${localDay.format("YYYY-MM-DD")} ${convertTo24Hour(fitnessTimeStr12)}`, "YYYY-MM-DD HH:mm", TZ)
      : calculateScheduledTime(wakeUpAnchor, 30);

    const isSmoker =
      onboarding?.o4Data?.smoking?.trim().toLowerCase() === "daily" ||
      onboarding?.o4Data?.smoking?.trim().toLowerCase() === "occasionally";

    // --- System card definitions ---
    const systemCards = [
      { key: "SYSTEM_WAKEUP", title: "Wake Up", time: wakeUpAnchor, desc: "Ease into your day with Morning Calm" },
      ...(isSmoker
        ? [
            {
              key: "SYSTEM_TOBACCO",
              title: "Your Daily Health Win",
              time: calculateScheduledTime(wakeUpAnchor, 10),
              desc: "Skip the smoke, feel the difference",
            },
          ]
        : []),
      { key: "SYSTEM_CALORIE_IGNITE", title: "Calorie Ignite", time: calculateScheduledTime(wakeUpAnchor, 15), desc: "Jumpstart your metabolism" },
      { key: "SYSTEM_FITNESS", title: "Fitness", time: fitnessTime, desc: "Cardio & strength training" },
      { key: "SYSTEM_BREAKFAST", title: "Breakfast", time: breakfastTime, desc: "Boost your energy" },
      { key: "SYSTEM_SNACK_MORNING", title: "Mid-Morning Boost", time: calculateScheduledTime(breakfastTime, 150), desc: "A handful of fruit" },
      { key: "SYSTEM_HYDRATION_1", title: "Hydration Check", time: calculateScheduledTime(lunchTime, -60), desc: "You should have had 3–4 glasses of water by now." },
      { key: "SYSTEM_LUNCH", title: "Lunch", time: lunchTime, desc: "Re-energize yourself" },
      { key: "SYSTEM_REST_NAP", title: "Short Nap or Walk", time: calculateScheduledTime(lunchTime, 60), desc: "Defeat the midday slump" },
      { key: "SYSTEM_SNACK_EVENING", title: "Refresh & Refuel", time: calculateScheduledTime(lunchTime, 180), desc: "Evening snacks" },
      { key: "SYSTEM_HYDRATION_2", title: "Hydration Check", time: calculateScheduledTime(dinnerTime, -60), desc: "You should have had 7–8 glasses of water by now." },
      { key: "SYSTEM_DINNER", title: "Dinner", time: dinnerTime, desc: "Balanced and light" },
      { key: "SYSTEM_REST_WALK", title: "After-Dinner Walk", time: calculateScheduledTime(dinnerTime, 30), desc: "10–15 min walk" },
      { key: "SYSTEM_SNACK_NIGHT", title: "Optional Snack", time: calculateScheduledTime(sleepTime, -30), desc: "A small cup of milk, or 2 Marie biscuits" },
      { key: "SYSTEM_SLEEP", title: "Sleep", time: sleepTime, desc: "Unwind gently with Restful Night" },
    ];

    // --- Ensure each system card exists for the user ---
    for (const card of systemCards) {
      await TimelineCard.updateOne(
        { userId, scheduleDate, systemKey: card.key },
        {
          $setOnInsert: {
            userId,
            scheduleDate,
            scheduledTime: card.time.tz(TZ).format("HH:mm"),
            title: card.title,
            description: card.desc,
            type: "SYSTEM",
            isCompleted: false,
            isMissed: false,
            systemKey: card.key,
          },
        },
        { upsert: true }
      );
    }

    console.log(`✅ System cards ensured for ${userId} on ${localDay.format("YYYY-MM-DD")}`);
  } catch (error) {
    console.error("❌ Error ensuring system cards:", error);
  }
}

module.exports = { ensureSystemCardsExist };
