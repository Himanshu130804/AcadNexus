import React, { useContext, useState } from "react";
import { getFileUrl } from "../../utils/fileUrl";
import { AuthContext } from "../../context/AuthContext";
import { addComment, toggleLike, toggleSave } from "../../api/contentApi";
import { createReport } from "../../api/reportApi";
import "./ContentCard.css";


const fileIcon = (fileType = "", fileName = "") => {
  const name = fileName.toLowerCase();
  if (fileType.includes("pdf") || name.endsWith(".pdf")) return "📕";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "📘";
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return "📗";
  if (name.endsWith(".ppt") || name.endsWith(".pptx")) return "📙";
  if (fileType.includes("image")) return "🖼️";
  return "📎";
};

const ContentCard = ({ item, onChanged }) => {
  const { user } = useContext(AuthContext);
  const [comment, setComment] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState({ reason: "Wrong Notes", details: "" });

  const fileUrl = item.fileUrl ? getFileUrl(item.fileUrl) : "";

  const like = async () => {
    if (!user) return alert("Login first");
    await toggleLike(item._id || item.id);
    onChanged?.();
  };

  const save = async () => {
    if (!user) return alert("Login first");
    await toggleSave(item._id || item.id);
    onChanged?.();
  };

  const sendComment = async () => {
    if (!user) return alert("Login first");
    if (!comment.trim()) return;
    await addComment(item._id || item.id, comment);
    setComment("");
    onChanged?.();
  };

  const sendReport = async () => {
    if (!user) return alert("Login first");
    await createReport({ content: item._id || item.id, ...report });
    setShowReport(false);
    setReport({ reason: "Wrong Notes", details: "" });
    alert("Report submitted");
  };

  return (
    <article className="content-card">
      <div className="content-top">
        <span className={`type-badge ${item.type}`}>{item.type}</span>
        <span className={`status-badge ${item.status}`}>{item.status}</span>
      </div>

      <h3>{item.title}</h3>
      <p className="content-body">{item.body}</p>

      <div className="content-meta">
        <span>🏫 {item.department || "All Departments"}</span>
        {item.semester && <span>🎓 Sem {item.semester}</span>}
        {item.subject && <span>📚 {item.subject}</span>}
        <span>👤 {item.submittedBy?.name || "Student"}</span>
      </div>

      {fileUrl && (
        <div className="file-box">
          <div>
            <strong>{fileIcon(item.fileType, item.fileName)} {item.fileName || "Attachment"}</strong>
            <p>{item.fileType || "File"} {item.fileSize ? `• ${(item.fileSize / 1024 / 1024).toFixed(2)} MB` : ""}</p>
          </div>
          <div className="file-actions">
            {item.fileType?.includes("image") && <a href={fileUrl} target="_blank" rel="noreferrer">Preview</a>}
            <a href={fileUrl} target="_blank" rel="noreferrer" download>Download</a>
          </div>
        </div>
      )}

      <div className="content-actions">
        <button onClick={like}>❤️ {item.likes?.length || 0}</button>
        <button onClick={save}>🔖 Save</button>
        <button onClick={() => setShowReport(!showReport)}>⚠️ Report</button>
      </div>

      {showReport && (
        <div className="report-box">
          <select value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })}>
            <option>Wrong Notes</option>
            <option>Spam</option>
            <option>Offensive Content</option>
            <option>Misinformation</option>
            <option>Duplicate Content</option>
            <option>Fake Announcement</option>
            <option>Other</option>
          </select>
          <textarea placeholder="Details" value={report.details} onChange={(e) => setReport({ ...report, details: e.target.value })} />
          <button onClick={sendReport}>Submit Report</button>
        </div>
      )}

      <div className="comments">
        <strong>Comments ({item.comments?.length || 0})</strong>
        {item.comments?.slice(0, 3).map((c) => (
          <p key={c._id || c.id}><b>{c.user?.name || "User"}:</b> {c.text}</p>
        ))}

        {user && (
          <div className="comment-input">
            <input value={comment} placeholder="Add comment..." onChange={(e) => setComment(e.target.value)} />
            <button onClick={sendComment}>Post</button>
          </div>
        )}
      </div>
    </article>
  );
};

export default ContentCard;
