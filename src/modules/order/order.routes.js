import express from "express";
// import { validate } from "../../middlewares/validate.js";

import { allowedTo, protectedRoutes } from "../auth/auth.controller.js";
import * as order from "../order/order.controller.js"
const orderRouter = express.Router();

// ⚠️ IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros (:id)
// para evitar que :id capture las rutas específicas

// Ver todas las ventas (solo admin)
orderRouter.get('/admin/sales', protectedRoutes, allowedTo("admin"), order.getAllOrders)

// Checkout con Stripe
orderRouter.post('/checkOut/:id', protectedRoutes, allowedTo("user", "admin"), order.createCheckOutSession)

// Verificar pago y crear orden (temporal para desarrollo sin webhook)
orderRouter.post('/verify-payment', protectedRoutes, allowedTo("user", "admin"), order.verifyPaymentAndCreateOrder)

// Obtener mis órdenes (usuario)
orderRouter
  .route("/")
  .get(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    order.getSpecificOrder
  )

// Crear orden en efectivo - DEBE IR AL FINAL porque /:id captura cualquier string
orderRouter
  .route("/:id")
  .post(
    protectedRoutes,
    allowedTo("user", "admin"),  // Permitir user y admin
    order.createCashOrder
  )
export default orderRouter;
