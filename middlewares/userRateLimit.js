const rateLimit = require("express-rate-limit");
const usersControllers = require("../controllers/users-controllers");
const moment = require("moment");

const userRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  message: "Too many requests, please try again after one hour.",
  handler: async (req, res) => {
    const userId = req.params.id;
    const user = await usersControllers.fetchUserDetailsById(userId);

    if (!user.expiryOfSubscription) {
      res.status(429).json({
        message: "Too many requests, please try again after one hour.",
      });
      return;
    }
    const expiryDate = moment(user.expireOfSubscription, "YYYYMMDDHHmmssSSS");
    const currentDate = moment();
    if (currentDate.isAfter(expiryDate)) {
      res.status(429).json({
        message: "Too many requests, please try again after one hour.",
      });
      return;
    }

    res.status(200).json({ message: "Request allowed" });
  },
});

module.exports = userRateLimiter;
