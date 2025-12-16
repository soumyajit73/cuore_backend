const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const TimelineCard = require("../models/TimelineCard");

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Kolkata";

// --- Convert 12h → 24h ---
function convertTo24Hour(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeStr;

  let [, h, m, p] = match;
  h = parseInt(h, 10);
  if (p.toUpperCase() === "PM" && h !== 12) h += 12;
  if (p.toUpperCase() === "AM" && h === 12) h = 0;

  return `${h.toString().padStart(2, "0")}:${m}`;
}

// --- Add minutes to wake anchor ---
function addMinutes(anchor, mins) {
  return anchor.add(mins, "minute").tz(TZ);
}

async function ensureSystemCardsExist(userId, onboarding, localDay) {
  try {
    const scheduleDate = localDay.startOf("day").toDate();

    // --------------------------------------------------
    // 1️⃣ WAKE UP (ANCHOR)
    // --------------------------------------------------
    const wakeStr =
      convertTo24Hour(onboarding?.o6Data?.wake_time) || "06:45";
    const [wH, wM] = wakeStr.split(":").map(Number);

    let wakeUpAnchor = localDay.hour(wH).minute(wM).second(0);
    if (!wakeUpAnchor.isValid()) {
      wakeUpAnchor = localDay.hour(6).minute(45).second(0);
    }

    // --------------------------------------------------
    // 2️⃣ FIXED OFFSETS FROM WAKE (MINUTES)
    // --------------------------------------------------
    const OFFSETS = {
      TOBACCO: 10,
      CALORIE: 15,
      FITNESS_DEFAULT: 30,
      BREAKFAST: 105,          // 1h 45m
      MID_MORNING: 255,        // BF + 2h 30m
      LUNCH: 390,              // 6h 30m
      NAP: 450,                // Lunch + 1h
      EVENING_SNACK: 570,      // Lunch + 3h
      DINNER: 780,             // Lunch + 6h 30m
      AFTER_DINNER_WALK: 810,  // Dinner + 30m
      SLEEP: 960               // 16h
    };

    // --------------------------------------------------
    // 3️⃣ FITNESS TIME (PREFERRED OR DEFAULT)
    // --------------------------------------------------
    let fitnessTime;
    const preferredEx = onboarding?.o5Data?.preferred_ex_time;

    if (preferredEx) {
      const ex24 = convertTo24Hour(preferredEx);
      fitnessTime = dayjs.tz(
        `${localDay.format("YYYY-MM-DD")} ${ex24}`,
        "YYYY-MM-DD HH:mm",
        TZ
      );
    } else {
      fitnessTime = addMinutes(wakeUpAnchor, OFFSETS.FITNESS_DEFAULT);
    }

    // --------------------------------------------------
    // 4️⃣ SMOKER CHECK
    // --------------------------------------------------
    const isSmoker =
      onboarding?.o4Data?.smoking?.trim().toLowerCase() === "daily" ||
      onboarding?.o4Data?.smoking?.trim().toLowerCase() === "occasionally";

    if (!isSmoker) {
      await TimelineCard.deleteMany({
        userId,
        type: "SYSTEM",
        title: /tobacco|health win/i
      });
    }

    // --------------------------------------------------
    // 5️⃣ SYSTEM CARDS (STRICT ORDER, WAKE-BASED)
    // --------------------------------------------------
    const systemCards = [
      {
        key: "SYSTEM_WAKEUP",
        title: "Wake Up",
        time: wakeUpAnchor,
        desc: "Ease into your day with Morning Calm"
      },

      ...(isSmoker
        ? [
            {
              key: "SYSTEM_TOBACCO",
              title: "Your Daily Health Win",
              time: addMinutes(wakeUpAnchor, OFFSETS.TOBACCO),
              desc: "Skip the smoke, feel the difference"
            }
          ]
        : []),

      {
        key: "SYSTEM_CALORIE",
        title: "Calorie Ignite",
        time: addMinutes(wakeUpAnchor, OFFSETS.CALORIE),
        desc: "Jumpstart your metabolism"
      },

      {
        key: "SYSTEM_FITNESS",
        title: "Fitness",
        time: fitnessTime,
        desc: "Cardio & strength training"
      },

      {
        key: "SYSTEM_BREAKFAST",
        title: "Breakfast",
        time: addMinutes(wakeUpAnchor, OFFSETS.BREAKFAST),
        desc: "Boost your energy"
      },

      {
        key: "SYSTEM_MID_MORNING",
        title: "Mid-Morning Boost",
        time: addMinutes(wakeUpAnchor, OFFSETS.MID_MORNING),
        desc: "A handful of fruit"
      },

      {
        key: "SYSTEM_LUNCH",
        title: "Lunch",
        time: addMinutes(wakeUpAnchor, OFFSETS.LUNCH),
        desc: "Re-energize yourself"
      },

      {
        key: "SYSTEM_NAP",
        title: "Short Nap or Walk",
        time: addMinutes(wakeUpAnchor, OFFSETS.NAP),
        desc: "Defeat the midday slump"
      },

      {
        key: "SYSTEM_EVENING",
        title: "Refresh & Refuel",
        time: addMinutes(wakeUpAnchor, OFFSETS.EVENING_SNACK),
        desc: "Evening snacks"
      },

      {
        key: "SYSTEM_DINNER",
        title: "Dinner",
        time: addMinutes(wakeUpAnchor, OFFSETS.DINNER),
        desc: "Balanced and light"
      },

      {
        key: "SYSTEM_AFTER_DINNER",
        title: "After-Dinner Walk",
        time: addMinutes(wakeUpAnchor, OFFSETS.AFTER_DINNER_WALK),
        desc: "10–15 min walk"
      },

      {
        key: "SYSTEM_SLEEP",
        title: "Sleep",
        time: addMinutes(wakeUpAnchor, OFFSETS.SLEEP),
        desc: "Unwind gently with Restful Night"
      }
    ];

    // --------------------------------------------------
    // 6️⃣ UPSERT SYSTEM CARDS
    // --------------------------------------------------
    for (const card of systemCards) {
    await TimelineCard.updateOne(
  { userId, scheduleDate, systemKey: card.key },
  {
    $set: {
      scheduledTime: card.time.format("HH:mm"),
      title: card.title,
      description: card.desc,
      type: "SYSTEM"
    },
    $setOnInsert: {
      userId,
      scheduleDate,
      isCompleted: false,
      isMissed: false,
      systemKey: card.key
    }
  },
  { upsert: true }
);

    }

    console.log(
      `✅ System cards ensured (wake-anchored) for ${userId} on ${localDay.format(
        "YYYY-MM-DD"
      )}`
    );
  } catch (err) {
    console.error("❌ Error ensuring system cards:", err);
  }
}

module.exports = { ensureSystemCardsExist };
