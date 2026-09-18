const jwt = require("jsonwebtoken");
require("dotenv").config();
const mongoose = require("mongoose");
const products = require("../models/products");
const cache = require("../utils/cache");

const MAX_REVIEW_LENGTH = 1000;

const post_review = async (req, res) => {
    try {
        if (!req.cookies || !req.cookies.token) {
            return res.status(401).json({
                success: false,
                message: "Authentication token is missing",
                data: []
            });
        }


        let decoded;

        try {
            decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token",
                data: []
            });
        }

        const product_id = req.body.product_id;
        const review_text = req.body.review_text?.trim();


        const ratingInput = Number(req.body.rating);

        if (!Number.isFinite(ratingInput) || ratingInput < 1 || ratingInput > 5) {
            return res.status(400).json({
                success: false,
                message: "rating is required and must be a number between 1 and 5",
                data: []
            });
        }

        const rating = Math.round(ratingInput);

        if (!product_id || !mongoose.Types.ObjectId.isValid(product_id)) {
            return res.status(400).json({
                success: false,
                message: "A valid product_id is required",
                data: []
            });
        }

        if (!review_text) {
            return res.status(400).json({
                success: false,
                message: "review_text is required",
                data: []
            });
        }

        if (review_text.length > MAX_REVIEW_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `review_text must be at most ${MAX_REVIEW_LENGTH} characters`,
                data: []
            });
        }

        const newReview = {
            _id: new mongoose.Types.ObjectId(),
            user_id: decoded.id,
            user_name: decoded.name,
            content: review_text,
            rating: rating,
            created_at: new Date()
        };

        const updateResult = await products.updateOne(
            { _id: product_id },
            { $push: { reviews: newReview } }
        );

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "not found",
                data: []
            });
        }
        req.io.to("users").emit("new_review", {
            product_id: product_id,
            review: newReview
        });

        await cache.delByPrefix("products");

        return res.status(201).json({
            success: true,
            message: "review added successfully",
            data: [newReview]
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
module.exports = post_review