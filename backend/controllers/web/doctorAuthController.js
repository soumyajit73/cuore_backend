const Doctor = require('../../models/Doctor');
const OtpRequest = require('../../models/otp'); // Using your existing model
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Built-in Node.js module to create a unique ID

// Helper function to create a JSON Web Token (JWT)
const generateToken = (id) => {
    return jwt.sign({ id, type: 'doctor' }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '30d',
    });
};

/**
 * @desc    Step 1 of Registration: Send OTP & save user data
 * @route   POST /api/web/auth/send-registration-otp
 * @access  Public
 */
exports.sendRegistrationOtp = async (req, res) => {
    const { displayName, mobileNumber, address, fees, password, accountManagerCode } = req.body;

    try {
        // 1. Check if a doctor is already registered with this number
        const doctorExists = await Doctor.findOne({ mobileNumber });
        if (doctorExists) {
            return res.status(400).json({ error: 'A doctor with this mobile number already exists.' });
        }

        // 2. Generate a 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const otpHash = await bcrypt.hash(otp, 10); // Hash the OTP
        const requestId = crypto.randomBytes(16).toString('hex'); // Create a unique request ID

        // 3. Store all the registration data temporarily in your OtpRequest model
        await OtpRequest.create({
            request_id: requestId,
            phone: mobileNumber, // Assuming your model uses 'phone'
            otpHash: otpHash,
            userData: {
                displayName,
                mobileNumber,
                address,
                fees,
                password, // Temporarily store the plain password
                accountManagerCode
            }
            // 'expiresAt' will be set by default from your model
        });

        // 4. --- TODO: Send the *real* OTP via your SMS service ---
        console.log(`Sending REGISTRATION OTP to ${mobileNumber}: ${otp}`); // For testing

        // 5. Send the 'request_id' back to the frontend
        res.status(200).json({
            message: 'OTP sent successfully. Please verify to register.',
            requestId: requestId,
            
            // --- ✅ ADDED FOR TESTING ---
            // This sends the actual OTP in the response.
            // WARNING: REMOVE THIS LINE IN PRODUCTION.
            test_otp: otp
            // --- END OF ADDITION ---
        });

    } catch (error) {
        console.error("Error in sendRegistrationOtp:", error);
        res.status(500).json({ error: 'Server error sending OTP.' });
    }
};


/**
 * @desc    Step 2 of Registration: Verify OTP & create account
 * @route   POST /api/web/auth/register
 * @access  Public
 */
exports.registerDoctor = async (req, res) => {
    const { requestId, otp } = req.body;

    try {
        // 1. Find the temporary OTP request
        const otpRequest = await OtpRequest.findOne({ request_id: requestId });

        // Check if request exists or has expired
        if (!otpRequest) {
            return res.status(400).json({ error: 'Invalid or expired OTP request. Please try again.' });
        }

        // 2. Verify the OTP
        const isMatch = await bcrypt.compare(otp, otpRequest.otpHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid OTP.' });
        }

        // 3. OTP is valid! Get the stored user data.
        const { displayName, mobileNumber, address, fees, password, accountManagerCode } = otpRequest.userData;

        // 4. --- Generate a unique Doctor Code ---
        const namePart = displayName.substring(0, 4).toUpperCase().replace(/\s/g, '');
        const numPart = Math.floor(100 + Math.random() * 900); // 100-999
        const doctorCode = `DOC-${namePart}${numPart}`;
        // (In production, you'd add a loop to ensure this is 100% unique)

        // 5. Create the new doctor in the main Doctor collection
        const doctor = await Doctor.create({
            displayName,
            mobileNumber,
            address,
            fees,
            password, // The 'pre-save' hook in your Doctor model will hash this
            accountManagerCode,
            doctorCode
        });

        // 6. Delete the temporary OTP request
        await OtpRequest.deleteOne({ _id: otpRequest._id });

        // 7. Generate a token to log them in
        const token = generateToken(doctor._id);

        res.status(201).json({
            message: 'Doctor registered successfully',
            token,
            doctor: {
                _id: doctor._id,
                displayName: doctor.displayName,
                doctorCode: doctor.doctorCode
            }
        });

    } catch (error) {
        console.error("Error in registerDoctor:", error);
        res.status(500).json({ error: 'Server error during registration.' });
    }
};

