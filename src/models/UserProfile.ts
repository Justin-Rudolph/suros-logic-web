import { Timestamp } from "firebase/firestore";

export type UserProfile = {
  uid: string;

  displayName: string;
  companyName: string;
  companyAddress: string;
  slogan: string;

  phone: string;
  email: string;

  profileComplete: boolean;
  timeOfCreation: Timestamp;
};
