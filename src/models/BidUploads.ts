import { Timestamp } from "firebase/firestore";

export interface BidUpload {
    id: string;
    userId: string;
    title: string;
    description: string;

    fileName: string;
    fileType: string;
    fileSize: number;
    readableSize: string;

    storagePath: string;
    downloadURL: string;

    timeOfCreation: Timestamp;
}
