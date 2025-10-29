import express from "express";
import * as product from "./product.controller.js";
import { validate } from "../../middlewares/validate.js";
import {
  addProductValidation,
  deleteProductValidation,
  getSpecificProductValidation,
  updateProductValidation,
} from "./product.validation.js";
import { uploadMultipleFiles } from "../../../multer/multer.js";
import { allowedTo, protectedRoutes } from "../auth/auth.controller.js";

const productRouter = express.Router();

let arrFields = [
  { name: "imgCover", maxCount: 1 },
  { name: "images", maxCount: 20 },
];

// Ruta para que vendedores vean solo sus productos
productRouter.get(
  "/my-products",
  protectedRoutes,
  allowedTo("seller"),
  product.getSellerProducts
);

productRouter
  .route("/")
  .post(
    protectedRoutes,
    allowedTo("admin", "seller"), // Permitir a vendedores crear productos
    uploadMultipleFiles(arrFields, "products"),
    validate(addProductValidation),
    product.addProduct
  )
  .get(product.getAllProducts);

productRouter
  .route("/:id")
  .get(
    validate(getSpecificProductValidation),
    product.getSpecificProduct
  )
  .put(
    protectedRoutes,
    allowedTo("admin", "seller"), // Permitir a vendedores actualizar
    validate(updateProductValidation),
    product.updateProduct
  )
  .delete(
    protectedRoutes,
    allowedTo("admin", "seller"), // Permitir a vendedores eliminar
    validate(deleteProductValidation),
    product.deleteProduct
  );

export default productRouter;