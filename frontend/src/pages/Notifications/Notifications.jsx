import React, { useEffect, useState } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../../api/notificationApi";
import "./Notifications.css";

const Notifications = () => {
  const [items, setItems] = useState([]);

  const load = async () => {
    setItems(await getNotifications());
  };

  useEffect(() => {
    load();
  }, []);

  const readOne = async (id) => {
    await markNotificationRead(id);
    load();
  };

  const readAll = async () => {
    await markAllNotificationsRead();
    load();
  };

  return (
    <main className="notifications-page">
      <section className="notifications-header">
        <div>
          <span>Notifications</span>
          <h1>Campus Updates</h1>
        </div>
        <button onClick={readAll}>Mark all read</button>
      </section>

      <section className="notifications-list">
        {items.length ? items.map((item) => (
          <div key={item._id} className={item.read ? "notification-card" : "notification-card unread"}>
            <div>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
            </div>
            {!item.read && <button onClick={() => readOne(item._id)}>Mark Read</button>}
          </div>
        )) : <div className="notification-card">No notifications yet.</div>}
      </section>
    </main>
  );
};

export default Notifications;
