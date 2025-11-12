// This is a hardcoded data array that matches your UI screenshot.
// We will replace this with real database logic later.
const hardcodedPatientData = [
  {
    _id: "67890abcde001",
    sobAlert: true, // For the red dot
    name: "John Smith",
    phone: "9876543210",
    sbp: 140,
    dbp: 90,
    hr: 88,
    fbs: 126,
    bspp: 180,
    a1c: 7.6,
    hscrp: 3.2,
    tghdl: 4.2,
    lifestyle: 65,
    status: "26 May 24",
    statusType: "date",
  },
  {
    _id: "67890abcde002",
    sobAlert: true, // For the red dot
    name: "M. Johnson",
    phone: "9876543210",
    sbp: 120,
    dbp: 80,
    hr: 88,
    fbs: 138,
    bspp: 190,
    a1c: 7.8,
    hscrp: 2.1,
    tghdl: 3.8,
    lifestyle: 82,
    status: "23 Feb 25",
    statusType: "date",
  },
  {
    _id: "67890abcde003",
    sobAlert: false,
    name: "John Smith",
    phone: "9876543210",
    sbp: 140,
    dbp: 90,
    hr: 88,
    fbs: 126,
    bspp: 180,
    a1c: 7.6,
    hscrp: 3.2,
    tghdl: 4.2,
    lifestyle: 65,
    status: "Accept",
    statusType: "accept", // For the orange button
  },
  {
    _id: "67890abcde004",
    sobAlert: false,
    name: "M. Johnson",
    phone: "9876543210",
    sbp: 120,
    dbp: 80,
    hr: 88,
    fbs: 138,
    bspp: 190,
    a1c: 7.8,
    hscrp: 2.1,
    tghdl: 3.8,
    lifestyle: 82,
    status: "26 May 24",
    statusType: "date",
  },
  {
    _id: "67890abcde005",
    sobAlert: false,
    name: "M. Johnson",
    phone: "9876543210",
    sbp: 120,
    dbp: 80,
    hr: 88,
    fbs: 138,
    bspp: 190,
    a1c: 7.8,
    hscrp: 2.1,
    tghdl: 3.8,
    lifestyle: 82,
    status: "Renewal",
    statusType: "renewal", // For the red text
  },
    {
    _id: "67890abcde006",
    sobAlert: false,
    name: "Mary Johnson",
    phone: "9876543210",
    sbp: 120,
    dbp: 80,
    hr: 88,
    fbs: 138,
    bspp: 190,
    a1c: 7.8,
    hscrp: 2.1,
    tghdl: 3.8,
    lifestyle: 82,
    status: "Inactive",
    statusType: "inactive", // For the greyed-out text
  },
];


/**
 * @desc    Get the list of patients for the logged-in doctor
 * @route   GET /api/web/dashboard/patients
 * @access  Private (Doctor only)
 */
exports.getPatientList = async (req, res) => {
  try {
    // req.doctor is available here from the 'protect' middleware
    console.log(`Fetching patient list for Doctor: ${req.doctor.displayName}`);

    // --- THIS IS THE HARDCODED PART ---
    // Instead of querying the database for req.doctor.patients,
    // we are just returning the fake array.
    const patientList = hardcodedPatientData;

    // TODO: Later, we will replace the line above with this real logic:
    // const doctor = await Doctor.findById(req.doctor._id).populate('patients');
    // const patientList = doctor.patients.map(patient => {
    //   // ... logic to build the flat object from patient data
    // });
    
    // Sort by SOB/Chest Discomfort alert first, as per your doc
    patientList.sort((a, b) => (b.sobAlert ? 1 : 0) - (a.sobAlert ? 1 : 0));

    res.status(200).json({
      count: patientList.length,
      patients: patientList,
    });

  } catch (error) {
    console.error("Error in getPatientList:", error);
    res.status(500).json({ error: "Server error fetching patient list." });
  }
};