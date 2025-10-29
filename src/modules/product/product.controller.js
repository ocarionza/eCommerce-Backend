import slugify from "slugify";
import { catchAsyncError } from "../../utils/catchAsyncError.js";
import { AppError } from "../../utils/AppError.js";
import { deleteOne } from "../../handlers/factor.js";
import { productModel } from "./../../../Database/models/product.model.js";
import { ApiFeatures } from "../../utils/ApiFeatures.js";

/**
 * Normaliza imágenes desde req.files o req.body:
 * - Si vienen por Multer: usa filenames
 * - Si vienen por body: respeta URLs/strings
 */
function extractImagesFromRequest(req) {
  const out = {};
  // imgCover
  if (req?.files?.imgCover?.[0]) {
    // Multer subió portada
    out.imgCover = req.files.imgCover[0].filename;
  } else if (typeof req.body.imgCover === "string" && req.body.imgCover.trim()) {
    // Body trae URL/string
    out.imgCover = req.body.imgCover.trim();
  }
  // images (galería)
  if (Array.isArray(req?.files?.images) && req.files.images.length > 0) {
    out.images = req.files.images.map((f) => f.filename);
  } else if (req.body.images) {
    // Puede venir como string o array en el body
    if (Array.isArray(req.body.images)) {
      out.images = req.body.images.filter(Boolean).map((s) => String(s).trim());
    } else if (typeof req.body.images === "string") {
      // admite CSV "url1,url2" o un único string
      const raw = req.body.images.includes(",")
        ? req.body.images.split(",")
        : [req.body.images];
      out.images = raw.map((s) => s.trim()).filter(Boolean);
    }
  }
  return out;
}

// Función para verificar ownership del producto
const checkProductOwnership = async (productId, userId, userRole) => {
  if (userRole === "admin") return true; // Admin puede todo
  
  const product = await productModel.findById(productId);
  if (!product) return false;
  
  return product.seller && product.seller.toString() === userId.toString();
};

const addProduct = catchAsyncError(async (req, res, next) => {
  // slug
  if (req.body.title) {
    req.body.slug = slugify(req.body.title, { lower: true, strict: true });
  }

  // Asignar vendedor si es un seller
  if (req.user.role === "seller") {
    req.body.seller = req.user._id;
    req.body.createdBy = "seller";
  } else {
    req.body.createdBy = "admin";
  }

  // Imágenes: soporta Multer y/o URLs en body
  const { imgCover, images } = extractImagesFromRequest(req);
  if (imgCover) req.body.imgCover = imgCover;
  if (images) req.body.images = images;

  const doc = new productModel(req.body);
  await doc.save();

  res.status(201).json({ message: "success", product: doc });
});

const getAllProducts = catchAsyncError(async (req, res, next) => {
  const apiFeature = new ApiFeatures(productModel.find(), req.query)
    .pagination()
    .fields()
    .filteration()
    .search()
    .sort();

  const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
  const products = await apiFeature.mongooseQuery;

  res.status(200).json({ page: PAGE_NUMBER, message: "success", products });
});

const getSpecificProduct = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const product = await productModel.findById(id).populate('seller', 'name email');
  if (!product) return next(new AppError("Product was not found", 404));
  res.status(200).json({ message: "success", getSpecificProduct: product });
});

const updateProduct = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  // Verificar si el usuario puede actualizar este producto
  const canUpdate = await checkProductOwnership(id, req.user._id, req.user.role);
  if (!canUpdate) {
    return next(new AppError("You are not authorized to update this product", 403));
  }

  if (req.body.title) {
    req.body.slug = slugify(req.body.title, { lower: true, strict: true });
  }

  // Permite actualizar imágenes por Multer o por URLs en body
  const { imgCover, images } = extractImagesFromRequest(req);
  if (imgCover) req.body.imgCover = imgCover;
  if (images) req.body.images = images;

  const updated = await productModel.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!updated) return next(new AppError("Product was not found", 404));
  res.status(200).json({ message: "success", updateProduct: updated });
});

// Controlador personalizado para delete
const deleteProduct = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  // Verificar si el usuario puede eliminar este producto
  const canDelete = await checkProductOwnership(id, req.user._id, req.user.role);
  if (!canDelete) {
    return next(new AppError("You are not authorized to delete this product", 403));
  }

  const deleted = await productModel.findByIdAndDelete(id);
  if (!deleted) return next(new AppError("Product was not found", 404));

  res.status(200).json({ message: "Product deleted successfully" });
});

// Nuevo controlador para que vendedores vean sus productos
const getSellerProducts = catchAsyncError(async (req, res, next) => {
  const apiFeature = new ApiFeatures(
    productModel.find({ seller: req.user._id }), 
    req.query
  )
    .pagination()
    .fields()
    .filteration()
    .search()
    .sort();

  const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
  const products = await apiFeature.mongooseQuery;

  res.status(200).json({ 
    page: PAGE_NUMBER, 
    message: "success", 
    products,
    total: products.length 
  });
});

export {
  addProduct,
  getAllProducts,
  getSpecificProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
};