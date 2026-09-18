require("dotenv").config();

const sections = require("../models/section");
const cache = require("../utils/cache");

const get_all_sections = async (req, res) => {
    try {

        // Check Cache
        const cachedSections = await cache.get("sections");

        if (cachedSections) {
            console.log("Sections from CACHE");

            return res.status(200).json({
                success: true,
                message: "successfully",
                data: cachedSections
            });
        }

        // Get sections from MongoDB
        // .lean(): nothing here calls any Mongoose document method on
        // the results, only caches and serializes them to JSON.
        const all_sections = await sections.find().lean();

        // No sections found — an empty collection is a normal state
        // (e.g. a brand new store that hasn't created any sections
        // yet), not an error. This matches get_products.controller.js,
        // which already treats "zero results" as a normal 200
        // response with an empty array, instead of the 404 this used
        // to return (which callers already swallowed, but which
        // filled the console/Network tab with a false-alarm error on
        // every page load for a store with zero sections).
        if (all_sections.length === 0) {
            return res.status(200).json({
                success: true,
                message: "no sections found",
                data: []
            });
        }

        // Save sections in Cache
        await cache.set("sections", all_sections);

        console.log("Sections from DATABASE");

        return res.status(200).json({
            success: true,
            message: "successfully",
            data: all_sections
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

module.exports = get_all_sections;