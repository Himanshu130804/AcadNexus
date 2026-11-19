import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicPortfolio } from "../../api/extendedAcademicApi";
import "./PublicPortfolio.css";
export default function PublicPortfolio() {
  const { studentId } = useParams(); const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; getPublicPortfolio(studentId).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.response?.data?.message || "This portfolio is not publicly available."); }); return () => { active = false; }; }, [studentId]);
  if (error) return <main className="public-portfolio"><div className="pp-empty" role="alert">{error}</div></main>;
  if (!data) return <main className="public-portfolio"><div className="pp-empty">Loading portfolio…</div></main>;
  return <main className="public-portfolio"><header className="pp-hero"><span>ACADNEXUS · STUDENT PORTFOLIO</span><h1>{data.student.name}</h1><p>{[data.student.programme, data.student.department].filter(Boolean).join(" · ")}</p></header><section className="pp-grid">{data.items.length ? data.items.map(item => <article className="pp-card" key={item._id}><span>{item.type.replaceAll("_", " ")}</span><h2>{item.title}</h2><p>{item.description}</p>{item.skills?.length > 0 && <small>Skills: {item.skills.join(", ")}</small>}{item.technologies?.length > 0 && <small>Technologies: {item.technologies.join(", ")}</small>}<small>Verification: {item.verificationStatus}</small><div className="pp-links">{item.repositoryUrl && <a href={item.repositoryUrl} target="_blank" rel="noopener noreferrer">Repository ↗</a>}{item.demoUrl && <a href={item.demoUrl} target="_blank" rel="noopener noreferrer">Demo ↗</a>}</div></article>) : <div className="pp-empty">No portfolio items have been shared publicly.</div>}</section></main>;
}
