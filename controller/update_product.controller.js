const jwt = require("jsonwebtoken");
require("dotenv").config();

const products = require("../models/products");
const mongoose = require("mongoose");
const cache = require("../utils/cache");

const update_product = async (req, res) => {
    try {
        if (!req.cookies || !req.cookies.token) {
            return res.status(401).json({
                success: false,
                message: "Authentication token is missing",
                data: []
            });
        }

        const token = jwt.verify(
            req.cookies.token,
            process.env.JWT_SECRET
        );

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "invalid token",
                data: []
            });
        }

        const product_id = req.body.product_id;
        const product_name = req.body.product_name;
        const product_description = req.body.product_description;
        const product_discount = Number(req.body.product_discount || 0);
        const product_price = Number(req.body.product_price);
        const quantity = Number(req.body.quantity);
        const product_section = req.body.section;

        let images = [];
        if (Array.isArray(req.body.images)) {
            images = req.body.images.filter((img) => typeof img === "string" && img.trim() !== "");
        } else if (typeof req.body.images === "string" && req.body.images.trim()) {
            images = [req.body.images.trim()];
        } else if (typeof req.body.image === "string" && req.body.image.trim()) {
            images = [req.body.image.trim()];
        }

        if (
            !product_id ||
            !product_name ||
            !product_description ||
            isNaN(product_discount) ||
            isNaN(product_price) ||
            images.length === 0 ||
            !product_section ||
            isNaN(quantity) ||
            quantity < 0
        ) {
            return res.status(400).json({
                success: false,
                message: "quantity, product id, product name, product description, product discount, product price, at least one image and section are required",
                data: []
            });
        }

        if (!mongoose.Types.ObjectId.isValid(product_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product id",
                data: []
            });
        }

        if (!mongoose.Types.ObjectId.isValid(product_section)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section id",
                data: []
            });
        }

        const final_price = product_price * (1 - product_discount / 100);

        const updated_product = await products.findOneAndUpdate(
            { _id: product_id },
            {
                name: product_name,
                description: product_description,
                price: product_price,
                discount: product_discount,
                final_price: final_price,
                images: images,
                quantity: quantity,
                section: product_section
            },
            { new: true }
        );

        if (!updated_product) {
            return res.status(404).json({
                success: false,
                message: "product not found",
                data: []
            });
        }

        await cache.delByPrefix("products:");

        if (req.io) {
            req.io.to("users").emit("update_product", {
                update_product: updated_product
            });
        }

        return res.status(200).json({
            success: true,
            message: "updated successfully",
            data: updated_product
        });

    } catch (e) {
        console.error("Update product error:", e.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: e.message
        });
    }
};
module.exports = update_product