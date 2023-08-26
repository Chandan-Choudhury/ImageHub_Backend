const HttpError = require("../utils/http-error");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const ImageLibrary = require("../models/imageLibrary");
const config = require("../config");
const stripe = require("stripe")(config.STRIPE_SECRET_KEY);
const moment = require("moment");
const axios = require("axios");

const recaptchaSecret = config.RECAPTCHA_SECRET;

const signup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Please cross check your inputs...", 422));
  }
  const { name, email, password, recaptchaValue } = req.body;

  const recaptchaResponse = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaValue}`
  );
  if (!recaptchaResponse.data.success) {
    const error = new HttpError("Invalid recaptcha.", 401);
    return next(error);
  }

  let existingUser;
  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError("Signing Up failed, try again later...", 500);
    return next(error);
  }

  if (existingUser) {
    const error = new HttpError("User already exist...", 422);
    return next(error);
  }

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password, 12);
  } catch (err) {
    const error = new HttpError("Couldn't create user try again.", 500);
    return next(error);
  }

  const createdUser = new User({
    name,
    email,
    password: hashedPassword,
  });

  try {
    await createdUser.save();
  } catch (err) {
    const error = new HttpError("Sign up failed...", 500);
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: createdUser.id, email: createdUser.email },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError("Signing Up failed, try again later...", 500);
    return next(error);
  }

  res.status(201).json({
    userId: createdUser.id,
    email: createdUser.email,
    token: token,
    name: createdUser.name,
  });
};

const login = async (req, res, next) => {
  const { email, password, recaptchaValue } = req.body;
  let existingUser;
  try {
    const recaptchaResponse = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaValue}`
    );
    if (!recaptchaResponse.data.success) {
      const error = new HttpError("Invalid recaptcha.", 401);
      return next(error);
    }
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError("Login failed, try again later...", 500);
    return next(error);
  }

  if (!existingUser) {
    const error = new HttpError(
      "Invalid credentials, email does not exist in the db.",
      401
    );
    return next(error);
  }

  let isValidPassword = false;
  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (err) {
    const error = new HttpError("Couldn't log you in.", 500);
    return next(error);
  }

  if (!isValidPassword) {
    const error = new HttpError("Invalid credentials, password mismatch.", 401);
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: existingUser.id, email: existingUser.email },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError("Signing in failed, try again later...", 500);
    return next(error);
  }

  res.json({
    userId: existingUser.id,
    email: existingUser.email,
    name: existingUser.name,
    token: token,
    message: "Login Successful.",
  });
};

const fetchUserDetails = async (req, res, next) => {
  const userId = req.params.userId;
  let user;
  try {
    user = await User.findById(userId);
    if (!user) {
      const error = new HttpError("User not found in the db.", 404);
      return next(error);
    }
    res.status(200).json({
      message: "User details fetched successfully!",
      email: user.email,
      name: user.name,
      priceId: user.priceId,
      subscriptionId: user.subscriptionId,
      customerId: user.customerId,
      isSubscribed: user.isSubscribed,
      expiryOfSubscription: user.expiryOfSubscription,
    });
  } catch (err) {
    const error = new HttpError("Fetching user details failed.", 500);
    return next(error);
  }
};

const getImageUrls = async (req, res, next) => {
  const userId = req.params.userId;

  let imageLibrary;
  try {
    imageLibrary = await ImageLibrary.findById(userId);
    if (!imageLibrary) {
      const error = new HttpError(
        "Image Library not found in the db, try again later...",
        404
      );
      return next(error);
    }

    const imageUrls = imageLibrary.imageUrls;
    res.set("Cache-Control", "no-cache");
    res.status(200).json({ imageUrls });
  } catch (err) {
    const error = new HttpError(
      "Fetching imageUrls failed, try again later...",
      500
    );
    return next(error);
  }
};

