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
    .populate("cartItems.productId", "title price imgCover")
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
    .populate("cartItems.productId", "title price imgCover")
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
      $lookup: {
        from: "products",
        localField: "cartItems.productId",
        foreignField: "_id",
        as: "productDetails"
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
      $addFields: {
        // Filtrar solo los items del carrito que pertenecen al seller
        sellerItems: {
          $filter: {
            input: "$cartItems",
            cond: {
              $in: [
                "$$this.productId",
                {
                  $map: {
                    input: {
                      $filter: {
                        input: "$productDetails",
                        cond: { $eq: ["$$this.seller", sellerId] }
                      }
                    },
                    in: "$$this._id"
                  }
                }
              ]
            }
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        buyer: { $arrayElemAt: ["$buyer", 0] },
        sellerItems: 1,
        shippingAddress: 1,
        paymentMethod: 1,
        isPaid: 1,
        isDelivered: 1,
        paidAt: 1,
        deliveredAt: 1,
        createdAt: 1,
        updatedAt: 1,
        // Calcular total solo de productos del seller
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

  // Poblar los detalles de los productos del seller
  await orderModel.populate(orders, {
    path: "sellerItems.productId",
    select: "title price imgCover"
  });

  // Calcular estadísticas del seller
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
    success_url: process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/payment-success",
    cancel_url: process.env.STRIPE_CANCEL_URL || "http://localhost:3000/payment-cancelled",
    customer_email: req.user.email,
    client_reference_id: req.params.id,
    metadata: req.body.shippingAddress,
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


async function card (e,res){
  let cart = await cartModel.findById(e.client_reference_id);

  if(!cart) return next(new AppError("Cart was not found",404))

  let user = await userModel.findOne({email:e.customer_email})
  const order = new orderModel({
    userId: user._id,
    cartItem: cart.cartItem,
    totalOrderPrice : e.amount_total/100,
    shippingAddress: e.metadata.shippingAddress,
    paymentMethod:"card",
    isPaid:true,
    paidAt:Date.now()
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

    await cartModel.findOneAndDelete({userId: user._id});

    return res.status(201).json({ message: "success", order });
  } else {
    next(new AppError("Error in cart ID", 404));
  }
}

export {
  createCashOrder,
  getSpecificOrder,
  getAllOrders,
  getSellerOrders,
  createCheckOutSession,
  createOnlineOrder,
};
