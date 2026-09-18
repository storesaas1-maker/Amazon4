const users = require("../models/users");
const mongoose = require("mongoose");

const update_admin_to_user = async (req, res) => {
    try {
        const user_id = req.body.user_id;

        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: "user_id is required",
                data: []
            });
        }

        if (!mongoose.Types.ObjectId.isValid(user_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user_id",
                data: []
            });
        }

        const target_user = await users.findById(user_id);

        if (!target_user) {
            return res.status(404).json({
                success: false,
                message: "user not found",
                data: []
            });
        }


        if (target_user.role === "super_admin") {
            return res.status(403).json({
                success: false,
                message: "cannot downgrade a super_admin through this endpoint",
                data: []
            });
        }

        if (target_user.role === "user") {
            return res.status(200).json({
                success: true,
                message: "user already has role 'user'",
                data: target_user
            });
        }

        const update_user = await users.findOneAndUpdate(
            { _id: user_id },
            { role: "user" },
            { new: true }
        );

        if (!update_user) {
            return res.status(404).json({
                success: false,
                message: "user not found",
                data: []
            });
        }

        req.io.to("users").emit("update_user", {
            update_user: update_user
        });

        return res.status(200).json({
            success: true,
            message: "downgrade successful",
            data: update_user
        });
    }
    catch (e) {
        console.log(e.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: e.message
        });
    }
}
module.exports = update_admin_to_user