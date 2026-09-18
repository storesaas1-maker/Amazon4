const coupons = require("../models/coupon");
const orders = require("../models/order");
const products = require("../models/products");

// Defensive cap on how many distinct line items a single order can
// contain. Nothing legitimate needs more than this, and without a cap
// a single request could force the server to run an unbounded number
// of DB round trips (see the stock-reduction step below).
const MAX_ORDER_ITEMS = 50;

/*
 * =========================================
 * Helper: restore stock
 *
 * Used whenever we already reduced the
 * quantity of some products but the order
 * could not be completed in the end
 * (another product ran out of stock, or an
 * error happened while saving the order).
 * We give the quantity back to every
 * product we already touched.
 *
 * Runs the restores concurrently (Promise.all)
 * instead of one at a time - they're independent
 * writes to different products, so there's no
 * reason to make a request wait for them
 * sequentially.
 * =========================================
 */

async function restoreStock(reducedStock) {
  await Promise.all(
    reducedStock.map(async (item) => {
      try {
        await products.updateOne(
          { _id: item.id },
          { $inc: { quantity: item.quantity } }
        );
      } catch (error) {
        console.log(error);
      }
    })
  );
}

const order = async (req, res) => {
  /*
   * Keeps track of every product whose
   * stock we already reduced, so we can
   * roll it back if the order fails later.
   */

  let reducedStock = [];

  try {
    /*
     * =========================================
     * 1. Check authentication
     * =========================================
     */
    // Reads the user the `auth` middleware already verified and
    // fetched (routes/order.router.js) instead of re-verifying the JWT
    // and re-hitting the database here - this is one of the most
    // latency-sensitive endpoints in the app, and the one under the
    // most load pressure at checkout time.
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        data: []
      });
    }

    /*
     * =========================================
     * 2. Get products from request
     *
     * Expected:
     *
     * products: [
     *   {
     *     id: "PRODUCT_ID",
     *     quantity: 2
     *   },
     *   {
     *     id: "PRODUCT_ID",
     *     quantity: 1
     *   }
     * ]
     * =========================================
     */

    const rawRequestedProducts = req.body.products;
    const coupon = req.body.coupon;

    if (
      !Array.isArray(rawRequestedProducts) ||
      rawRequestedProducts.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Products are required",
        data: []
      });
    }

    if (rawRequestedProducts.length > MAX_ORDER_ITEMS) {
      return res.status(400).json({
        success: false,
        message: `An order can contain at most ${MAX_ORDER_ITEMS} distinct products`,
        data: []
      });
    }

    /*
     * =========================================
     * 3. Validate products
     * =========================================
     */

    for (const item of rawRequestedProducts) {
      if (!item || !item.id) {
        return res.status(400).json({
          success: false,
          message: "Invalid product data",
          data: []
        });
      }

      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product quantity",
          data: []
        });
      }
    }

    // FIX: if the same product id appeared more than once in the
    // request, `$in` below returns that product only ONCE, so
    // dbProducts.length ended up smaller than productIds.length and
    // the whole order was wrongly rejected as "product not found" even
    // though every product actually existed. Merging duplicate line
    // items into a single entry (summing their quantities) before any
    // further processing fixes that and also means a duplicate entry
    // is treated as one combined quantity instead of being priced and
    // stock-checked twice independently.
    const mergedQuantities = new Map();

    for (const item of rawRequestedProducts) {
      const key = String(item.id);
      const quantity = Number(item.quantity);
      mergedQuantities.set(key, (mergedQuantities.get(key) || 0) + quantity);
    }

    const requestedProducts = Array.from(
      mergedQuantities,
      ([id, quantity]) => ({ id, quantity })
    );

    if (requestedProducts.length > MAX_ORDER_ITEMS) {
      return res.status(400).json({
        success: false,
        message: `An order can contain at most ${MAX_ORDER_ITEMS} distinct products`,
        data: []
      });
    }

    /*
     * =========================================
     * 4. Get real products from MongoDB
     * =========================================
     */

    const productIds = requestedProducts.map(
      item => item.id
    );

    // .lean() - nothing here calls any Mongoose document method on
    // these, only reads plain fields (price/discount/quantity/name), so
    // there's no reason to pay for full document hydration.
    const dbProducts = await products
      .find({ _id: { $in: productIds } })
      .lean();

    /*
     * Make sure every product exists
     */

    if (dbProducts.length !== productIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more products were not found",
        data: []
      });
    }

    // Build a lookup map once instead of calling dbProducts.find(...)
    // (an O(n) scan) for every requested product below - that would
    // turn into an O(n * m) scan for orders with many distinct line
    // items. A Map makes every lookup O(1).
    const dbProductsById = new Map(
      dbProducts.map(product => [product._id.toString(), product])
    );

    /*
     * =========================================
     * 5. Calculate prices
     * =========================================
     */

    let total_price = 0;

    const orderProducts = [];

    for (const requestedProduct of requestedProducts) {
      const product = dbProductsById.get(
        requestedProduct.id.toString()
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
          data: []
        });
      }

      /*
       * =========================================
       * Check available stock
       *
       * We check this here (before creating
       * the order) so the customer gets a
       * clear message immediately.
       * =========================================
       */

      const requestedQuantityForStock = Number(
        requestedProduct.quantity
      );

      const availableQuantity = Number(
        product.quantity
      );

      if (
        !Number.isFinite(availableQuantity) ||
        availableQuantity < requestedQuantityForStock
      ) {
        return res.status(400).json({
          success: false,
          message: `The quantity for the product "${product.name}" is currently unavailable; please try again later.`,          data: []
        });
      }

      /*
       * Real price from database
       */

      const productPrice = Number(product.price);

      if (
        !Number.isFinite(productPrice) ||
        productPrice < 0
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid price for product: ${product.name}`,
          data: []
        });
      }

      /*
       * Quantity
       */

      const quantity = Number(
        requestedProduct.quantity
      );

      /*
       * Product discount
       */

      const productDiscount = Number(
        product.discount || 0
      );

      if (
        !Number.isFinite(productDiscount) ||
        productDiscount < 0 ||
        productDiscount > 100
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid discount for product: ${product.name}`,
          data: []
        });
      }

      /*
       * Calculate discounted price
       */

      const discountedPrice =
        productPrice -
        (productPrice * productDiscount / 100);

      const finalProductPrice =
        Math.max(0, discountedPrice);

      /*
       * Calculate product total
       */

      const productTotal =
        finalProductPrice * quantity;

      total_price += productTotal;

      /*
       * =========================================
       * Save product information
       *
       * IMPORTANT:
       * We save the quantity here.
       * =========================================
       */

      orderProducts.push({
        // FIX: this is the permanent link back to the actual Product
        // document (see order.js) — needed so the admin dashboard can
        // reliably resolve the real product image for this order later,
        // instead of only having a name snapshot to guess from.
        product: product._id,

        name: product.name,

        price: Math.round(
          finalProductPrice * 100
        ) / 100,

        quantity: quantity,

        // Snapshot of the product's images at order time, same idea as
        // `name`/`price` above - so the images shown for this order line
        // stay correct even if the product's images are changed or
        // removed later.
        images: Array.isArray(product.images) ? product.images : []
      });
    }

    /*
     * =========================================
     * 6. Reduce stock
     *
     * Each reduction is still an atomic update
     * that only succeeds if enough stock is still
     * available at this exact moment
     * (quantity: { $gte: ... }), protecting us if
     * two customers order the last item(s) at the
     * same time.
     *
     * These run concurrently with Promise.all since
     * they're writes to independent documents - no
     * correctness reason to serialize them, and doing
     * so cuts this step's latency down to roughly one
     * round trip regardless of how many products are
     * in the order.
     *
     * If any product turns out to be out of stock,
     * we restore whatever we already reduced and
     * stop the order, exactly as before.
     * =========================================
     */

    const stockUpdateResults = await Promise.all(
      requestedProducts.map(async (requestedProduct) => {
        const requestedQuantity = Number(
          requestedProduct.quantity
        );

        const updatedProduct = await products.findOneAndUpdate(
          {
            _id: requestedProduct.id,
            quantity: { $gte: requestedQuantity }
          },
          {
            $inc: { quantity: -requestedQuantity }
          }
        );

        return {
          requestedProduct,
          requestedQuantity,
          updatedProduct
        };
      })
    );

    let outOfStockProduct = null;

    for (const result of stockUpdateResults) {
      if (result.updatedProduct) {
        reducedStock.push({
          id: result.requestedProduct.id,
          quantity: result.requestedQuantity
        });
      } else if (!outOfStockProduct) {
        outOfStockProduct = result.requestedProduct;
      }
    }

    if (outOfStockProduct) {
      await restoreStock(reducedStock);
      reducedStock = [];

      const product = dbProductsById.get(
        outOfStockProduct.id.toString()
      );

      return res.status(400).json({
      success: false,
      message: `The product "${
      product ? product.name : ""
      }" is out of stock; please try again later.`,
      data: []
      });
    }

    /*
     * =========================================
     * 7. Apply coupon
     * =========================================
     */

    let couponDiscount = 0;

    if (
      typeof coupon === "string" &&
      coupon.trim() !== ""
    ) {

      /*
       * Find coupon
       */

      const find_coupon = await coupons.findOne({
        name: coupon.trim()
      }).lean();

      if (!find_coupon) {
        await restoreStock(reducedStock);
        reducedStock = [];

        return res.status(404).json({
          success: false,
          message: "Coupon not found",
          data: []
        });
      }

      /*
       * =========================================
       * Check coupon expiration
       *
       * end_time must contain a valid date/time
       * such as:
       *
       * 2026-09-10T15:30:00.000Z
       * =========================================
       */

      if (
        !find_coupon.end_time ||
        typeof find_coupon.end_time !== "string" ||
        find_coupon.end_time.trim() === ""
      ) {
        await restoreStock(reducedStock);
        reducedStock = [];

        return res.status(400).json({
          success: false,
          message: "Coupon expiration time is missing",
          data: []
        });
      }

      const couponEndTime = new Date(
        find_coupon.end_time
      );

      /*
       * Check if the date is valid
       */

      if (
        Number.isNaN(couponEndTime.getTime())
      ) {
        await restoreStock(reducedStock);
        reducedStock = [];

        return res.status(400).json({
          success: false,
          message: "Invalid coupon expiration time",
          data: []
        });
      }

      /*
       * Check if coupon has expired
       */

      if (
        Date.now() >= couponEndTime.getTime()
      ) {
        await restoreStock(reducedStock);
        reducedStock = [];

        return res.status(400).json({
          success: false,
          message: "Coupon has expired",
          data: []
        });
      }

      /*
       * =========================================
       * Get coupon discount
       * =========================================
       */

      couponDiscount = Number(
        find_coupon.discount || 0
      );

      /*
       * Validate coupon discount
       */

      if (
        !Number.isFinite(couponDiscount) ||
        couponDiscount < 0 ||
        couponDiscount > 100
      ) {
        await restoreStock(reducedStock);
        reducedStock = [];

        return res.status(400).json({
          success: false,
          message: "Invalid coupon discount",
          data: []
        });
      }

      /*
       * =========================================
       * Apply coupon
       * =========================================
       */

      total_price =
        total_price -
        (total_price * couponDiscount / 100);

      total_price = Math.max(0, total_price);
    }

    /*
     * =========================================
     * 8. Round total price
     * =========================================
     */

    total_price =
      Math.round(total_price * 100) / 100;

    /*
     * =========================================
     * 9. Generate order number
     * =========================================
     */

    // A 9-digit random space (~900 million values) pushes the 50%
    // birthday-paradox collision point out to roughly 35,000 orders,
    // versus ~1,100 with a 6-digit number. Combined with the bounded
    // retry loop below (same idiom register.controller.js uses for its
    // email unique index: catch duplicate-key error 11000, try again
    // with a fresh value), this only works if `orderNumber` has a
    // `unique: true` index in the order schema - add one if it
    // doesn't already, otherwise a collision can't be detected at all
    // and this retry will never trigger.
    function generateOrderNumber() {
      return (
        "ORD-" +
        Math.floor(
          100000000 + Math.random() * 900000000
        )
      );
    }

    const MAX_ORDER_NUMBER_ATTEMPTS = 5;

    /*
     * =========================================
     * 10. Create order
     * =========================================
     */

    let newOrder;

    for (
      let attempt = 1;
      attempt <= MAX_ORDER_NUMBER_ATTEMPTS;
      attempt++
    ) {
      newOrder = new orders();

      newOrder.orderNumber = generateOrderNumber();

      newOrder.products = orderProducts;

      newOrder.total_price = total_price;

      newOrder.user_id = user._id;

      newOrder.user_name = user.name;

      newOrder.phone_number = user.phone_number;

      newOrder.GPS_URL = user.GPS_URL;

      newOrder.whatsApp_number = user.whatsApp_number;

      newOrder.status = "new";

      /*
       * createdAt and updatedAt
       * are handled automatically
       * by timestamps: true
       */

      try {
        await newOrder.save();
        break; // saved with a unique orderNumber
      } catch (saveError) {
        const isLastAttempt =
          attempt === MAX_ORDER_NUMBER_ATTEMPTS;

        if (saveError.code === 11000 && !isLastAttempt) {
          // Duplicate orderNumber - extremely unlikely with the wider
          // range above, but cheaper to retry with a fresh number than
          // to fail the whole order (and the stock we already reduced)
          // over a random-number collision.
          continue;
        }

        throw saveError;
      }
    }

    req.io.to("admins").emit("new_order", {
      order: newOrder
    });

    /*
     * =========================================
     * 11. Response
     * =========================================
     */

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: newOrder
    });

  } catch (e) {
    console.log(e);

    /*
     * If we already reduced stock for one or
     * more products before this error happened
     * (e.g. the order failed to save), give the
     * quantity back.
     */

    if (reducedStock.length) {
      await restoreStock(reducedStock);
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: e.message
    });
  }
};

module.exports = order;