require("dotenv").config();

const problems = require("../models/problem");
const cache = require("../utils/cache");

const MAX_PROBLEM_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 500;

const add_problem = async (req, res) => {
    try {
        // FIX: this route runs behind the auth middleware, which already
        // verifies the JWT and loads a fresh copy of the user (with
        // _id, name, etc.) into req.user. Re-verifying the token here
        // and pulling "id"/"name" out of the raw JWT payload was
        // redundant work, and worse, it trusted stale data: the JWT
        // payload only reflects what was true at login time, so if the
        // user's name changed afterwards, decoded.name would still
        // save the old name on the problem report. req.user.name is
        // fetched fresh from the DB on every request by the middleware,
        // so it's always current.
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated",
                data: []
            });
        }

        // problem data

        const problem = req.body.problem?.trim();

        const user_id = req.user._id;
        const user_name = req.user.name;

        const image = req.body.image?.trim();

        const phone_number = req.body.phone_number?.trim();

        const whatsApp_number = req.body.whatsApp_number?.trim();

        const GPS_URL = req.body.GPS_URL?.trim();

        const order_number = req.body.order_number?.trim();

        if (!problem || !phone_number || !whatsApp_number || !GPS_URL) {
            return res.status(400).json({
                success: false,
                message: "problem, phone_number, whatsApp_number and GPS_URL are required",
                data: []
            });
        }

        if (problem.length > MAX_PROBLEM_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `problem must be at most ${MAX_PROBLEM_LENGTH} characters`,
                data: []
            });
        }

        if (image && image.length > MAX_IMAGE_URL_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `image must be at most ${MAX_IMAGE_URL_LENGTH} characters`,
                data: []
            });
        }

        const new_problem = new problems({
            problem,
            user_id,
            user_name,
            phone_number,
            whatsApp_number,
            GPS_URL,
            order_number,
            image,
        });

        await new_problem.save();

        // Socket event
        // PERF: emit right after save, before awaiting the cache clear
        // below - the live notification doesn't depend on the cache
        // being invalidated, so firing it first means admin dashboards
        // see the new problem immediately instead of waiting behind
        // that call.
        if (req.io) {
            req.io.to("admins").emit("new_problem", {
                problem: new_problem
            });
        }

        await cache.delByPrefix("problems");

        // Response
        return res.status(201).json({
            success: true,
            message: "add successfully",
            data: new_problem
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

module.exports = add_problem;