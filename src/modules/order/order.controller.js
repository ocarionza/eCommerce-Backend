import { catchAsyncError } from "../../utils/catchAsyncError.js";
import { AppError } from "../../utils/AppError.js";
import { cartModel } from "../../../Database/models/cart.model.js";
import { productModel } from "../../../Database/models/product.model.js";
import { orderModel } from "../../../Database/models/order.model.js";

import Stripe from "stripe";
import { userModel } from "../../../Database/models/user.model.js";

// Usar variable de entorno o clave por defecto (desarrollo)
const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_51NV8e0HVbfRYk4SfG3Ul84cabreiXkPbW1xMugwqvU9is2Z2ICEafTtG6NHLIUdFVIjkiRHYmAPKxCLsCpoU2NnN00LVpHcixz"
);

const createCashOrder = catchAsyncError(async (req, res, next) => {
  let cart = await cartModel.findById(req.params.id);

  // console.log(cart);
  let totalOrderPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalPrice;

  console.log(cart.cartItem);
  const order = new orderModel({
    userId: req.user._id,
    cartItem: cart.cartItem,
    totalOrderPrice,
    shippingAddress: req.body.shippingAddress,
  });

  await order.save();

  // console.log(order);
  if (order) {
    let options = cart.cartItem.map((item) => ({
      updateOne: {
        filter: { _id: item.productId },
        update: { $inc: { quantity: -item.quantity, sold: item.quantity } },
      },
    }));

    await productModel.bulkWrite(options);

    await cartModel.findByIdAndDelete(req.params.id);

    return res.status(201).json({ message: "success", order });
  } else {
    next(new AppError("Error in cart ID", 404));
  }
});

// Obtener TODAS las órdenes del comprador (usuario autenticado)
const getSpecificOrder = catchAsyncError(async (req, res, next) => {
  const orders = await orderModel
    .find({ userId: req.user._id })
    .populate("cartItem.productId", "title price imgCover")
    .sort({ createdAt: -1 });

  res.status(200).json({ 
    message: "success", 
    results: orders.length,
    orders 
  });
});

// Obtener todas las ventas (SOLO para admins)
const getAllOrders = catchAsyncError(async (req, res, next) => {
  const orders = await orderModel
    .find({})
    .populate("userId", "name email phone")
    .populate("cartItem.productId", "title price imgCover")
    .sort({ createdAt: -1 });

  // Calcular estadísticas
  const totalSales = orders.reduce((acc, order) => acc + (order.totalOrderPrice || 0), 0);
  const paidOrders = orders.filter(order => order.isPaid).length;
  const deliveredOrders = orders.filter(order => order.isDelivered).length;

  res.status(200).json({ 
    message: "success", 
    results: orders.length,
    statistics: {
      totalOrders: orders.length,
      totalSales,
      paidOrders,
      deliveredOrders
    },
    orders 
  });
});

// Obtener órdenes que contienen productos del seller autenticado
const getSellerOrders = catchAsyncError(async (req, res, next) => {
  const sellerId = req.user._id;

  // Usar agregación para encontrar órdenes que contengan productos del seller
  const orders = await orderModel.aggregate([
    {
      $unwind: "$cartItem"
    },
    {
      $addFields: {
        "cartItem.productIdObj": { $toObjectId: "$cartItem.productId" }
      }
    },
    {
      $lookup: {
        from: "products",
        localField: "cartItem.productIdObj",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    {
      $unwind: {
        path: "$productDetails",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $match: {
        "productDetails.seller": sellerId
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "buyer"
      }
    },
    {
      $group: {
        _id: "$_id",
        userId: { $first: "$userId" },
        buyer: { $first: { $arrayElemAt: ["$buyer", 0] } },
        shippingAddress: { $first: "$shippingAddress" },
        paymentMethod: { $first: "$paymentMethod" },
        isPaid: { $first: "$isPaid" },
        isDelivered: { $first: "$isDelivered" },
        paidAt: { $first: "$paidAt" },
        deliveredAt: { $first: "$deliveredAt" },
        createdAt: { $first: "$createdAt" },
        updatedAt: { $first: "$updatedAt" },
        totalOrderPrice: { $first: "$totalOrderPrice" },
        sellerItems: {
          $push: {
            _id: "$cartItem._id",
            productId: "$cartItem.productId",
            quantity: "$cartItem.quantity",
            price: "$cartItem.price",
            totalProductDiscount: "$cartItem.totalProductDiscount",
            productDetails: "$productDetails"
          }
        }
      }
    },
    {
      $addFields: {
        sellerTotal: {
          $sum: {
            $map: {
              input: "$sellerItems",
              in: { $multiply: ["$$this.price", "$$this.quantity"] }
            }
          }
        }
      }
    },
    { $sort: { createdAt: -1 } }
  ]);

  const totalSellerSales = orders.reduce((acc, order) => acc + (order.sellerTotal || 0), 0);
  const sellerPaidOrders = orders.filter(order => order.isPaid).length;
  const sellerDeliveredOrders = orders.filter(order => order.isDelivered).length;

  res.status(200).json({
    message: "success",
    results: orders.length,
    statistics: {
      totalOrders: orders.length,
      totalSales: totalSellerSales,
      paidOrders: sellerPaidOrders,
      deliveredOrders: sellerDeliveredOrders
    },
    orders
  });
});

const createCheckOutSession = catchAsyncError(async (req, res, next) => {
  let cart = await cartModel.findById(req.params.id);
  if(!cart) return next(new AppError("Cart was not found",404))

  console.log(cart);

  // console.log(cart);
  let totalOrderPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalPrice;

  let sessions = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: "usd", // Cambiado a USD (o puedes usar "cop" para pesos colombianos)
          unit_amount: totalOrderPrice * 100,
          product_data: {
            name: req.user.name,
          },
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: (process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/payment-success") + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: process.env.STRIPE_CANCEL_URL || "http://localhost:3000/payment-cancelled",
    customer_email: req.user.email,
    client_reference_id: req.params.id,
    metadata: {
      // Stripe solo acepta strings en metadata, así que serializamos el objeto
      shippingAddress: JSON.stringify(req.body.shippingAddress)
    },
  });

  res.json({ message: "success", sessions });
});

const createOnlineOrder = catchAsyncError(async (request, response) => {
  const sig = request.headers["stripe-signature"].toString();

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || "whsec_fcatGuOKvXYUQoz5NWSwH9vaqdWXIWsI"
    );
  } catch (err) {
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type == "checkout.session.completed") {
    // const checkoutSessionCompleted = event.data.object;
    card(event.data.object,response)


  } else {
    console.log(`Unhandled event type ${event.type}`);
  }
});

