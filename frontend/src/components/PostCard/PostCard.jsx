import React from "react";
import { getFileUrl } from "../../utils/fileUrl";
import "./PostCard.css";

const fileIcon = {
  pdf: "📕",
  word: "📘",
  excel: "📗",
  ppt: "📙",
  image: "🖼️",
  other: "📎",
};

const PostCard = ({ item, adminActions }) => {
  return (
    <article className="post-card">
      <div className="post-top">
        <span className={`type-pill ${item.type}`}>{item.type?.toUpperCase()}</span>
        <span className={`status-pill ${item.status}`}>{item.status}</span>
      </div>

      <h3>{item.title}</h3>
      <p>{item.body}</p>

      <div className="post-meta">
        {item.subject && <span>📘 {item.subject}</span>}
        {item.semester && <span>🎒 Sem {item.semester}</span>}
        <span>🏛 {item.department || "All Departments"}</span>
        <span>👤 {item.submittedBy?.name || "Student"}</span>
      </div>

      {item.attachments?.length > 0 && (
        <div className="file-list">
          {item.attachments.map((file, index) => (
            <a
              key={index}
              href={getFileUrl(file.url)}
              target="_blank"
              rel="noreferrer"
              className="file-chip"
            >
              {fileIcon[file.fileType] || "📎"} {file.originalName}
            </a>
          ))}
        </div>
      )}

      {item.fileUrl && (
        <a href={item.fileUrl} target="_blank" rel="noreferrer" className="file-chip">
          🔗 External Link
        </a>
      )}

      {adminActions && <div className="post-actions">{adminActions}</div>}
    </article>
  );
};

export default PostCard;
