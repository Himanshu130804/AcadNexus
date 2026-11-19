import Notification from "../models/Notification.js";

export const getNotifications = async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(notifications);
};

export const markNotificationRead = async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!notification) {
    return res.status(404).json({ message: "Notification not found" });
  }

  notification.read = true;
  await notification.save();

  res.json(notification);
};

export const markAllNotificationsRead = async (req, res) => {
  await Notification.updateMany({ user: req.user._id }, { read: true });
  res.json({ message: "All notifications marked as read" });
};
