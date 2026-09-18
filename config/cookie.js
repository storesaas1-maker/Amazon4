
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
};

// maxAge only applies when SETTING the cookie (log_in/register/
// register_super_admin) - clearCookie() should NOT receive maxAge, so
// it's kept separate rather than merged into COOKIE_OPTIONS.
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

module.exports = { COOKIE_OPTIONS, COOKIE_MAX_AGE_MS };