require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const path = require("path");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const redis = require("./config/redis");
const users = require("./models/users");

const app = express();

const PORT = process.env.PORT || 3000;

/*
 * =========================================
 * Trust proxy
 *
 * Required so express-rate-limit can use the client's real IP
 * when the server runs behind Nginx/load balancer, and also so secure cookies
 * work correctly behind a proxy performing TLS
 * termination.
 * =========================================
 */

app.set("trust proxy", 1);


/*
 * =========================================
 * Security & performance middleware
 * =========================================
 */

app.use(
    helmet({

        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    })
);

app.use(compression());


const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per IP within 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests from this device. Please try again later.",
        data: []
    }
});

app.use("/api", generalLimiter);

/*
 * Note: login and registration already have
 * dedicated and stricter rate limiters inside
 * routes/log_in.router.js and
 * routes/register.router.js, so there is no need
 * to duplicate them here.
 */


/*
 * =========================================
 * Middleware
 * =========================================
 */

app.use(cookieParser());

app.use(express.urlencoded({
    extended: true
}));

app.use(express.json());


/*
 * =========================================
 * MongoDB
 * =========================================
 */

mongoose.connect(process.env.MONGO_URL, {
        // Connection pool settings.
        //
        // FIX (load-test): 10 was originally intended for PM2 cluster mode
        // (each worker gets a small pool so the total connection count does not become too large).
        // However, when the server runs as a single process (node server.js
        // normally, as in this load test), this becomes a very low limit for
        // concurrent MongoDB connections - any endpoint that performs more than
        // one query at the same time under load (such as /api/order, which performs
        // find + several parallel findOneAndUpdate calls + save) competes for the same
        // 10 connections with all other requests. Increasing it here reduces this
        // contention in a single process. **Important: if you enable PM2 cluster mode
        // again (ecosystem.config.js: instances: 'max'), you must set this value
        // back to a small value such as 10, so the total connections across all
        // workers do not exceed the connection limit allowed by your
        // MongoDB plan.
        maxPoolSize: 50,
        serverSelectionTimeoutMS: 10000
    })
    .then(() => {
        console.log("MongoDB conneted");
    })
    .catch((error) => {
        console.log("MongoDB disconneted");
        console.log(error);
    });

mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected - mongoose will try to reconnect automatically");
});

mongoose.connection.on("reconnected", () => {
    console.log("MongoDB reconnected");
});


/*
 * =========================================
 * HTTP Server
 * =========================================
 */

const server = http.createServer(app);


/*
 * =========================================
 * Socket.IO
 * =========================================
 */

const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    },
    // FIX: the server runs in PM2 cluster mode (ecosystem.config.js:
    // instances: 'max') without sticky sessions. Every polling request
    // is a separate HTTP request that can be routed to a different worker
    // from the one that handled the handshake, so the other worker does not
    // know the session and returns "400 Bad Request" - this was exactly
    // what appeared in the console
    // (a new sid repeatedly + WebSocket closing before completion). Restricting transport
    // to WebSocket only solves this: one persistent TCP connection
    // stays on one worker from the moment it is established, so nothing needs
    // repeated routing. This is the official recommended solution from Socket.IO
    // when sticky sessions are not available in front of the cluster.
    transports: ["websocket"]
});


/*
 * =========================================
 * Redis adapter (required with PM2 cluster mode)
 * =========================================
 * Without it: any broadcast such as req.io.to("users").emit(...) only reaches
 * clients connected to the same worker that received the HTTP request -
 * meaning most users connected to other workers will not receive
 * these notifications (new product, order status update, new coupon, etc.)
 * at all, without any visible error. The adapter makes all workers
 * share the same pub/sub through Redis so the broadcast reaches everyone.
 */

