import express from "express";
import { validate } from "../../middlewares/validate.js";

import { allowedTo, protectedRoutes } from "../auth/auth.controller.js";
import { addProductToCartValidation, removeProductFromCart } from "./cart.validation.js";
import * as cart from "../cart/cart.controller.js"
const cartRouter = express.Router();

cartRouter
  .route("/")
  .post(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    cart.addProductToCart
  ).get(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    cart.getLoggedUserCart
  )
  cartRouter
  .route("/apply-coupon")
  .post(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    cart.applyCoupon
  )

cartRouter
  .route("/:id")
  .delete(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    cart.removeProductFromCart
  )
  .put(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    cart.updateProductQuantity
  );

export default cartRouter;
