const products = require("../models/products");
const mongoose = require("mongoose");
const cache = require("../utils/cache");

// This route MUST be protected by the auth_super_admin middleware at
// the router level, e.g.:
//   router.delete("/api/admin/delete_product", auth_super_admin, DEL_product);
// Without it, ANY logged-in user (not just admins) could delete any
// product - deletion is a destructive action and must be restricted
// to super_admin, exactly like update_product.controller.js already
// is.

const DEL_product = async (req, res) => {
    try {
        const product_id = req.body.product_id;

        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: "product id is required",
                data: []
            })
        }

        // FIX: an invalid ObjectId made findByIdAndDelete() throw a
        // CastError, which fell through to the generic catch block
        // below and came back as a 500 "Internal server error"
        // instead of a proper 400.
        if (!mongoose.Types.ObjectId.isValid(product_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product id",
                data: []
            })
        }

        const deleted_product = await products.findByIdAndDelete(product_id);

        if (!deleted_product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
                data: []
            });
        }
        await cache.delByPrefix("products:");
        req.io.to("users").emit("deleted_product", {
            deleted_product: deleted_product
        });
        return res.status(200).json({
            success: true,
            message: "Product deleted successfully",
            data: []
        });
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

module.exports = DEL_product