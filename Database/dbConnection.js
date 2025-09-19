import mongoose from "mongoose";

export function dbConnection() {
  mongoose
    .connect(`mongodb+srv://brayanocampoc7_db_user:tNV4xQ2sxkHLA179@ecommerceback.rkpdss6.mongodb.net/?retryWrites=true&w=majority&appName=ecommerceback`)
    .then(() => {
      console.log("DB Connected Succesfully");
    })
    .catch((error) => {
      console.log("DB Failed to connect", error);
    });
}


//Use this is postman https://ecommerce-backend-codv.onrender.com/api/v1/auth/signup

