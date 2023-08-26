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

const handleError = (err, statusCode = 500, next) => {
  const error = new HttpError(`${err.message}`, statusCode);
  return next(error);
};

const validateRecaptcha = async (recaptchaValue) => {
  try {
    const recaptchaResponse = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaValue}`
    );
    return recaptchaResponse.data.success;
  } catch (err) {
    throw new HttpError("Recaptcha validation failed.", 401);
  }
};

const signup = async (req, res, next) => {
  const { name, email, password, recaptchaValue } = req.body;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError("Please cross-check your inputs...", 422);
    }

    const isRecaptchaValid = await validateRecaptcha(recaptchaValue);
    if (!isRecaptchaValid) {
      throw new HttpError("Invalid recaptcha.", 401);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new HttpError("User already exists...", 422);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const createdUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    await createdUser.save();

    const token = jwt.sign(
      { userId: createdUser.id, email: createdUser.email },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(201).json({
      userId: createdUser.id,
      email: createdUser.email,
      token: token,
      name: createdUser.name,
      message: "Sign Up Successful.",
    });
  } catch (error) {
    handleError(error, 500, next);
  }
};

const login = async (req, res, next) => {
  const { email, password, recaptchaValue } = req.body;

  try {
    const isRecaptchaValid = await validateRecaptcha(recaptchaValue);
    if (!isRecaptchaValid) {
      throw new HttpError("Invalid recaptcha.", 401);
    }

    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      throw new HttpError(
        "Invalid credentials, email does not exist in the db.",
        401
      );
    }

    const isValidPassword = await bcrypt.compare(
      password,
      existingUser.password
    );
    if (!isValidPassword) {
      throw new HttpError("Invalid credentials, password mismatch.", 401);
    }

    const token = jwt.sign(
      { userId: existingUser.id, email: existingUser.email },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      userId: existingUser.id,
      email: existingUser.email,
      name: existingUser.name,
      token: token,
      message: "Login Successful.",
    });
  } catch (error) {
    handleError(error, 500, next);
  }
};

const fetchUserDetails = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new HttpError("User not found in the db.", 404);
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
  } catch (error) {
    handleError(error, 500, next);
  }
};

const fetchUserDetailsById = async (userId, next) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new HttpError("User not found in the db.", 404);
    }
    return user;
  } catch (err) {
    return null;
  }
};

// ... Previous code ...

const getImageUrls = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const imageLibrary = await ImageLibrary.findById(userId);
    if (!imageLibrary) {
      throw new HttpError(
        "Image Library not found in the db, try again later...",
        404
      );
    }

    const imageUrls = imageLibrary.imageUrls;
    res.set("Cache-Control", "no-cache");
    res.status(200).json({ imageUrls });
  } catch (error) {
    handleError(error, 500, next);
  }
};

const uploadSingleImage = async (req, res, next) => {
  const userId = req.params.id;
  const publicUrl = req.file.location.split("/");
  const lastSegment = publicUrl.pop();

  try {
    let user = await User.findById(userId);
    if (!user) {
      throw new HttpError("User not found in the db, try again later...", 404);
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
  } catch (error) {
    handleError(error, 500, next);
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
      throw new HttpError("User not found in the db, try again later...", 404);
    }
    if (!user.expiryOfSubscription) {
      throw new HttpError("User is not subscribed for Pro plan.", 404);
    } else {
      const expiryDate = moment(user.expireOfSubscription, "YYYYMMDDHHmmssSSS");
      const currentDate = moment();
      if (currentDate.isAfter(expiryDate)) {
        throw new HttpError(
          "User subscription expired, please renew your subscription.",
          404
        );
      }
    }
  } catch (error) {
    handleError(error, 500, next);
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
  } catch (error) {
    console.log("error : ", error);
    handleError(error, 500, next);
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

const fetchCustomer = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new HttpError("User not found in the db.", 404);
    }
    const customer = await stripe.customers.retrieve(user.customerId);

    res
      .json({
        error: false,
        message: "Customer fetched successfully!",
        customer: customer,
      })
      .status(200);
  } catch (error) {
    handleError(error, 500, next);
  }
};

const fetchSubscription = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new HttpError("User not found in the db.", 404);
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
  } catch (error) {
    handleError(error, 500, next);
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
    } catch (error) {
      handleError(error, 500, next);
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
    } catch (error) {
      handleError(error, 500, next);
    }
    res
      .json({
        error: false,
        message: "Subscription created successfully!",
        data: {
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscription: subscription,
        },
      })
      .status(201);
  } catch (error) {
    handleError(error, 500, next);
  }
};

const updateSubscription = async (req, res, next) => {
  const userId = req.params.userId;
  const { priceId, customerId, subscriptionId } = req.body;

  try {
    const existingUser = await User.findById(userId);
    const expirationDate = moment().add(30, "days");
    const expirationTimestamp = expirationDate.format("YYYYMMDDHHmmssSSS");

    existingUser.customerId = customerId;
    existingUser.priceId = priceId;
    existingUser.subscriptionId = subscriptionId;
    existingUser.isSubscribed = true;
    existingUser.expiryOfSubscription = expirationTimestamp;
    await existingUser.save();
    res
      .json({
        error: false,
        message: "Subscription updated successfully!",
        icon: "success",
      })
      .status(201);
  } catch (error) {
    handleError(error, 500, next);
  }
};

const resumeSubscription = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new HttpError("User not found in the db.", 404);
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
      message: "Subscription resumed successfully!",
      data: {
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
    });
  } catch (error) {
    handleError(error, 500, next);
  }
};

const cancelSubscription = async (req, res, next) => {
  const userId = req.params.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new HttpError("User not found in the db.", 404);
    }
    if (!user.subscriptionId) {
      throw new HttpError("User has no subscription.", 404);
    }

    await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: true,
    });

    user.isSubscribed = false;
    await user.save();

    res
      .json({
        error: false,
        message: "Subscription cancelled successfully!",
      })
      .status(200);
  } catch (error) {
    handleError(error, 500, next);
  }
};

exports.signup = signup;
exports.login = login;
exports.fetchUserDetails = fetchUserDetails;
exports.fetchUserDetailsById = fetchUserDetailsById;
exports.getImageUrls = getImageUrls;
exports.uploadSingleImage = uploadSingleImage;
exports.uploadMultipleImages = uploadMultipleImages;
exports.fetchCustomer = fetchCustomer;
exports.fetchSubscription = fetchSubscription;
exports.createSubscription = createSubscription;
exports.updateSubscription = updateSubscription;
exports.resumeSubscription = resumeSubscription;
exports.cancelSubscription = cancelSubscription;
