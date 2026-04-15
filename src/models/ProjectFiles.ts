import { Timestamp } from "firebase/firestore";

export interface ProjectFile {
    id: string;
    userId: string;
    bidFormId: string;
    title: string;
    description: string;
    uploadGroupId?: string;

    fileName: string;
    fileType: string;
    fileSize: number;
    readableSize: string;

    storagePath: string;
    downloadURL: string;

    createdAt: Timestamp;
}
