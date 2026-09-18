const orders = require("../models/order");

// This route is protected by the auth_super_admin middleware
// (routes/get_all_orders.router.js), which already verifies the JWT
// and checks the requesting user's role before this controller ever
// runs - no need to re-verify anything here.

const get_all_orders = async (req, res) => {
    try {

        // ==============================
        // Pagination
        // ==============================

        const limit = Math.min(
            parseInt(req.query.limit) || 10,
            50
        );

        const page = Math.max(
            parseInt(req.query.page) || 1,
            1
        );

        const skip = (page - 1) * limit;

        // ==============================
        // Get Orders
        // ==============================

        // .lean(): nothing here calls any Mongoose document method on
        // the results, only serializes them to JSON.
        const all_orders = await orders
            .find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();


        const totalOrders = await orders.estimatedDocumentCount();

        const totalPages = Math.ceil(
            totalOrders / limit
        );

        // ==============================
        // No Orders
        // ==============================

        if (all_orders.length === 0) {
            return res.status(200).json({
                success: true,
                message: "Orders were not found",
                data: [],
                pagination: {
                    page,
                    limit,
                    totalOrders,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            });
        }

        // ==============================
        // Response
        // ==============================

        return res.status(200).json({
            success: true,
            message: "successfully",
            data: all_orders,
            pagination: {
                page,
                limit,
                totalOrders,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        });

    } catch (e) {

        console.log(e.message);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: e.message
        });
    }
};

module.exports = get_all_orders;