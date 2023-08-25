const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");

const Schema = mongoose.Schema;

const imageLibrarySchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true },
  imageUrls: [{ type: String, required: true }],
});

imageLibrarySchema.plugin(uniqueValidator);

module.exports = mongoose.model("ImageLibrary", imageLibrarySchema);
