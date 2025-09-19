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

const addProduct = catchAsyncError(async (req, res, next) => {
  // slug
  if (req.body.title) {
    req.body.slug = slugify(req.body.title, { lower: true, strict: true });
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
  const product = await productModel.findById(id); // ← fix: antes era findByIdAndUpdate
  if (!product) return next(new AppError("Product was not found", 404));
  res.status(200).json({ message: "success", getSpecificProduct: product });
});

const updateProduct = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

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

const deleteProduct = deleteOne(productModel, "Product");

export {
  addProduct,
  getAllProducts,
  getSpecificProduct,
  updateProduct,
  deleteProduct,
};
