const express = require("express");
const { check } = require("express-validator");

const usersControllers = require("../controllers/users-controllers");
const imageUpload = require("../middlewares/image-upload");
const imageUploadMultiple = require("../middlewares/image-upload-multiple");
const checkAuth = require("../middlewares/check-auth");
const userRateLimiter = require("../middlewares/userRateLimit");

const router = express.Router();

router.post(
  "/signup",
  [
    check("name").not().isEmpty(),
    check("email").normalizeEmail().isEmail(),
    check("password").isLength({ min: 6 }),
  ],
  usersControllers.signup
);

router.post("/login", usersControllers.login);

router.use(checkAuth);

router.get("/fetch-user-details/:userId", usersControllers.fetchUserDetails);

router.get("/images/:userId", usersControllers.getImageUrls);

router.get("/fetch-subscription/:userId", usersControllers.fetchSubscription);

router.post(
  "/resume-subscription/:userId",
  usersControllers.resumeSubscription
);

router.get("/fetch-customer/:userId", usersControllers.fetchCustomer);

router.post(
  "/image-upload/:id",
  userRateLimiter,
  imageUpload.single("UploadFiles"),
  usersControllers.uploadSingleImage
);

router.post(
  "/image-upload-multiple/:id",
  imageUploadMultiple("UploadFiles", 5),
  usersControllers.uploadMultipleImages
);

router.post("/create-subscription", usersControllers.createSubscription);

router.post(
  "/update-subscription/:userId",
  usersControllers.updateSubscription
);

router.post(
  "/cancel-subscription/:userId",
  usersControllers.cancelSubscription
);

module.exports = router;
