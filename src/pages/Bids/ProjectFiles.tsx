import React, { useEffect, useMemo, useState } from "react";
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
import { Trash2 } from "lucide-react";

import { firestore, storage, auth } from "@/lib/firebase";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { touchBidFormUpdatedAt } from "@/lib/touchBidForm";

import "./ProjectFiles.css";
import "./MyBids.css";
import { ProjectFile } from "@/models/ProjectFiles";

type ProjectFileGroup = {
    id: string;
    title: string;
    description: string;
    createdAt?: ProjectFile["createdAt"];
    files: ProjectFile[];
    totalSize: number;
};

type DeleteTarget =
    | { type: "file"; file: ProjectFile }
    | { type: "group"; group: ProjectFileGroup };

const MAX_UPLOAD_FILES = 10;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const formatFileSize = (bytes: number) => {
    if (!bytes) return "0.00 MB";
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const formatProjectFileDate = (value?: { toDate?: () => Date }) => {
    const date = value?.toDate?.();
    return date ? date.toLocaleDateString() : "Pending date";
};

export default function ProjectFiles() {
    const navigate = useNavigate();
    const { bidId } = useParams();
    const user = auth.currentUser;
    const { profile } = useAuth();

    const [uploads, setUploads] = useState<ProjectFile[]>([]);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");

    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [titleError, setTitleError] = useState(false);
    const [uploadValidationMessage, setUploadValidationMessage] = useState("");

    const [showBillingModal, setShowBillingModal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // --------------------------------------------------
    // LISTEN FOR USER UPLOADS
    // --------------------------------------------------
    useEffect(() => {
        if (!user || !bidId) return;

        const q = query(
            collection(firestore, "projectFiles"),
            where("userId", "==", user.uid),
            where("bidFormId", "==", bidId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: ProjectFile[] = [];
            snapshot.forEach((docSnap) => {
                list.push({
                    id: docSnap.id,
                    ...(docSnap.data() as ProjectFile),
                });
            });

            list.sort(
                (a, b) =>
                    (b.createdAt?.seconds || 0) -
                    (a.createdAt?.seconds || 0)
            );

            setUploads(list);
        });

        return unsubscribe;
    }, [user, bidId]);

    const fileGroups = useMemo<ProjectFileGroup[]>(() => {
        const groupsById = uploads.reduce<Record<string, ProjectFileGroup>>((acc, upload) => {
            const groupId = upload.uploadGroupId || upload.id;

            if (!acc[groupId]) {
                acc[groupId] = {
                    id: groupId,
                    title: upload.title,
                    description: upload.description,
                    createdAt: upload.createdAt,
                    files: [],
                    totalSize: 0,
                };
            }

            acc[groupId].files.push(upload);
            acc[groupId].totalSize += upload.fileSize || 0;

            const currentGroupTime = acc[groupId].createdAt?.seconds || 0;
            const uploadTime = upload.createdAt?.seconds || 0;
            if (uploadTime > currentGroupTime) {
                acc[groupId].createdAt = upload.createdAt;
            }

            return acc;
        }, {});

        return Object.values(groupsById)
            .map((group) => ({
                ...group,
                files: [...group.files].sort((a, b) => a.fileName.localeCompare(b.fileName)),
            }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }, [uploads]);

    // --------------------------------------------------
    // FILE SELECT
    // --------------------------------------------------
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (files.length > MAX_UPLOAD_FILES) {
            setUploadValidationMessage("You can upload a maximum of 10 files at once.");
            e.target.value = "";
            return;
        }

        const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
        if (oversizedFile) {
            setUploadValidationMessage(`${oversizedFile.name} is over 2 MB. Each file must be smaller than 2 MB.`);
            e.target.value = "";
            return;
        }

        setSelectedFiles(files);
        setShowUploadModal(true);
        e.target.value = "";
    };

    const handleUploadClick = () => {
        if (!profile?.isSubscribed) {
            setShowBillingModal(true);
            return;
        }

        document.getElementById("upload-file-input")?.click();
    };

    // --------------------------------------------------
    // UPLOAD
    // --------------------------------------------------
    const uploadProjectFile = async () => {
        if (selectedFiles.length === 0 || !title.trim() || !user || !bidId) return;

        try {
            setIsUploading(true);
            const uploadGroupId = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;

            await Promise.all(
                selectedFiles.map(async (selectedFile, index) => {
                    const storagePath = `projectFiles/${user.uid}/${bidId}/${uploadGroupId}/${index}-${selectedFile.name}`;
                    const fileRef = ref(storage, storagePath);

                    await uploadBytes(fileRef, selectedFile);
                    const downloadURL = await getDownloadURL(fileRef);

                    await addDoc(collection(firestore, "projectFiles"), {
                        userId: user.uid,
                        bidFormId: bidId,
                        uploadGroupId,
                        title,
                        description,
                        fileName: selectedFile.name,
                        fileType: selectedFile.type,
                        fileSize: selectedFile.size,
                        readableSize: formatFileSize(selectedFile.size),
                        storagePath,
                        downloadURL,
                        createdAt: serverTimestamp(),
                    });
                })
            );
            await touchBidFormUpdatedAt(bidId);

            setShowUploadModal(false);
            setSelectedFiles([]);
            setTitle("");
            setDescription("");
            setExpandedGroups((current) => ({ ...current, [uploadGroupId]: true }));

            setUploadSuccess(true);
            setTimeout(() => setUploadSuccess(false), 2000);

        } catch (err) {
            console.error("Upload failed:", err);
            alert("Upload failed. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    // --------------------------------------------------
    // DELETE
    // --------------------------------------------------
    const deleteProjectFileTarget = async () => {
        if (!deleteTarget || isDeleting) return;

        try {
            setIsDeleting(true);

            const filesToDelete =
                deleteTarget.type === "group" ? deleteTarget.group.files : [deleteTarget.file];

            await Promise.all(
                filesToDelete.map(async (file) => {
                    await deleteObject(ref(storage, file.storagePath));
                    await deleteDoc(doc(firestore, "projectFiles", file.id));
                })
            );
            await touchBidFormUpdatedAt(bidId);

            setDeleteTarget(null);

        } catch (err) {
            console.error("Delete failed:", err);
            alert("Delete failed. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleGroup = (groupId: string) => {
        setExpandedGroups((current) => ({
            ...current,
            [groupId]: !current[groupId],
        }));
    };

    return (
        <div className="past-bids-container bid-workspace-project-files-page">
            {fileGroups.length === 0 ? (
                <>
                    <div className="past-bids-empty">
                        No files uploaded yet.
                    </div>

                    <div className="bid-workspace-project-files-actions bid-workspace-project-files-actions-empty">
                        <button
                            className="past-bid-open"
                            onClick={handleUploadClick}
                        >
                            Upload File(s)
                        </button>
                        <div className="bid-workspace-project-files-upload-note">
                            Upload up to 10 files at once. Max file size is 2 MB per file.
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="bid-workspace-project-files-actions">
                        <button
                            className="past-bid-open"
                            onClick={handleUploadClick}
                        >
                            Upload File(s)
                        </button>
                        <div className="bid-workspace-project-files-upload-note">
                            Upload up to 10 files at once. Max file size is 2 MB per file.
                        </div>
                    </div>

                    <div className="change-order-list-wrap bid-workspace-project-files-list">
                        {fileGroups.map((group) => {
                            const isExpanded = expandedGroups[group.id] ?? false;
                            const fileCountLabel = `${group.files.length} ${group.files.length === 1 ? "file" : "files"}`;
                            const onlyFile = group.files[0];

                            return (
                                <div key={group.id} className="change-order-item bid-workspace-project-file-group">
                                    <div className="bid-workspace-project-file-group-row">
                                        <div className="change-order-content">
                                            <div className="change-order-title">{group.title}</div>
                                            {group.description ? (
                                                <div className="change-order-time">{group.description}</div>
                                            ) : null}
                                            <div className="change-order-time">
                                                {formatProjectFileDate(group.createdAt)} • {group.files.length === 1 && onlyFile ? onlyFile.fileName : fileCountLabel} • {formatFileSize(group.totalSize)}
                                            </div>
                                        </div>

                                        <div className="past-bid-actions">
                                            {group.files.length === 1 && onlyFile ? (
                                                <a
                                                    className="past-bid-open bid-workspace-project-file-open"
                                                    href={onlyFile.downloadURL}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Open
                                                </a>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="past-bid-open"
                                                    onClick={() => toggleGroup(group.id)}
                                                >
                                                    {isExpanded ? "Hide Files" : "Show Files"}
                                                </button>
                                            )}
                                            <button
                                                className="past-bid-delete-icon"
                                                onClick={() => setDeleteTarget({ type: "group", group })}
                                                aria-label="Delete project file group"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    {group.files.length > 1 && isExpanded && (
                                        <div className="bid-workspace-project-file-uploads">
                                            {group.files.map((item) => (
                                                <div key={item.id} className="bid-workspace-project-file-upload">
                                                    <div className="change-order-content">
                                                        <div className="change-order-title">{item.fileName}</div>
                                                        <div className="change-order-time">{item.readableSize || formatFileSize(item.fileSize)}</div>
                                                    </div>

                                                    <div className="past-bid-actions">
                                                        <a
                                                            className="past-bid-open bid-workspace-project-file-open"
                                                            href={item.downloadURL}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            Open
                                                        </a>
                                                        <button
                                                            className="past-bid-delete-icon"
                                                            onClick={() => setDeleteTarget({ type: "file", file: item })}
                                                            aria-label="Delete project file"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <input
                id="upload-file-input"
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,.doc,.docx"
                hidden
                multiple
                onChange={handleFileSelect}
            />

            {uploadSuccess && (
                <div className="alert-success fade-out">
                    File uploaded successfully.
                </div>
            )}

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

                        <div className="selected-files-summary">
                            {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"} selected • {formatFileSize(
                                selectedFiles.reduce((sum, file) => sum + file.size, 0)
                            )}
                        </div>
                        <div className="selected-files-list">
                            {selectedFiles.map((file) => (
                                <div className="selected-file-row" key={`${file.name}-${file.size}`}>
                                    <span>{file.name}</span>
                                    <span>{formatFileSize(file.size)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions">
                            <button
                                className="cancel-btn"
                                onClick={() => {
                                    setShowUploadModal(false);
                                    setSelectedFiles([]);
                                    setTitle("");
                                    setDescription("");
                                    setTitleError(false);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="confirm-btn"
                                disabled={isUploading}
                                style={{
                                    opacity: isUploading ? 0.6 : 1,
                                    cursor: isUploading ? "not-allowed" : "pointer",
                                }}
                                onClick={() => {
                                    if (isUploading) return; // extra safety

                                    if (!title.trim()) {
                                        setTitleError(true);
                                        return;
                                    }

                                    setTitleError(false);
                                    uploadProjectFile();
                                }}
                            >
                                {isUploading ? "Uploading..." : "Upload"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="billing-modal-overlay">
                    <div className="billing-modal">
                        <h2>
                            {deleteTarget.type === "group"
                                ? "Delete Project File Group?"
                                : "Delete Project File?"}
                        </h2>

                        <p>
                            {deleteTarget.type === "group"
                                ? `This will permanently delete “${deleteTarget.group.title}” and all ${deleteTarget.group.files.length} uploads inside it from this bid workspace.`
                                : `This will permanently delete “${deleteTarget.file.fileName}” from this bid workspace.`}
                        </p>

                        <div className="billing-modal-actions">
                            <button
                                className="secondary"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>

                            <button
                                className="danger"
                                disabled={isDeleting}
                                onClick={deleteProjectFileTarget}
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {uploadValidationMessage && (
                <div className="billing-modal-overlay">
                    <div className="billing-modal">
                        <h2>Upload Limit</h2>

                        <p>{uploadValidationMessage}</p>

                        <div className="billing-modal-actions">
                            <button
                                className="primary"
                                onClick={() => setUploadValidationMessage("")}
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBillingModal && (
                <div className="billing-modal-overlay">
                    <div className="billing-modal">
                        <h2>Subscription Inactive</h2>

                        <p>
                            Your subscription is currently inactive. Manage your subscription to upload project files.
                        </p>

                        <div className="billing-modal-actions">
                            <button
                                className="secondary"
                                onClick={() => setShowBillingModal(false)}
                            >
                                Cancel
                            </button>

                            <button
                                className="primary"
                                onClick={() => {
                                    setShowBillingModal(false);
                                    navigate("/billing");
                                }}
                            >
                                Manage Subscription
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
