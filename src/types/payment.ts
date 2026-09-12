export interface UnpaidItem {
  id: string;
  name: string;
  amount: number;
  purpose?: string;
  isMember?: boolean | string;
  quantity?: number;
  pickupDate?: string;
  returnDate?: string;
}

export interface PaymentHistoryItem {
  id: string;
  type: string;
  name: string;
  amount: number;
  date: string;
  status: string;
  note?: string;
  details?: string[];
}
