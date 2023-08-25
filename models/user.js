const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");

const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, require: true, unique: true },
  password: { type: String, require: true, minlength: 6 },
  subscriptionId: { type: String },
  isSubscribed: { type: Boolean, default: false },
  expiryOfSubscription: { type: String },
  customerId: { type: String },
  priceId: { type: String },
});

userSchema.plugin(uniqueValidator);

module.exports = mongoose.model("User", userSchema);
