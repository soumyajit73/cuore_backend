const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Doctor = require("../models/Doctor");
const User = require("../models/User");

exports.createOrder = async (req, res) => {
  try {
    const {
      doctorCode,
      name,
      phone,
      city,
      state,
      email,
      amount,
      currency,
      receipt,
    } = req.body;

    // 1️⃣ Validate required fields
    if (!phone || !amount || !currency) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 2️⃣ Validate doctor code (if provided)
    let doctor = null;
    if (doctorCode) {
      doctor = await Doctor.findOne({ doctorCode });
      if (!doctor) {
        return res.status(400).json({ message: "Invalid doctor code" });
      }
    }

    // 3️⃣ Create Razorpay order
    const options = {
      amount: amount * 100, // ₹ → paise
      currency,
      receipt,
      notes: {
        phone,
        doctorId: doctor ? doctor._id.toString() : null,
        name,
        email,
        city,
        state,
      },
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Create Order Error:", error);
    return res.status(500).json({ message: "Failed to create order" });
  }
};


exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    // 1️⃣ Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    // 2️⃣ Fetch order from Razorpay (to get notes)
    const order = await razorpay.orders.fetch(razorpay_order_id);

    const {
      phone,
      name,
      email,
      city,
      state,
      doctorId,
    } = order.notes || {};

    if (!phone) {
      return res.status(400).json({ message: "Phone missing in order notes" });
    }

    // 3️⃣ Create or update user
    let user = await User.findOne({ phone });

    if (!user) {
      user = new User({
        phone,
        display_name: name || "",
        email,
        city,
        state,
        doctorId: doctorId || null,
        paymentStatus: "completed",
        paymentMeta: {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
        },
      });
    } else {
      user.paymentStatus = "completed";
      user.paymentMeta = {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      };

      // fill optional fields if missing
      if (!user.email) user.email = email;
      if (!user.city) user.city = city;
      if (!user.state) user.state = state;
      if (!user.doctorId && doctorId) user.doctorId = doctorId;
    }

    await user.save();

    // 4️⃣ Link user to doctor (optional but recommended)
    if (doctorId) {
      await Doctor.findByIdAndUpdate(
        doctorId,
        { $addToSet: { patients: user._id } }, // avoids duplicates
        { new: true }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified and user onboarded",
    });

  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({ message: "Payment verification failed" });
  }
};