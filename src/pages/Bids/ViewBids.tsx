import React, { useEffect, useState } from "react";
import {
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    deleteDoc,
    doc,
    serverTimestamp,
} from "firebase/firestore";
import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
} from "firebase/storage";

import { firestore, storage, auth } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";

import "./ViewBids.css";
import "../Dashboard/Dashboard.css";
import { BidUpload } from "@/models/BidUploads";

export default function ViewBids() {
    const navigate = useNavigate();
    const user = auth.currentUser;

    const [uploads, setUploads] = useState<BidUpload[]>([]);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");

    const [deleteTarget, setDeleteTarget] = useState<BidUpload | null>(null);

    const [titleError, setTitleError] = useState(false);


    // --------------------------------------------------
    // LISTEN FOR USER UPLOADS
    // --------------------------------------------------
    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(firestore, "bidUploads"),
            where("userId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: BidUpload[] = [];
            snapshot.forEach((docSnap) => {
                list.push({
                    id: docSnap.id,
                    ...(docSnap.data() as BidUpload),
                });
            });

            list.sort(
                (a, b) =>
                    (b.timeOfCreation?.seconds || 0) -
                    (a.timeOfCreation?.seconds || 0)
            );

            setUploads(list);
        });

        return unsubscribe;
    }, [user]);

    // --------------------------------------------------
    // FILE SELECT
    // --------------------------------------------------
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert("File must be under 2MB.");
            e.target.value = "";
            return;
        }

        setSelectedFile(file);
        setShowUploadModal(true);
    };

    // --------------------------------------------------
    // UPLOAD
    // --------------------------------------------------
    const uploadBid = async () => {
        if (!selectedFile || !title.trim() || !user) return;

        const storagePath = `bids/${user.uid}/${Date.now()}-${selectedFile.name}`;
        const fileRef = ref(storage, storagePath);

        await uploadBytes(fileRef, selectedFile);
        const downloadURL = await getDownloadURL(fileRef);

        await addDoc(collection(firestore, "bidUploads"), {
            userId: user.uid,
            title,
            description,
            fileName: selectedFile.name,
            fileType: selectedFile.type,
            fileSize: selectedFile.size,
            readableSize:
                (selectedFile.size / 1024 / 1024).toFixed(2) + " MB",
            storagePath,
            downloadURL,
            timeOfCreation: serverTimestamp(),
        });

        setShowUploadModal(false);
        setSelectedFile(null);
        setTitle("");
        setDescription("");
        setUploadSuccess(true);
        setTimeout(() => {
            setUploadSuccess(false);
        }, 2000);

    };

    // --------------------------------------------------
    // DELETE
    // --------------------------------------------------
    const deleteBid = async () => {
        if (!deleteTarget) return;

        await deleteDoc(doc(firestore, "bidUploads", deleteTarget.id));
        await deleteObject(ref(storage, deleteTarget.storagePath));

        setDeleteTarget(null);
    };

    return (
        <div className="suros-gradient viewbids-page">
            <button
                onClick={() => navigate("/")}
                style={{
                    position: "fixed",
                    top: "20px",
                    left: "20px",
                    background: "#1e73be",
                    color: "#fff",
                    padding: "10px 18px",
                    fontSize: "15px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: 600,
                    border: "none",
                    zIndex: 10
                }}
            >
                ← Back
            </button>

            <div className="viewbids-container">
                <h1 className="dashboard-title">My Bids</h1>
                <p className="dashboard-subtitle">
                    A centralized place to store, organize, and access all of your bids.
                </p>

                {/* CENTERED UPLOAD (NO FILES) */}
                {uploads.length === 0 && (
                    <div className="empty-upload-center">
                        <label className="upload-btn upload-btn-large">
                            Upload File
                            <input
                                type="file"
                                accept=".png,.jpg,.jpeg,.pdf,.doc,.docx"
                                hidden
                                onChange={handleFileSelect}
                            />
                        </label>
                    </div>
                )}

                {/* TOP RIGHT UPLOAD (FILES EXIST) */}
                {uploads.length > 0 && (
                    <>
                        <button
                            onClick={() =>
                                document.getElementById("upload-file-input")?.click()
                            }
                            style={{
                                position: "fixed",
                                top: "20px",
                                right: "20px",
                                background: "#1e73be",
                                color: "#fff",
                                padding: "10px 18px",
                                fontSize: "15px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontWeight: 600,
                                border: "none",
                                zIndex: 10,
                            }}
                        >
                            Upload File
                        </button>

                        <input
                            id="upload-file-input"
                            type="file"
                            accept=".png,.jpg,.jpeg,.pdf,.doc,.docx"
                            hidden
                            onChange={handleFileSelect}
                        />
                    </>
                )}


                {/* SUCCESS ALERT */}
                {uploadSuccess && (
                    <div className="alert-success fade-out">
                        Upload completed successfully!
                    </div>
                )}


                {/* FILE LIST */}
                {uploads.length > 0 && (
                    <div className="file-list-wrapper">
                        <ul className="file-list">
                            {uploads.map((item) => (
                                <li key={item.id} className="file-item file-item-wide">
                                    <div className="file-left">
                                        <p className="file-title">{item.title}</p>
                                        <p className="file-description">{item.description}</p>
                                        <p className="file-meta">
                                            {item.fileName} • {item.readableSize}
                                        </p>
                                    </div>

                                    <div className="file-actions">
                                        <a
                                            href={item.downloadURL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Open
                                        </a>
                                        <button
                                            className="delete-btn"
                                            onClick={() => setDeleteTarget(item)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* UPLOAD MODAL */}
            {showUploadModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <label>Title</label>
                        <input
                            className="modal-input"
                            style={{
                                borderColor: titleError ? "#ff4d4f" : undefined
                            }}
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
                                if (titleError) setTitleError(false);
                            }}
                        />

                        {titleError && (
                            <p style={{ color: "#ff4d4f", fontSize: "0.85rem", marginTop: "-10px" }}>
                                Title is required
                            </p>
                        )}


                        <label>Description</label>
                        <textarea
                            className="modal-textarea"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />

                        <div className="modal-actions">
                            <button
                                className="cancel-btn"
                                onClick={() => setShowUploadModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="confirm-btn"
                                onClick={() => {
                                    if (!title.trim()) {
                                        setTitleError(true);
                                        return;
                                    }
                                    setTitleError(false);
                                    uploadBid();
                                }}
                            >
                                Upload
                            </button>

                        </div>
                    </div>
                </div>
            )}

            {/* DELETE MODAL */}
            {deleteTarget && (
                <div className="modal-overlay">
                    <div className="modal delete-modal">
                        <h2 className="delete-title">Delete Bid</h2>

                        <p className="delete-message">
                            Are you sure you want to permanently delete
                            <strong> “{deleteTarget.title}”</strong>?
                        </p>

                        <p className="delete-warning">
                            This action cannot be undone.
                        </p>

                        <div className="delete-actions">
                            <button
                                className="delete-cancel-btn"
                                onClick={() => setDeleteTarget(null)}
                            >
                                Cancel
                            </button>

                            <button
                                className="delete-confirm-btn"
                                onClick={deleteBid}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