/**
 * @desc    Login doctor with mobile and password
 * @route   POST /api/web/auth/login-password
 * @access  Public
 */
exports.loginWithPassword = async (req, res) => {
    const { mobileNumber, password } = req.body;
    try {
        if (!mobileNumber || !password) {
            return res.status(400).json({ error: 'Please provide mobile number and password.' });
        }
        const doctor = await Doctor.findOne({ mobileNumber }).select('+password');
        if (!doctor || !(await doctor.comparePassword(password))) {
            return res.status(401).json({ error: 'Invalid mobile number or password' });
        }
        const token = generateToken(doctor._id);
        res.status(200).json({
            message: 'Login successful',
            token,
            doctor: { _id: doctor._id, displayName: doctor.displayName, doctorCode: doctor.doctorCode }
        });
    } catch (error) {
        console.error("Error in loginWithPassword:", error);
        res.status(500).json({ error: 'Server error during login.' });
    }
};

/**
 * @desc    Send OTP for an EXISTING doctor to log in
 * @route   POST /api/web/auth/send-login-otp
 * @access  Public
 */
exports.sendLoginOtp = async (req, res) => {
    const { mobileNumber } = req.body;
    try {
        // 1. Find the doctor
        const doctor = await Doctor.findOne({ mobileNumber });
        if (!doctor) {
            return res.status(404).json({ error: 'No doctor found with this mobile number.' });
        }
        
        // 2. Generate OTP and hash it
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        
        // 3. Save the OTP and expiry *directly to the Doctor model*
        doctor.otp = otpHash;
        doctor.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
        await doctor.save();
        
        // 4. --- TODO: Send the *real* OTP via your SMS service ---
        console.log(`Sending LOGIN OTP to ${mobileNumber}: ${otp}`); // For testing
        
        res.status(200).json({
            message: 'Login OTP sent successfully.',

            // --- ✅ ADDED FOR TESTING ---
            // WARNING: REMOVE THIS LINE IN PRODUCTION.
            test_otp: otp
            // --- END OF ADDITION ---
        });

    } catch (error) {
        console.error("Error in sendLoginOtp:", error);
        res.status(500).json({ error: 'Server error sending login OTP.' });
    }
};

/**
 * @desc    Verify OTP for login
 * @route   POST /api/web/auth/verify-login-otp
 * @access  Public
 */
exports.verifyLoginOtp = async (req, res) => {
    const { mobileNumber, otp } = req.body;
    try {
        // 1. Find the doctor
        const doctor = await Doctor.findOne({ mobileNumber });
        if (!doctor) {
            return res.status(404).json({ error: 'Doctor not found.' });
        }

        // 2. Check for OTP, expiry, and match
        if (!doctor.otp || doctor.otpExpires < Date.now()) {
            return res.status(400).json({ error: 'OTP is invalid or has expired.' });
        }
        
        const isMatch = await bcrypt.compare(otp, doctor.otp);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid OTP.' });
        }

        // 3. OTP is valid! Clear the OTP fields
        doctor.otp = undefined;
        doctor.otpExpires = undefined;
        await doctor.save();
        
        // 4. Create and send token
        const token = generateToken(doctor._id);
        res.status(200).json({
            message: 'Login successful',
            token,
            doctor: { _id: doctor._id, displayName: doctor.displayName, doctorCode: doctor.doctorCode }
        });
    } catch (error) {
        console.error("Error in verifyLoginOtp:", error);
        res.status(500).json({ error: 'Server error verifying OTP.' });
    }
};