require("dotenv").config();
const orders = require("../models/order");
const mongoose = require("mongoose");

const DEL_order = async(req,res)=>{
    try{
        // FIX: this route already runs behind the auth_super_admin
        // middleware, which verifies the JWT, loads the user, checks the
        // role, and sets req.user. Re-verifying the same token here with
        // jwt.verify() was redundant work on every single delete request
        // (and had its own bug: jwt.verify() throws instead of returning
        // null, so the old "if(!token)" check right after it was dead
        // code and invalid tokens fell through to the generic catch,
        // returning a wrong 500 instead of 401). We just trust req.user
        // now, as every other route in this codebase does.
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated",
                data: []
            });
        }

        const order_id = req.body.order_id;

        if(!order_id){
            return res.status(400).json({
                success:false,
                message:"order id is required",
                data:[]
            })

        }

        // FIX: without this check, an order_id that isn't a valid Mongo
        // ObjectId makes findByIdAndDelete throw a CastError, which used
        // to fall through to the catch block and return a 500 instead of
        // a proper 400.
        if (!mongoose.Types.ObjectId.isValid(order_id)) {
            return res.status(400).json({
                success: false,
                message: "invalid order id",
                data: []
            });
        }

        const deleted_order = await orders.findByIdAndDelete(order_id);

        if (!deleted_order) {
            return res.status(404).json({
                success: false,
                message: "order not found",
                data:[]
            });
        }

        // FIX: guard against req.io being undefined (e.g. socket.io
        // middleware not attached on some code path) so a successful
        // delete can't be turned into a false 500 error.
        if (req.io) {
            req.io.to("admins").emit("deleted_order", {
                deleted_order: deleted_order
            });
        }

        return res.status(200).json({
            success: true,
            message: "Order deleted successfully",
            data:[]
        });
    }
    catch(e){
        console.log(e.message)
        return res.status(500).json({
            success:false,
            message:"Internal server error",
            error:e.message
        })
    }
}

module.exports = DEL_order