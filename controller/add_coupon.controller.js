require("dotenv").config();
const coupons = require("../models/coupon");

const add_coupon = async (req, res) => {
  try {

    /*
     * =========================================
     * Check authentication
     * =========================================
     */

    // FIX: this route runs behind the auth_super_admin middleware,
    // which already verifies the JWT, loads the user, checks the role,
    // and sets req.user. Re-verifying the token here with jwt.verify()
    // was redundant work on every request — and the decoded result
    // wasn't even used for anything afterwards. We trust req.user now,
    // same as every other admin route.
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: []
      });
    }

    /*
     * =========================================
     * Get data
     * =========================================
     */

    const coupon_name = req.body.coupon_name?.trim();

    const end_time = req.body.end_time?.trim();

    const discount = Number(req.body.discount);

    /*
     * =========================================
     * Validation
     * =========================================
     */

    if (
      !coupon_name ||
      !end_time ||
      !Number.isFinite(discount)
    ) {
      return res.status(400).json({
        success: false,
        message: "coupon_name, end_time and discount are required",
        data: []
      });
    }

    /*
     * Validate discount
     */

    if (
      discount < 0 ||
      discount > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Discount must be between 0 and 100",
        data: []
      });
    }

    /*
     * Validate date
     */

    const couponDate = new Date(end_time);

    if (
      Number.isNaN(couponDate.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid end_time",
        data: []
      });
    }

    /*
     * Coupon date must be in future
     */

    if (
      couponDate.getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Coupon expiration date must be in the future",
        data: []
      });
    }

    /*
     * =========================================
     * Check duplicate coupon
     * =========================================
     */

    const existingCoupon =
      await coupons.findOne({
        name: coupon_name
      });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: "Coupon already exists",
        data: []
      });
    }

    /*
     * =========================================
     * Create coupon
     * =========================================
     */

    const new_coupon = new coupons({
      name: coupon_name,
      discount: discount,
      end_time: end_time
    });

    await new_coupon.save();

    /*
     * Socket event
     */

    // FIX: guard against req.io being undefined so a successful save
    // can't be turned into a false 500 error.
    if (req.io) {
      req.io.to("users").emit("new_coupon", {
        coupon: new_coupon
      });
    }

    /*
     * Response
     */

    return res.status(201).json({
      success: true,
      message: "Coupon added successfully",
      data: new_coupon
    });

  } catch (e) {
    console.log(e);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: e.message
    });
  }
};

module.exports = add_coupon;