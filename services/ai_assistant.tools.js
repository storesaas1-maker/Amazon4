
const products = require("../models/products");
const section = require("../models/section");
const store = require("../models/store");
const config = require("../config/ai_assistant.config");


function escapeRegex(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampNumber(value, { min, max, fallback }) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function safeString(value, maxLength = 120) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}


const PRODUCT_PUBLIC_FIELDS =
    "_id name description price final_price discount quantity section images";

const SECTION_PUBLIC_FIELDS = "name description slug";

const STORE_PUBLIC_FIELDS =
    "store_name store_description store_phone store_whatsApp_number store_GPS";

function toPublicStore(s) {
    if (!s) return null;
    return {
        name: safeString(s.store_name, 120),
        description: safeString(s.store_description, 300),
        phone: safeString(s.store_phone, 30),
        whatsapp: safeString(s.store_whatsApp_number, 30),
        location: safeString(s.store_GPS, 150),
    };
}


function toPublicProduct(p) {
    if (!p) return null;

    const inStock =
        typeof p.quantity === "number" ? p.quantity > 0 : undefined;

    return {
        name: safeString(p.name, 120) || "product",
        description: safeString(p.description, 220),
        price: p.price ?? null,
        final_price: p.final_price > 0 ? p.final_price : (p.price ?? null),
        discount: p.discount || 0,
        section: p.section && p.section.name ? safeString(p.section.name, 60) : null,
        in_stock: inStock,
    };
}


function toProductCard(p) {
    if (!p) return null;

    const price = safeNumber(p.price);
    const rawFinal = safeNumber(p.final_price);
    const finalPrice = rawFinal && rawFinal > 0 ? rawFinal : price;
    const discount = safeNumber(p.discount) || 0;

    const firstImage = Array.isArray(p.images)
        ? p.images.find(img => typeof img === "string" && img.trim())
        : p.images;

    return {
        id: p._id ? String(p._id) : null,
        name: safeString(p.name, 120) || "product",
        image: safeString(firstImage, 500) || null,
        price,
        final_price: finalPrice,
        discount: discount > 0 ? discount : 0,
        section: p.section && p.section.name ? safeString(p.section.name, 60) : null,
        in_stock: typeof p.quantity === "number" ? p.quantity > 0 : true,
    };
}

function toPublicSection(s) {
    if (!s) return null;
    return {
        name: safeString(s.name, 80),
        description: safeString(s.description, 200),
    };
}



const TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "search_products",
            description:
                    "Search the store's current products (name/description/price/category/availability). " +
                    "Always use this tool before answering any question about a product, price, " +
                    "or availability, rather than guessing or relying on memory. " +
                    "The tool's results are automatically displayed to the customer as product cards featuring images and prices, " +
                    "so simply provide a brief introductory sentence and do not repeat the list of products or prices in the text.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            "A word or phrase to search for a product name or description. Leave blank to display general products.",
                    },
                    section_name: {
                        type: "string",
                        description: "Category name for filtering products (optional).",
                    },
                    max_price: {
                        type: "number",
                        description: "Maximum acceptable price (optional).",
                    },
                    min_price: {
                        type: "number",
                        description: "Minimum acceptable price (optional).",
                    },
                    in_stock_only: {
                        type: "boolean",
                        description: "Show only in-stock products (optional).",
                    },
                    limit: {
                        type: "number",
                        description: `Maximum number of results (default and maximum ${config.AI_MAX_SEARCH_RESULTS}).`,
                    },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_sections",
            description:
                "Retrieve the list of all currently available store sections. Use it when a customer asks about sections or categories.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
    {
        type: "function",
        function: {
            name: "get_store_info",
            description:
                "Retrieve general store information (name, description, phone number, WhatsApp, location). " +
                "Use this when the customer asks for the store's name, contact details, or location.",
            parameters: { type: "object", properties: {}, required: [] },
        },
    },
];

const ALLOWED_TOOL_NAMES = new Set(TOOL_DEFINITIONS.map(t => t.function.name));


async function executeSearchProducts(rawArgs) {
    const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};

    const limit = clampNumber(args.limit, {
        min: 1,
        max: config.AI_MAX_SEARCH_RESULTS,
        fallback: config.AI_MAX_SEARCH_RESULTS,
    });

    const filter = {};

    const query = safeString(args.query, 80);
    if (query) {
        const safePattern = escapeRegex(query);
        filter.$or = [
            { name: { $regex: safePattern, $options: "i" } },
            { description: { $regex: safePattern, $options: "i" } },
        ];
    }

    const minPrice = Number(args.min_price);
    const maxPrice = Number(args.max_price);
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
        filter.price = {};
        if (Number.isFinite(minPrice)) filter.price.$gte = Math.max(minPrice, 0);
        if (Number.isFinite(maxPrice)) filter.price.$lte = Math.max(maxPrice, 0);
    }

    if (args.in_stock_only === true) {
        filter.quantity = { $gt: 0 };
    }

    let results = await products
        .find(filter)
        .select(PRODUCT_PUBLIC_FIELDS)
        .populate("section", "name")
        .limit(limit)
        .lean();

    const sectionName = safeString(args.section_name, 60).toLowerCase();
    if (sectionName) {
        results = results.filter(
            p =>
                p.section &&
                p.section.name &&
                String(p.section.name).toLowerCase().includes(sectionName)
        );
    }

    return {
        count: results.length,
        products: results.map(toPublicProduct),
        cards: results.map(toProductCard),
    };
}

async function executeGetSections() {
    const results = await section
        .find({})
        .select(SECTION_PUBLIC_FIELDS)
        .limit(50)
        .lean();

    return {
        count: results.length,
        sections: results.map(toPublicSection),
    };
}

async function executeGetStoreInfo() {
    const result = await store
        .findOne({})
        .select(STORE_PUBLIC_FIELDS)
        .lean();

    if (!result) {
        return { error: "There is currently no registered store information." };
    }

    return { store: toPublicStore(result) };
}


async function executeTool(name, rawArguments) {
    if (!ALLOWED_TOOL_NAMES.has(name)) {
        return { result: { error: `The tool "${name}" Not permitted.` }, cards: [] };
    }

    let args = {};
    try {
        args = rawArguments ? JSON.parse(rawArguments) : {};
    } catch (_) {
        args = {};
    }

    try {
        switch (name) {
            case "search_products": {
                const { cards, ...forModel } = await executeSearchProducts(args);
                return { result: forModel, cards: Array.isArray(cards) ? cards : [] };
            }
            case "get_sections":
                return { result: await executeGetSections(), cards: [] };
            case "get_store_info":
                return { result: await executeGetStoreInfo(), cards: [] };
            default:
                return { result: { error: "Unknown tool." }, cards: [] };
        }
    } catch (error) {
        console.log(`[ai_assistant.tools] Implementation failed ${name}:`, error.message);
        return {
            result: { error: "An error occurred while executing the database search." },
            cards: [],
        };
    }
}

module.exports = {
    TOOL_DEFINITIONS,
    ALLOWED_TOOL_NAMES,
    executeTool,
    executeSearchProducts,
    executeGetSections,
    executeGetStoreInfo,
    toPublicProduct,
    toProductCard,
    toPublicSection,
    toPublicStore,
};