//https://ecommerce-backend-codv.onrender.com/api/v1/orders/checkOut/6536c48750fab46f309bb950


async function card (e, res){
  try {
    console.log("🎉 Webhook recibido - Creando orden...");
    
    let cart = await cartModel.findById(e.client_reference_id);

    if(!cart) {
      console.error("❌ Carrito no encontrado:", e.client_reference_id);
      return res.status(404).json({ error: "Cart was not found" });
    }

    let user = await userModel.findOne({email: e.customer_email});
    
    if(!user) {
      console.error("❌ Usuario no encontrado:", e.customer_email);
      return res.status(404).json({ error: "User was not found" });
    }

    // Deserializar la dirección de envío
    let shippingAddress = {};
    try {
      shippingAddress = JSON.parse(e.metadata.shippingAddress);
    } catch (err) {
      console.error("Error al parsear shippingAddress:", err);
      shippingAddress = e.metadata.shippingAddress || {};
    }

    const order = new orderModel({
      userId: user._id,
      cartItem: cart.cartItem,
      totalOrderPrice: e.amount_total / 100,
      shippingAddress: shippingAddress,
      paymentMethod: "card",
      isPaid: true,
      paidAt: Date.now()
    });

    await order.save();
    console.log("✅ Orden creada:", order._id);

    // Actualizar inventario
    let options = cart.cartItem.map((item) => ({
      updateOne: {
        filter: { _id: item.productId },
        update: { $inc: { quantity: -item.quantity, sold: item.quantity } },
      },
    }));

    await productModel.bulkWrite(options);
    console.log("✅ Inventario actualizado");

    // Eliminar carrito
    await cartModel.findOneAndDelete({userId: user._id});
    console.log("✅ Carrito eliminado");

    return res.status(201).json({ message: "success", order });
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Endpoint temporal para verificar pago manualmente (desarrollo)
const verifyPaymentAndCreateOrder = catchAsyncError(async (req, res, next) => {
  const { sessionId } = req.body;
  
  try {
    // Obtener detalles de la sesión de Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status !== 'paid') {
      return next(new AppError("Payment not completed", 400));
    }
    
    // Buscar carrito
    let cart = await cartModel.findById(session.client_reference_id);
    if (!cart) {
      return next(new AppError("Cart was not found", 404));
    }
    
    // Buscar usuario
    let user = await userModel.findOne({ email: session.customer_email });
    if (!user) {
      return next(new AppError("User was not found", 404));
    }
    
    // Verificar si la orden ya existe (evitar duplicados)
    let existingOrder = await orderModel.findOne({ 
      userId: user._id,
      'cartItem.productId': { $in: cart.cartItem.map(item => item.productId) },
      isPaid: true,
      paymentMethod: "card"
    });
    
    if (existingOrder) {
      return res.status(200).json({ 
        message: "Order already exists", 
        order: existingOrder 
      });
    }
    
    // Deserializar dirección
    let shippingAddress = {};
    try {
      shippingAddress = JSON.parse(session.metadata.shippingAddress);
    } catch (err) {
      shippingAddress = session.metadata.shippingAddress || {};
    }
    
    // Crear orden
    const order = new orderModel({
      userId: user._id,
      cartItem: cart.cartItem,
      totalOrderPrice: session.amount_total / 100,
      shippingAddress: shippingAddress,
      paymentMethod: "card",
      isPaid: true,
      paidAt: Date.now()
    });
    
    await order.save();
    
    // Actualizar inventario
    let options = cart.cartItem.map((item) => ({
      updateOne: {
        filter: { _id: item.productId },
        update: { $inc: { quantity: -item.quantity, sold: item.quantity } },
      },
    }));
    
    await productModel.bulkWrite(options);
    
    // Eliminar carrito
    await cartModel.findOneAndDelete({ userId: user._id });
    
    res.status(201).json({ message: "success", order });
  } catch (error) {
    console.error("Error verificando pago:", error);
    next(new AppError("Error verifying payment", 500));
  }
});

export {
  createCashOrder,
  getSpecificOrder,
  getAllOrders,
  getSellerOrders,
  createCheckOutSession,
  createOnlineOrder,
  verifyPaymentAndCreateOrder,
};
