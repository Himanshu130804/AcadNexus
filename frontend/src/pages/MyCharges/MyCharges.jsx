import React, { useEffect, useState } from "react";
import { getMyCharges } from "../../api/chargeApi";
import "./MyCharges.css";

const MyCharges = () => {
  const [charges, setCharges] = useState([]);

  useEffect(() => {
    getMyCharges().then(setCharges).catch(() => setCharges([]));
  }, []);

  return (
    <div className="my-charges-page">
      <div className="breadcrumb">Home / My Charges</div>

      <section className="my-charges-card">
        <h1>My Assigned Charges</h1>
        <p>
          These are the additional responsibilities assigned by Super Admin.
          Content related to these charges will come to your approval center.
        </p>

        <div className="charges-grid">
          {charges.length ? (
            charges.map((charge) => (
              <article className="my-charge-box" key={charge._id}>
                <h3>{charge.name}</h3>
                <p>{charge.department} / {charge.programme} / {charge.year} / {charge.semester} / {charge.section}</p>
                <strong>Permissions</strong>
                <span>{charge.permissions?.join(", ")}</span>
              </article>
            ))
          ) : (
            <div className="empty-card">No charges assigned yet.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default MyCharges;
