require("dotenv").config();

const jwt = require("jsonwebtoken");
const users = require("../models/users");

const auth_super_admin = async(req,res,next)=>{
    try{
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated"
            });
        }
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (!decoded.id) {
            return res.status(401).json({
                success: false,
                message: "Invalid token"
            });
        }

        // FIX: this used to run a bare findById() with no select() and no
        // .lean(), so every admin-only request pulled back the entire
        // user document (including the hashed password and every other
        // field) and hydrated it into a full Mongoose document, even
        // though only "_id" and "role" are actually used below. Matching
        // the same select()/.lean() pattern already used in auth.js cuts
        // that overhead on every admin route.
        const user = await users
            .findById(decoded.id)
            .select("_id name email role phone_number GPS_URL whatsApp_number")
            .lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "admin not found in database"
            });
        }
        if(user.role!=="super_admin"&&user.role!=="admin"){
            return res.status(403).json({
                success: false,
                message: "admin not found"
            }); 
        }
        req.user = user;

        next();
    }
    catch(e){
        console.log(e.message);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
}
module.exports = auth_super_admin