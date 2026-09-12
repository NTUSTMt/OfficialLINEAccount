export interface AdminEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  deadline: string;
  cost: string;
  status: '開放' | '未來開放' | '關閉' | string;
  shortDesc: string;
  fullDesc: string;
  imageUrl: string;
  driveFolderUrl?: string;
  spreadsheetUrl?: string;
  stats: {
    total: number;
    accepted: number;
    waitlisted: number;
    pending: number;
  };
  rowNumber?: number;
}

export interface SignupApplicant {
  rowNumber: number;
  signupCode: string;
  userId: string;
  name: string;
  gender: string;
  phone: string;
  lineId: string;
  email?: string;
  address?: string;
  birthday?: string;
  idNumber?: string;
  emerName?: string;
  emerPhone?: string;
  emerRel?: string;
  emerAddr?: string;
  experience?: string;
  fitnessTest?: string;
  strengthProof: string;
  department?: string;
  studentId?: string;
  medicalHistory?: string;
  isOfficial: string;
  reviewResult: string;
  notifyStatus: string;
  payStatus: string;
  remark?: string;
}

export interface UserRegisteredActivity {
  code: string;
  eventId: string;
  eventName: string;
  status: string;
  payStatus: string;
  date: string;
  canCancel: boolean;
  cancelDisabledReason?: string;
  note?: string;
}
