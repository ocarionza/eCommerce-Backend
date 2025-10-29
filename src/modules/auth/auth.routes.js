import express from "express";
import * as auth from "./auth.controller.js";

const authRouter = express.Router();

authRouter.post("/signup", auth.signUp);
authRouter.post("/signin", auth.signIn);

authRouter.patch(
    "/assign-seller/:userId",
    auth.protectedRoutes,
    auth.allowedTo("admin"),
    auth.assignSellerRole
  );

export default authRouter;