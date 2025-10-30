import express from "express";
// import { validate } from "../../middlewares/validate.js";

import { allowedTo, protectedRoutes } from "../auth/auth.controller.js";
import * as order from "../order/order.controller.js"
const orderRouter = express.Router();



// Crear orden en efectivo
orderRouter
  .route("/:id")
  .post(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    order.createCashOrder
  )

// Obtener mis órdenes (usuario)
orderRouter
  .route("/")
  .get(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    order.getSpecificOrder
  )

// Checkout con Stripe
orderRouter.post('/checkOut/:id', protectedRoutes, allowedTo("user", "admin"), order.createCheckOutSession)

// Ver todas las ventas (solo admin)
orderRouter.get('/admin/sales', protectedRoutes, allowedTo("admin"), order.getAllOrders)

// Ver órdenes con productos del seller
orderRouter.get('/seller/orders', protectedRoutes, allowedTo("admin", "seller"), order.getSellerOrders)

export default orderRouter;
