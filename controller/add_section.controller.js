require("dotenv").config();
const section = require("../models/section");
const cache = require("../utils/cache");

const add_section = async(req,res)=>{
    try{
        // FIX: this route runs behind the auth_super_admin middleware,
        // which already verifies the JWT, loads the user, checks the
        // role, and sets req.user. Re-verifying the token here with
        // jwt.verify() was redundant work on every request (and had the
        // same bug as the other controllers: jwt.verify() throws instead
        // of returning null, so the old "if(!token)" check right after it
        // was dead code and invalid tokens fell through to the generic
        // catch, returning a wrong 500 instead of 401). We trust req.user
        // now, same as every other admin route.
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated",
                data: []
            });
        }

        // requirement to add section
        const section_name = req.body.section_name
        if(!section_name){
            // FIX: this was returning 401 (Unauthorized) for a missing
            // field, which is the wrong status code — the request is
            // properly authenticated, it's the body that's invalid.
            // 400 (Bad Request) is correct here.
            return res.status(400).json({
                success:false,
                message:"section_name is required",
                data:[]
            })

        }
        const new_section = new section({
            name:section_name,
        });

        await new_section.save()
        await cache.del("sections");

        // FIX: guard against req.io being undefined so a successful save
        // can't be turned into a false 500 error.
        if (req.io) {
            req.io.to("users").emit("new_section", {
                section: new_section
            });
        }
        // RESPONSE

        return res.status(201).json({
            success:true,
            message:"add successfully",
            data:new_section
        })

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
module.exports = add_section