const uploadSingleImage = async (req, res, next) => {
  const userId = req.params.id;
  const publicUrl = req.file.location.split("/");
  const lastSegment = publicUrl.pop();
  try {
    let user = await User.findById(userId);
    if (!user) {
      const error = new HttpError(
        "User not found in the db, try again later...",
        404
      );
      return next(error);
    }

    let imageLibrary = await ImageLibrary.findById(userId);
    if (!imageLibrary) {
      imageLibrary = new ImageLibrary({
        _id: userId,
        userId: userId,
        imageUrls: [],
      });
    }
    imageLibrary.imageUrls.push(
      config.R2_PUBLIC_URL + userId + "/" + lastSegment
    );
    await imageLibrary.save();

    res.send({
      message: "Uploaded!",
      publicUrl: config.R2_PUBLIC_URL + userId + "/" + lastSegment,
      name: req.file.key,
      type: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    const error = new HttpError("Image upload failed, try again later...", 500);
    return next(error);
  }
};

const uploadMultipleImages = async (req, res, next) => {
  const userId = req.params.id;
  const publicUrls = req.files.map((file) => {
    const lastSegment = file.location.split("/").pop();
    return config.R2_PUBLIC_URL + userId + "/" + lastSegment;
  });
  try {
    let user = await User.findById(userId);
    if (!user) {
      const error = new HttpError(
        "User not found in the db, try again later...",
        404
      );
      return next(error);
    }
    if (!user.expiryOfSubscription) {
      const error = new HttpError("User is not subscribed for Pro plan.", 404);
      return next(error);
    } else {
      const expiryDate = moment(user.expireOfSubscription, "YYYYMMDDHHmmssSSS");
      const currentDate = moment();
      if (currentDate.isAfter(expiryDate)) {
        const error = new HttpError(
          "User subscription expired, please renew your subscription. lala",
          404
        );
        return next(error);
      }
    }
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, try again later...",
      500
    );
    return next(error);
  }
  let imageLibrary = await ImageLibrary.findById(userId);
  if (!imageLibrary) {
    imageLibrary = new ImageLibrary({
      _id: userId,
      userId: userId,
      imageUrls: [],
    });
  }
  imageLibrary.imageUrls = imageLibrary.imageUrls.concat(publicUrls);

  try {
    await imageLibrary.save();
  } catch (err) {
    console.log("error : ", err);
    const error = new HttpError(
      " in saving imageLibrary User image upload failed, try again later...",
      500
    );
    return next(error);
  }

  const responseFiles = req.files.map((file) => ({
    name: file.key,
    type: file.mimetype,
    size: file.size,
  }));

  res.send({
    message: "Uploaded!",
    publicUrls: publicUrls,
    files: responseFiles,
  });
};

const fetchSubscription = async (req, res, next) => {
  const userId = req.params.userId;
  try {
    const user = await User.findById(userId);
    if (!user) {
      const error = new HttpError("User not found in the db.", 404);
      return next(error);
    }
    const subscription = await stripe.subscriptions.retrieve(
      user.subscriptionId
    );

    res
      .json({
        error: false,
        message: "Subscription fetched successfully!",
        subscription: subscription,
      })
      .status(200);
  } catch (err) {
    const error = new HttpError(`${err.message}`, 500);
    return next(error);
  }
};

const fetchCustomer = async (req, res, next) => {
  const userId = req.params.userId;
  try {
    const user = await User.findById(userId);
    if (!user) {
      const error = new HttpError("User not found in the db.", 404);
      return next(error);
    }
    const customer = await stripe.customers.retrieve(user.customerId);

    res
      .json({
        error: false,
        message: "Customer fetched successfully!",
        customer: customer,
      })
      .status(200);
  } catch (err) {
    const error = new HttpError(`${err.message}`, 500);
    return next(error);
  }
};

const createSubscription = async (req, res, next) => {
  try {
    const { name, email, address, paymentMethod, priceId } = req.body;
    const existingUser = await User.findOne({ email: email });
    let customer;
    let subscription;
    try {
      customer = await stripe.customers.create({
        name: name,
        email: email,
        address: address,
        shipping: {
          name: name,
          address: {
            line1: address.line1,
            postal_code: address.postal_code,
            city: address.city,
            state: address.state,
            country: address.country,
          },
        },
        payment_method: paymentMethod,
        invoice_settings: {
          default_payment_method: paymentMethod,
        },
      });
    } catch (err) {
      const error = new HttpError(`${err.message}`, 500);
      return next(error);
    }
    try {
      subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_settings: {
          payment_method_options: {
            card: {
              request_three_d_secure: "any",
            },
          },
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
      });
    } catch (err) {
      const error = new HttpError(`${err.message}`, 500);
      return next(error);
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);
    const expirationTimestamp = expirationDate.toISOString().replace(/\D/g, "");

    existingUser.customerId = customer.id;
    existingUser.priceId = priceId;
    existingUser.subscriptionId = subscription.id;
    existingUser.isSubscribed = true;
    existingUser.expiryOfSubscription = expirationTimestamp;
    await existingUser.save();
    res
      .json({
        error: false,
        message: "Subscription created successfully!",
        data: {
          clientSecret:
            subscription.latest_invoice.payment_intent.client_secret,
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscription: subscription,
        },
      })
      .status(201);
  } catch (err) {
    const error = new HttpError(`${err.message}`, 500);
    return next(error);
  }
};

const resumeSubscription = async (req, res, next) => {
  const userId = req.params.userId;
  try {
    const user = await User.findById(userId);
    if (!user) {
      const error = new HttpError("User not found in the db.", 404);
      return next(error);
    }
    const subscription = await stripe.subscriptions.update(
      user.subscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    user.isSubscribed = true;

    await user.save();

    res.status(200).json({
      error: false,
      message: "Subscription updated successfully!",
      data: {
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
    });
  } catch (err) {
    const error = new HttpError(`${err.message}`, 500);
    return next(error);
  }
};

const cancelSubscription = async (req, res, next) => {
  const userId = req.params.userId;
  try {
    const user = await User.findById(userId);
    if (!user) {
      const error = new HttpError("User not found in the db.", 404);
      return next(error);
    }
    if (!user.subscriptionId) {
      const error = new HttpError("User has no subscription.", 404);
      return next(error);
    }

    // const subscription = await stripe.subscriptions.retrieve(
    //   user.subscriptionId
    // );
    await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: true,
    });

    // user.subscriptionId = null;
    user.isSubscribed = false;
    await user.save();

    res
      .json({
        error: false,
        message: "Subscription cancelled successfully!",
      })
      .status(200);
  } catch (err) {
    const error = new HttpError(`${err.message}`, 500);
    return next(error);
  }
};

exports.signup = signup;
exports.login = login;
exports.fetchUserDetails = fetchUserDetails;
exports.getImageUrls = getImageUrls;
exports.uploadSingleImage = uploadSingleImage;
exports.uploadMultipleImages = uploadMultipleImages;
exports.fetchCustomer = fetchCustomer;
exports.fetchSubscription = fetchSubscription;
exports.createSubscription = createSubscription;
exports.resumeSubscription = resumeSubscription;
exports.cancelSubscription = cancelSubscription;