if (redis.isRedisConfigured()) {

    // Important note: the main client (redis.client) is configured with
    // enableOfflineQueue: false so cache operations (get/set)
    // fail quickly instead of hanging. However, the pub/sub clients used by
    // the Socket.IO adapter need the offline queue enabled:
    // .duplicate() uses the same connection configuration and is not immediately ready,
    // and the psubscribe command is sent immediately without waiting for the connection
    // to finish. If the queue is disabled, it is rejected immediately with
    // "Stream isn't writeable" and can crash the entire server (this was exactly
    // the reason that stopped the server after it started).
    const pubClient = redis.client.duplicate({
        enableOfflineQueue: true
    });

    const subClient = redis.client.duplicate({
        enableOfflineQueue: true
    });

    // Without an error listener on each client, any error on them
    // (Redis down, network issue...) becomes an "unhandled error event"
    // and can also crash the process. The same protection used for the main
    // client is applied here.
    pubClient.on("error", (err) => {
        console.error("[socket.io redis pub] error:", err.message);
    });

    subClient.on("error", (err) => {
        console.error("[socket.io redis sub] error:", err.message);
    });

    io.adapter(createAdapter(pubClient, subClient));

    console.log("[socket.io] Redis adapter enabled - broadcasts now reach all PM2 workers");

} else {

    console.warn(
        "[socket.io] REDIS_URL not set - real-time events (new_product, new_order, " +
        "update_status, ...) will only reach clients connected to THIS process. " +
        "That's fine for a single process, but BREAKS notifications once you run " +
        "with PM2 cluster mode / instances > 1. Set REDIS_URL before scaling."
    );

}


/*
 * =========================================
 * Make Socket.IO available in routes/controllers
 * =========================================
 */

app.use((req, res, next) => {
    req.io = io;
    next();
});


/*
 * =========================================
 * Socket.IO connection
 * =========================================
 */

// FIX (security): sockets do not go through the Express cookie-parser
// middleware, so we parse the "token" cookie manually from the raw
// handshake headers whenever we need to verify who is on the other end
// of a socket (see join_admin below).
function get_token_from_socket(socket) {
    const raw_cookie = socket.handshake.headers.cookie;

    if (!raw_cookie) {
        return null;
    }

    const match = raw_cookie.match(/(?:^|;\s*)token=([^;]+)/);

    return match ? decodeURIComponent(match[1]) : null;
}

io.on("connection", (socket) => {

    console.log("Socket connected:", socket.id);


    /*
     * Admin joins admins room
     */

    // FIX (security): previously this joined ANY connected socket to the
    // "admins" room with zero verification — any client (even an
    // unauthenticated one, or one connecting from another origin, since
    // CORS is set to origin: true) could run socket.emit("join_admin")
    // from the browser console and start receiving admin-only broadcasts:
    // new_problem (contains customer phone_number, whatsApp_number,
    // GPS_URL), deleted_order, etc. This now verifies the same JWT cookie
    // and admin/super_admin role that auth_super_admin.js checks for the
    // equivalent HTTP routes before allowing the join.
    socket.on("join_admin", async () => {

        try {
            const token = get_token_from_socket(socket);

            if (!token) {
                console.warn(`Socket ${socket.id} tried to join admins room with no auth cookie`);
                return;
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (!decoded.id) {
                console.warn(`Socket ${socket.id} tried to join admins room with an invalid token`);
                return;
            }

            const user = await users.findById(decoded.id).select("role").lean();

            if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
                console.warn(`Socket ${socket.id} tried to join admins room without admin role`);
                return;
            }

            socket.join("admins");

            console.log(
                `Admin joined admins room: ${socket.id}`
            );

        } catch (e) {
            console.warn(`Socket ${socket.id} failed admin auth for join_admin:`, e.message);
        }

    });

    socket.on("join_users", () => {

        socket.join("users");

        console.log(
            `User joined users room: ${socket.id}`
        );

    });


    /*
     * Socket disconnected
     */

    socket.on("disconnect", () => {

        console.log(
            "Socket disconnected:",
            socket.id
        );

    });

});


/*
 * =========================================
 * APIs
 * =========================================
 */

const register = require("./routes/register.router");

const register_super_admin = require("./routes/register_super_admin.router");

