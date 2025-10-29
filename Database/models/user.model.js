import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "User name is required"],
      minLength: [2, "Too short user name"],
      maxLength: [20, "Too long user name"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "User email is required"],
      unique: [true, "Email must be unique"],
      minLength: [1, "Too short user email"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "User password is required"],
      minLength: [6, "minimum length is 6 characters"],
    },
    passwordChangedAt: Date,
    phone: {
      type: String,
      required: [true, "User phone is required"],
    },
    profilePic: String,
    role: {
      type: String,
      enum: ["user", "admin", "seller"], // Añadido "seller"
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    wishlist: [
      {
        type: Schema.ObjectId,
        ref: "product",
      },
    ],
    addresses: [
      {
        street: String,
        city: String,
        phone: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", function () {
  this.password = bcrypt.hashSync(this.password, 8);
});

userSchema.pre("findOneAndUpdate", function () {
  if (this._update.password)
    this._update.password = bcrypt.hashSync(this._update.password, 8);
});

export const userModel = model("user", userSchema);