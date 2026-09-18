const express = require("express");
const rateLimit = require("express-rate-limit");

const ai_assistant = require("../controller/ai_assistant.controller");
const config = require("../config/ai_assistant.config");

const router = express.Router();


const aiAssistantRateLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests in a short period. Please try again in a little while.",
        data: [],
    },
});


router.post("/api/ai_assistant", aiAssistantRateLimiter, ai_assistant);

module.exports = router;