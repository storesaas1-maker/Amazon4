const problems = require("../models/problem");
const cache = require("../utils/cache");

const get_problems = async (req, res) => {
    try {
        const limit = Math.min(
            parseInt(req.query.limit) || 10,
            50
        );

        const page = Math.max(
            parseInt(req.query.page) || 1,
            1
        );

        const skip = (page - 1) * limit;

        const cacheKey = `problems:page=${page}:limit=${limit}`;

        // Check Cache
        const cachedProblems = await cache.get(cacheKey);

        if (cachedProblems) {

            console.log("Problem from CACHE");

            return res.status(200).json({
                success: true,
                message: "get Problem successfully",
                data: cachedProblems.data,
                pagination: cachedProblems.pagination
            });
        }

        // FIX: removed .populate("section", "name") — the problem schema
        // has no "section" field (that only exists on the product
        // schema), so this call was throwing a strictPopulate error on
        // every single request.
        const all_problems = await problems
            .find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // FIX (same root cause identified in get_products.controller.js
        // under load testing): countDocuments() with no filter still runs
        // a real query MongoDB has to execute, not a cheap metadata
        // lookup - expensive under concurrent load on top of the find()
        // above. estimatedDocumentCount() reads the collection's stored
        // count from MongoDB metadata directly instead, so it's
        // effectively instant regardless of load. Safe here because
        // there is no filter on the query - the "estimated" count and
        // the true count are exactly the same in that case.
        const totalProblems = await problems.estimatedDocumentCount();

        const totalPages = Math.ceil(totalProblems / limit);

        if (all_problems.length === 0) {

            return res.status(200).json({
                success: true,
                message: "not found",
                data: [],
                pagination: {
                    page,
                    limit,
                    totalProblems,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            });
        }

        // FIX: was "all_problem" (typo, undefined variable) — always
        // threw a ReferenceError right after the populate error above.
        const responseData = {
            data: all_problems,
            pagination: {
                page,
                limit,
                totalProblems,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        };

        await cache.set(cacheKey, responseData);

        console.log("Problems from DATABASE");

        return res.status(200).json({
            success: true,
            message: "get problems successfully",
            data: all_problems,
            pagination: responseData.pagination
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

module.exports = get_problems