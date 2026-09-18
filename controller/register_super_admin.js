const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const users = require("../models/users");
const { COOKIE_OPTIONS, COOKIE_MAX_AGE_MS } = require("../config/cookie");

// bcrypt cost factor. Each +1 roughly doubles the CPU time of every
// hash/compare. 12 is very safe but noticeably heavier under high
// concurrent signup load; 10 is still well above OWASP's minimum
// recommendation (>=10) and meaningfully faster per request. Bump this
// back up if signup volume is low and you'd rather trade a bit of
// throughput for extra margin.
const BCRYPT_COST = 10;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// No upper bound on password length lets someone send a multi-MB
// "password" that still gets hashed before being rejected - bcrypt
// only uses the first 72 bytes internally, so anything beyond that
// costs CPU/memory for zero security benefit. Capping it here rejects
// that before it ever reaches bcrypt.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const register_super_admin = async (req, res) => {
    try {
        // ==============================
        // 1. Get data from request
        // ==============================

        const user_name = req.body.name?.trim();

        const email = req.body.email?.trim().toLowerCase();

        const password = req.body.password;


        // ==============================
        // 2. Validate required data
        // ==============================

        if (
            !user_name ||
            !email ||
            !password ||
            password.length < MIN_PASSWORD_LENGTH ||
            password.length > MAX_PASSWORD_LENGTH
        ) {
            return res.status(400).json({
                success: false,
                message: `Name, email are required and password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`
            });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address"
            });
        }


        // ==============================
        // 3. Make sure no super_admin already exists
        // ==============================
        // NOTE: like the email-uniqueness check below, this is a fast
        // early exit for the common case - it can't fully prevent a
        // race between two concurrent requests both hitting this route
        // before either saves. The real guarantee should be a partial
        // unique index on { role: 1 } (unique: true,
        // partialFilterExpression: { role: "super_admin" }) in the
        // users schema, so the database itself rejects a second
        // super_admin even if this check is raced.

        const existing_super_admin = await users.findOne({
            role: "super_admin"
        }).select("_id").lean();

        if (existing_super_admin) {
            return res.status(400).json({
                success: false,
                message: "A super admin already exists, you cannot register another one"
            });
        }

        const find_user = await users.findOne({
            email: email
        }).select("_id").lean();

        if (find_user) {
            return res.status(400).json({
                success: false,
                message: "This email address is already in use"
            });
        }


        // ==============================
        // 4. Hash password
        // ==============================

        const passwordHash = await bcrypt.hash(password, BCRYPT_COST);


        // ==============================
        // 5. Create user
        // ==============================

        const new_user = new users({
            name: user_name,

            email: email,

            password: passwordHash,

            role: "super_admin",
        });


        // ==============================
        // 6. Save user
        // ==============================

        try {
            await new_user.save();
        } catch (saveError) {
            // Duplicate key: either the email or (if a partial unique
            // index on role:"super_admin" exists) the role check above
            // got raced by another concurrent request. Report it the
            // same friendly way instead of a generic 500.
            if (saveError.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: "Registration failed: email already in use or a super admin already exists"
                });
            }

            throw saveError;
        }


        // ==============================
        // 7. Create JWT
        // ==============================

        const token = jwt.sign(
            {
                id: new_user._id,
                name: new_user.name,
                role: new_user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "30d"
            }
        );


        // ==============================
        // 8. Save token in cookie
        // ==============================

        // FIX: was hardcoding httpOnly/secure/sameSite here, separately
        // from log_in.controller.js and log_out.controller.js. Now uses
        // the same shared COOKIE_OPTIONS as every other place that
        // sets or clears the "token" cookie, so log_out's
        // clearCookie() is guaranteed to match regardless of which
        // endpoint originally set the cookie.
        res.cookie("token", token, {
            ...COOKIE_OPTIONS,
            maxAge: COOKIE_MAX_AGE_MS
        });


        // ==============================
        // 9. Response
        // ==============================

        return res.status(201).json({
            success: true,
            message: "Registration successful"
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
module.exports = register_super_admin