const log_in = require("./routes/log_in.router");

const log_out = require("./routes/log_out.router");

const auth_me_router = require("./routes/auth_me.router");

const get_products = require("./routes/get_products.router");

const get_user_orders = require("./routes/get_user_orders.router");

const get_product_reviews = require("./routes/get_product_reviews.router");

const order = require("./routes/order.router");

const post_review = require("./routes/post_review.router");

const get_all_orders = require("./routes/get_all_orders.router")

const get_all_users = require("./routes/get_all_users.router")

const get_all_sections = require("./routes/get_all_sections.router")

const add_section = require("./routes/add_section.router")

const add_product = require("./routes/add_product.router")

const add_coupon = require("./routes/add_coupon.router")

const upgrade_user_to_admin = require("./routes/upgrade_user_to_admin.router")

const update_produt = require("./routes/update_produt.router")

const update_section = require("./routes/update_section.router")

const update_status_of_order = require("./routes/update_status.router")

const delete_product = require("./routes/delete_product.router")

const delete_section = require("./routes/delete_section.router")

const delete_order = require("./routes/delete_order.router")

const update_admin_to_user = require("./routes/update_admin_to_user.router")

const store = require("./routes/store.router")

const get_store_settings = require("./routes/get_store_settings.router")

const ai_assistant = require("./routes/ai_assistant.router")

const add_problem = require("./routes/add_problem.router")

const get_problems = require("./routes/get_problems.router")

const get_cloudinary_config = require("./routes/get_cloudinary_config.router")

app.use(auth_me_router);

app.use(register);

app.use(log_in);

app.use(log_out);

app.use(get_products);

app.use(get_user_orders);

app.use(get_product_reviews);

app.use(order);

app.use(post_review);

app.use(register_super_admin);

app.use(get_all_orders);

app.use(get_all_users);

app.use(add_section);

app.use(get_all_sections);

app.use(get_problems);

app.use(add_product);

app.use(add_problem);

app.use(add_coupon);

app.use(upgrade_user_to_admin);

app.use(update_produt);

app.use(update_section);

app.use(update_status_of_order);

app.use(delete_product);

app.use(delete_section);

app.use(delete_order);

app.use(update_admin_to_user);

app.use(store);

app.use(get_store_settings);

app.use(ai_assistant);

app.use(get_cloudinary_config);

/*
 * =========================================
 * Static files
 * =========================================
 */

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/*
 * =========================================
 * Pages
 * =========================================
 */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});


app.get("/products", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "products.html"
        )
    );

});


app.get("/product", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "product.html"
        )
    );

});


app.get("/cart", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "cart.html"
        )
    );

});


app.get("/login", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "login.html"
        )
    );

});


/*
 * =========================================
 * Register page
 * =========================================
 */

app.get("/register", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "register.html"
        )
    );

});


/*
 * =========================================
 * Start Server
 * =========================================
 */

server.listen(PORT, () => {

    console.log(
        `Server running on http://localhost:${PORT}`
    );

});


/*
 * =========================================
 * Graceful shutdown
 *
 * Important with PM2 (especially in cluster mode and during
 * every reload/restart): close open connections
 * (HTTP, MongoDB, Redis) cleanly instead of
 * abruptly terminating the process and leaving connections hanging.
 * =========================================
 */

async function gracefulShutdown(signal) {

    console.log(`${signal} received: closing server gracefully...`);

    server.close(async () => {

        try {
            await mongoose.connection.close();
            console.log("MongoDB connection closed");
        } catch (err) {
            console.error("Error closing MongoDB connection:", err.message);
        }

        try {
            await redis.closeRedis();
            console.log("Redis connection closed");
        } catch (err) {
            console.error("Error closing Redis connection:", err.message);
        }

        process.exit(0);
    });

    // Safety net: if something gets stuck during shutdown, do not let
    // the process keep running forever (PM2 sends SIGKILL after a while anyway,
    // but this makes shutdown behavior more predictable).
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));