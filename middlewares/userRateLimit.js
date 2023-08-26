const rateLimit = require("express-rate-limit");
const usersControllers = require("../controllers/users-controllers");
const moment = require("moment");

const userRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  message: "Too many requests, please try again after one hour.",
  handler: async (req, res) => {
    const userId = req.params.id;

    try {
      const user = await usersControllers.fetchUserDetailsById(userId);
      const currentDate = moment();

      if (
        !user.expiryOfSubscription ||
        currentDate.isAfter(
          moment(user.expireOfSubscription, "YYYYMMDDHHmmssSSS")
        )
      ) {
        res.status(429).json({
          message: "Too many requests, please try again after one hour.",
        });
      } else {
        res.status(200).json({ message: "Request allowed" });
      }
    } catch (error) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ message: "An error occurred" });
    }
  },
});

module.exports = userRateLimiter;
