require("dotenv").config();
const products = require("../models/products");
const mongoose = require("mongoose");

const get_product_reviews = async (req, res) => {
    try {
        // GET requests should not rely on a request body (many clients,
        // including browsers' fetch with default settings and some proxies,
        // strip or reject bodies on GET). Read product_id from the query
        // string primarily, falling back to body for backward compatibility.
        const product_id = req.query.product_id || req.body.product_id;

        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: "product_id is required",
                data: []
            })
        }

        // FIX: an invalid ObjectId (e.g. a malformed string) made
        // Mongoose throw a CastError inside findOne(), which fell
        // through to the generic catch block below and came back as a
        // 500 "Internal server error" instead of a proper 400.
        if (!mongoose.Types.ObjectId.isValid(product_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product_id",
                data: []
            })
        }

        // FIX: only the `reviews` field is ever used below, but the
        // query was fetching the entire product document (name, price,
        // description, images, etc.) and hydrating it as a full
        // Mongoose document. .select("reviews") narrows what's
        // transferred from MongoDB, and .lean() skips the hydration
        // cost - nothing here calls any Mongoose document method on
        // the result.
        const product = await products
            .findOne({ _id: product_id })
            .select("reviews")
            .lean();

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "product not found",
                data: []
            })
        }

        return res.status(200).json({
            success: true,
            message: "reviews retrieved successfully",
            data: product.reviews
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

module.exports = get_product_reviews