require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const HttpError = require("./utils/http-error");
const config = require("./config");
const cors = require("cors");
const helmet = require("helmet");

const usersRoutes = require("./routes/users-routes");

const app = express();

app.use(helmet());

app.use(bodyParser.json());

app.use(cors());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );

  next();
});

app.use("/api/users", usersRoutes);

app.use((req, res, next) => {
  const error = new HttpError("Could not find this route.", 404);
  throw error;
});

app.use((error, req, res, next) => {
  if (res.headerSent) {
    return next(error);
  }
  res.status(error.code || 500);
  res.json({ message: error.message || "An unknown error occurred!" });
});

mongoose
  .connect(
    `mongodb+srv://${config.DB_USER}:${config.DB_PASSWORD}@${config.DB_URL}/${config.DB_NAME}?retryWrites=true&w=majority`
  )
  .then(() => {
    app.listen(process.env.PORT || 4001);
  })
  .catch((err) => {
    console.log(err);
  });
