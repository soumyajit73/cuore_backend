const PatientLink = require('../../models/PatientLink');

// --- ADDED IMPORTS FOR REAL DATA ---
const Doctor = require('../../models/Doctor');
const User = require('../../models/User');
const { Onboarding } = require('../../models/onboardingModel'); // Ensure this path is correct
const { calculateAllMetrics } = require('../../models/onboardingModel'); // Ensure this is exported and path is correct
// --- END OF IMPORTS ---


// --- HELPER FUNCTION ---
// This function gets all data for ONE patient and formats it for the dashboard
const formatPatientData = async (patientUser) => {
    if (!patientUser) return null;

    // 1. Find the patient's Onboarding data
    const onboardingDoc = await Onboarding.findOne({ userId: patientUser._id }).lean();
    if (!onboardingDoc) {
        // This patient has signed up but not completed onboarding
        return {
            _id: patientUser._id,
            sobAlert: false,
            name: patientUser.display_name,
            phone: patientUser.phone,
            sbp: null, dbp: null, hr: null, fbs: null, bspp: null, a1c: null, hscrp: null, tghdl: null, lifestyle: null,
            status: "Pending Onboarding",
            statusType: "inactive",
        };
    }

    // 2. We have onboarding data, so get biometrics
    const o7 = onboardingDoc.o7Data || {};
    const o3 = onboardingDoc.o3Data || {};
    
    // 3. Calculate metrics to get Lifestyle Score and TG/HDL
    let metrics = {};
    if (typeof calculateAllMetrics === "function") {
         metrics = calculateAllMetrics(onboardingDoc);
    } else {
        console.warn(`[formatPatientData] calculateAllMetrics function not found. Lifestyle/TGHDL may be null for user ${patientUser._id}.`);
    }
    
    // 4. Check for SOB/Chest Discomfort Alert
    const sobAlert = o3.q5 === true; // From your UI doc

    // 5. Determine Status (Simplified for now)
    // TODO: Add logic for 'Accept', 'Renewal', 'Lapsed' based on your rules
    const status = onboardingDoc.timestamp ? new Date(onboardingDoc.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : "No Date";
    const statusType = "date"; // Default

    // 6. Build the final flat object for the UI
    return {
        _id: patientUser._id,
        sobAlert: sobAlert,
        name: patientUser.display_name,
        phone: patientUser.phone,
        sbp: o7.bp_upper || null,
        dbp: o7.bp_lower || null,
        hr: o7.pulse || null,
        fbs: o7.bs_f || null,
        bspp: o7.bs_am || null,
        a1c: o7.A1C || null,
        hscrp: o7.HsCRP || null,
        tghdl: metrics?.trigHDLRatio?.current || null,
        lifestyle: metrics?.lifestyle?.score || null,
        status: status,
        statusType: statusType,
    };
};
// --- END OF HELPER FUNCTION ---


/**
 * @desc    Get the list of patients for the logged-in doctor
 * @route   GET /api/web/dashboard/patients
 * @access  Private (Doctor only)
 */
exports.getPatientList = async (req, res) => {
  try {
    // req.doctor is available here from the 'protect' middleware
    console.log(`Fetching REAL patient list for Doctor: ${req.doctor.displayName}`);

    // --- THIS IS THE NEW LOGIC ---
    
    // 1. Find the doctor and use .populate() to get all linked patient User documents
    const doctor = await Doctor.findById(req.doctor._id)
                               .populate('patients'); // 'patients' is the field in your Doctor model
    
    if (!doctor) {
        return res.status(404).json({ error: "Doctor not found." });
    }

    // 2. Now doctor.patients is an array of full User objects
    // We loop through them and fetch their onboarding data
    const patientDataPromises = doctor.patients.map(patientUser => formatPatientData(patientUser));
    const patientList = (await Promise.all(patientDataPromises)).filter(p => p !== null); // Filter out any nulls

    // 3. Sort by SOB/Chest Discomfort alert first
    patientList.sort((a, b) => (b.sobAlert ? 1 : 0) - (a.sobAlert ? 1 : 0));
    // --- END OF NEW LOGIC ---

    res.status(200).json({
      doctorInfo: {
        displayName: req.doctor.displayName,
        doctorCode: req.doctor.doctorCode
      },
      count: patientList.length,
      patients: patientList, // This is now REAL data
    });

  } catch (error) {
    console.error("Error in getPatientList:", error);
    res.status(500).json({ error: "Server error fetching patient list." });
  }
};

exports.addPatientLink = async (req, res) => {
    const { patientMobile, planDuration } = req.body;
    
    // Get the logged-in doctor's code from the middleware
    const doctorCode = req.doctor.doctorCode;

    if (!patientMobile || !patientMobile.startsWith('+')) {
        return res.status(400).json({ error: 'A valid mobile number in international format is required.' });
    }

    try {
        // Use findOneAndUpdate with "upsert"
        // This will create a new link OR update the doctor code if one already exists
        const link = await PatientLink.findOneAndUpdate(
            { patientMobile: patientMobile },
            { 
                patientMobile: patientMobile,
                doctorCode: doctorCode,
                planDuration: planDuration,
                expiresAt: new Date(Date.now() + 30*24*60*60*1000) // Reset expiry
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(201).json({
            message: 'Patient link created successfully.',
            link: link,
            // This is the "SMS" data for testing
            simulated_sms: `Patient at ${patientMobile} is now linked to ${doctorCode}. Please ask them to download the Cuore app.`
        });

    } catch (error) {
        console.error("Error creating patient link:", error);
        res.status(500).json({ error: 'Server error creating link.' });
    }
};