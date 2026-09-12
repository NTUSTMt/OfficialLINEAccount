export interface Equipment {
  id: string;
  name: string;
  remainQty: number;
  price: number;
  priceExtra?: number;
  imageUrl?: string;
  description?: string;
  category?: string;
  deposit?: number;
  rentPerDay?: number;
  availableQty?: number;
  totalQty?: number;
  status?: string;
  spec?: string;
}

export interface EquipmentCartItem {
  equipment: Equipment;
  quantity: number;
}

export interface LoanRecord {
  orderId: string;
  equipId: string;
  name: string;
  qty: number;
  status: string;
  payStatus: string;
  pickupDate: string;
  returnDate: string;
  canCancel: boolean;
}
