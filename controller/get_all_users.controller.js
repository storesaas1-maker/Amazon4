const users = require("../models/users");

// This route is protected by the auth_super_admin middleware
// (routes/get_all_users.router.js), which already verifies the JWT,
// loads the requesting user, and checks their role before this
// controller ever runs - no need to re-verify anything here.

const get_all_users = async (req, res) => {
    try {
        // FIX: this used to fetch every field on every user, including
        // `password` (the bcrypt hash) - leaking password hashes to
        // the client on every call. .select("-password") excludes it
        // while keeping every other field. .lean() skips Mongoose
        // document hydration since nothing here calls any document
        // methods on the results.
        const all_users = await users.find().select("-password").lean();

        return res.status(200).json({
            success: true,
            message: "users retrieved successfully",
            data: all_users
        })
    }
    catch (e) {
        console.log(e.message)
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: e.message
        })
    }
}
module.exports = get_all_users